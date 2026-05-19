import { sql, ensureMigrated } from './db.js'

async function getUser(req) {
  const auth = req.headers.authorization ?? ''
  const userId = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
  if (!userId) return null
  const { rows } = await sql`SELECT id FROM users WHERE id = ${userId} LIMIT 1`
  return rows[0] ?? null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password')

  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    await ensureMigrated()
  } catch (err) {
    console.error('[feedback] migrate error:', err)
  }

  // ── GET — admin list ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const adminPassword = process.env.VITE_ADMIN_PASSWORD
    const provided = req.headers['x-admin-password'] ?? ''
    if (!adminPassword || provided !== adminPassword) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      const { rows } = await sql`
        SELECT
          f.id, f.submitted_at, f.rating, f.hit_carb_target,
          f.gi_issues, f.plan_felt_right, f.notes,
          p.race_type, p.conditions, p.goal_minutes, p.region, p.race_date
        FROM feedback f
        JOIN plans p ON p.id = f.plan_id
        ORDER BY f.submitted_at DESC
      `
      return res.status(200).json(rows)
    } catch (err) {
      console.error('[feedback] list error:', err)
      return res.status(500).json({ error: 'Failed to list feedback' })
    }
  }

  // ── POST — save feedback (user-authenticated) ────────────────────────────────
  if (req.method === 'POST') {
    try {
      const user = await getUser(req)
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      const { planId, rating, hit_carb_target, gi_issues, plan_felt_right, notes } = req.body ?? {}

      if (!planId) return res.status(400).json({ error: 'planId is required' })
      if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be 1–5' })

      const { rows: planRows } = await sql`
        SELECT id FROM plans WHERE id = ${planId} AND user_id = ${user.id} LIMIT 1
      `
      if (planRows.length === 0) return res.status(404).json({ error: 'Plan not found' })

      await sql`
        INSERT INTO feedback (plan_id, rating, hit_carb_target, gi_issues, plan_felt_right, notes)
        VALUES (${planId}, ${rating}, ${hit_carb_target ?? null}, ${gi_issues ?? null}, ${plan_felt_right ?? null}, ${notes ?? null})
      `
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('[feedback] save error:', err)
      return res.status(500).json({ error: 'Failed to save feedback' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
