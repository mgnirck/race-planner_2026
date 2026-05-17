import { sql, ensureMigrated } from '../db.js'
import regionsConfig from '../../src/config/regions.json' assert { type: 'json' }

const SUPPORTED_LANGS = ['en', 'de', 'da', 'fr', 'vi']
const VALID_REGIONS = Object.keys(regionsConfig)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!token) {
    return res.status(401).json({ error: 'Authorization header required' })
  }

  const { preferred_region, preferred_lang } = req.body ?? {}

  if (preferred_region !== undefined && !VALID_REGIONS.includes(preferred_region)) {
    return res.status(400).json({ error: 'Invalid region' })
  }
  if (preferred_lang !== undefined && !SUPPORTED_LANGS.includes(preferred_lang)) {
    return res.status(400).json({ error: 'Invalid language' })
  }

  try {
    await ensureMigrated()

    await sql`
      UPDATE users
      SET
        preferred_region = COALESCE(${preferred_region ?? null}, preferred_region),
        preferred_lang   = COALESCE(${preferred_lang ?? null},   preferred_lang)
      WHERE id = ${token}
    `

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[preferences] error:', err)
    return res.status(500).json({ error: 'Failed to update preferences' })
  }
}
