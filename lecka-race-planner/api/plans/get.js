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

    // Auth is optional — plans are publicly readable by their UUID.
    // We resolve the caller identity only to set the isOwner flag.
    const user = await getUser(req)

    const { planId } = req.query ?? {}
    if (!planId) return res.status(400).json({ error: 'planId is required' })

    // Fetch the plan by ID only — no user_id filter so any caller with the
    // UUID can read it.  user_id is fetched here but stripped before returning.
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
    const isOwner = user ? user.id === user_id : false

    return res.status(200).json({ ...publicPlan, isOwner })
  } catch (err) {
    console.error('[plans/get] error:', err)
    return res.status(500).json({ error: 'Failed to get plan' })
  }
}
