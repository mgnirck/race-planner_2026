import { sql, ensureMigrated } from '../db.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const adminPassword = process.env.VITE_ADMIN_PASSWORD
  const provided      = req.headers['x-admin-password'] ?? ''

  if (!adminPassword || provided !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    await ensureMigrated()

    const { rows } = await sql`
      SELECT
        f.id,
        f.submitted_at,
        f.rating,
        f.hit_carb_target,
        f.gi_issues,
        f.plan_felt_right,
        f.notes,
        p.race_type,
        p.conditions,
        p.goal_minutes,
        p.region,
        p.race_date
      FROM feedback f
      JOIN plans p ON p.id = f.plan_id
      ORDER BY f.submitted_at DESC
    `

    return res.status(200).json(rows)
  } catch (err) {
    console.error('[feedback/list] error:', err)
    return res.status(500).json({ error: 'Failed to list feedback' })
  }
}
