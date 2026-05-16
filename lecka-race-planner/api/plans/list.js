import { sql, ensureMigrated } from '../db.js'

async function getUser(req) {
  const auth = req.headers.authorization ?? ''
  const userId = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
  if (!userId) return null
  const { rows } = await sql`SELECT id FROM users WHERE id = ${userId} LIMIT 1`
  return rows[0] ?? null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    await ensureMigrated()

    // ── GET ?planId=xxx — public plan lookup (replaces /api/plans/get) ─────────
    // Plans are publicly readable by UUID. Auth is optional: only sets isOwner.
    const { planId } = req.query ?? {}
    if (planId) {
      const user = await getUser(req)

      const { rows } = await sql`
        SELECT id, race_name, race_date, race_type, goal_minutes,
               conditions, effort, inputs, targets, selection,
               region, lang, user_id
        FROM plans
        WHERE id = ${planId}
        LIMIT 1
      `
      if (rows.length === 0) return res.status(404).json({ error: 'Plan not found' })

      const { user_id, ...publicPlan } = rows[0]
      return res.status(200).json({ ...publicPlan, isOwner: user ? user.id === user_id : false })
    }

    // ── GET — list user's own plans (requires auth) ────────────────────────────
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { rows } = await sql`
      SELECT
        p.id, p.race_name, p.race_type, p.goal_minutes,
        p.race_date, p.created_at, p.conditions,
        EXISTS(SELECT 1 FROM feedback f WHERE f.plan_id = p.id) AS has_feedback
      FROM plans p
      WHERE p.user_id = ${user.id}
      ORDER BY p.created_at DESC
    `
    return res.status(200).json(rows)
  } catch (err) {
    console.error('[plans/list] error:', err)
    return res.status(500).json({ error: 'Failed' })
  }
}
