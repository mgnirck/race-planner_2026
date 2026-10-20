import { sql, ensureMigrated, getUserFromRequest, revokeSession } from '../_lib/db.js'
import regionsConfig from '../../src/config/regions.json' with { type: 'json' }

const SUPPORTED_LANGS = ['en', 'de', 'da', 'fr', 'vi']
const VALID_REGIONS = Object.keys(regionsConfig)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    await ensureMigrated()

    // ── DELETE — log out (revoke this session). Always 200: logging out twice is fine.
    if (req.method === 'DELETE') {
      await revokeSession(req)
      return res.status(200).json({ ok: true })
    }

    const user = await getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT id, email, created_at, weight_kg, weight_unit, gender,
               athlete_profile, caffeine_ok, dist_unit,
               preferred_region, preferred_lang
        FROM users
        WHERE id = ${user.id}
        LIMIT 1
      `
      if (rows.length === 0) return res.status(401).json({ error: 'User not found' })
      return res.status(200).json(rows[0])
    }

    if (req.method === 'PATCH') {
      const { preferred_region, preferred_lang } = req.body ?? {}

      if (preferred_region !== undefined && !VALID_REGIONS.includes(preferred_region)) {
        return res.status(400).json({ error: 'Invalid region' })
      }
      if (preferred_lang !== undefined && !SUPPORTED_LANGS.includes(preferred_lang)) {
        return res.status(400).json({ error: 'Invalid language' })
      }

      await sql`
        UPDATE users
        SET
          preferred_region = COALESCE(${preferred_region ?? null}, preferred_region),
          preferred_lang   = COALESCE(${preferred_lang ?? null},   preferred_lang)
        WHERE id = ${user.id}
      `
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[me] error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
