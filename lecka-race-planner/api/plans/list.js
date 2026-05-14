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

    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { rows } = await sql`
      SELECT id, race_name, race_type, goal_minutes, race_date, created_at, conditions
      FROM plans
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `

    return res.status(200).json(rows)
  } catch (err) {
    console.error('[plans/list] error:', err)
    return res.status(500).json({ error: 'Failed to list plans' })
  }
}
