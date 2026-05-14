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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    await ensureMigrated()

    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { planId, rating, hit_carb_target, gi_issues, plan_felt_right, notes } = req.body ?? {}

    if (!planId) return res.status(400).json({ error: 'planId is required' })
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be 1–5' })

    // Verify the plan belongs to this user
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
    console.error('[feedback/save] error:', err)
    return res.status(500).json({ error: 'Failed to save feedback' })
  }
}
