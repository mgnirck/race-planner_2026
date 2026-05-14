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

    const { inputs = {}, targets = {}, selection, region = 'us', lang = 'en' } = req.body ?? {}

    const { rows } = await sql`
      INSERT INTO plans (
        user_id, race_name, race_date, race_type,
        goal_minutes, conditions, effort,
        inputs, targets, selection, region, lang
      ) VALUES (
        ${user.id},
        ${inputs.race_name ?? null},
        ${inputs.race_date ?? null},
        ${targets.race_type ?? inputs.race_type ?? null},
        ${targets.total_duration_minutes ?? null},
        ${inputs.conditions ?? targets.conditions ?? null},
        ${inputs.effort ?? targets.effort ?? null},
        ${JSON.stringify(inputs)},
        ${JSON.stringify(targets)},
        ${JSON.stringify(selection ?? [])},
        ${region},
        ${lang}
      )
      RETURNING id
    `

    return res.status(201).json({ planId: rows[0].id })
  } catch (err) {
    console.error('[plans/save] error:', err)
    return res.status(500).json({ error: 'Failed to save plan' })
  }
}
