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

    const { planId } = req.query ?? {}
    if (!planId) return res.status(400).json({ error: 'planId is required' })

    const { rows } = await sql`
      SELECT *
      FROM plans
      WHERE id = ${planId} AND user_id = ${user.id}
      LIMIT 1
    `

    if (rows.length === 0) return res.status(404).json({ error: 'Plan not found' })

    return res.status(200).json(rows[0])
  } catch (err) {
    console.error('[plans/get] error:', err)
    return res.status(500).json({ error: 'Failed to get plan' })
  }
}
