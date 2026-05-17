import { sql, ensureMigrated } from '../db.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!token) {
    return res.status(401).json({ error: 'Authorization header required' })
  }

  try {
    await ensureMigrated()

    const { rows } = await sql`
      SELECT id, email, created_at, weight_kg, weight_unit, gender,
             athlete_profile, caffeine_ok, dist_unit,
             preferred_region, preferred_lang
      FROM users
      WHERE id = ${token}
      LIMIT 1
    `

    if (rows.length === 0) {
      return res.status(401).json({ error: 'User not found' })
    }

    return res.status(200).json(rows[0])
  } catch (err) {
    console.error('[me] error:', err)
    return res.status(500).json({ error: 'Failed to fetch user' })
  }
}
