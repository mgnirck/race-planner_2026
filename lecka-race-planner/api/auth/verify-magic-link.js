import { sql, ensureMigrated } from '../db.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token } = req.body ?? {}
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token is required' })
  }

  try {
    await ensureMigrated()

    const { rows } = await sql`
      SELECT id, email, expires_at, used
      FROM magic_links
      WHERE token = ${token}
      LIMIT 1
    `

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const link = rows[0]

    if (link.used) {
      return res.status(401).json({ error: 'Token already used' })
    }

    if (new Date(link.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Token expired' })
    }

    await sql`
      UPDATE magic_links SET used = true WHERE id = ${link.id}
    `

    // Upsert user (may already exist from send step)
    const { rows: userRows } = await sql`
      INSERT INTO users (email) VALUES (${link.email})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id, email
    `

    const user = userRows[0]

    return res.status(200).json({ success: true, userId: user.id, email: user.email })
  } catch (err) {
    console.error('[verify-magic-link] error:', err)
    return res.status(500).json({ error: 'Verification failed' })
  }
}
