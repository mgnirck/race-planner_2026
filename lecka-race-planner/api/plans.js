import { sql, ensureMigrated } from './db.js'

async function getUser(req) {
  const auth = req.headers.authorization ?? ''
  const userId = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
  if (!userId) return null
  const { rows } = await sql`SELECT id FROM users WHERE id = ${userId} LIMIT 1`
  return rows[0] ?? null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    await ensureMigrated()

    // ── GET ?planId=xxx — public plan lookup ──────────────────────────────────
    // ── GET             — list user's own plans (requires auth) ───────────────
    if (req.method === 'GET') {
      const { planId } = req.query ?? {}

      if (planId) {
        const user = await getUser(req)
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
        return res.status(200).json({ ...publicPlan, isOwner: user ? user.id === user_id : false })
      }

      const user = await getUser(req)
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      const { rows } = await sql`
        SELECT
          p.id, p.race_name, p.race_type, p.goal_minutes,
          p.race_date, p.created_at, p.conditions,
          COALESCE(
            p.inputs->>'mode',
            CASE WHEN p.targets->>'effort' IS NOT NULL THEN 'pro' ELSE 'quick' END
          ) AS mode,
          EXISTS(SELECT 1 FROM feedback f WHERE f.plan_id = p.id) AS has_feedback
        FROM plans p
        WHERE p.user_id = ${user.id}
        ORDER BY p.created_at DESC
      `
      return res.status(200).json(rows)
    }

    // ── POST — save new plan (requires auth) ──────────────────────────────────
    if (req.method === 'POST') {
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
          ${inputs.race_name || null},
          ${inputs.race_date || null},
          ${targets.race_type ?? inputs.race_type ?? null},
          ${targets.total_duration_minutes ?? null},
          ${inputs.conditions ?? targets.conditions ?? null},
          ${inputs.effort ?? targets.effort ?? null},
          ${JSON.stringify(inputs)}::jsonb,
          ${JSON.stringify(targets)}::jsonb,
          ${JSON.stringify(selection ?? [])}::jsonb,
          ${region},
          ${lang}
        )
        RETURNING id
      `
      if (inputs.race_city && inputs.race_city.trim()) {
        try {
          const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputs.race_city)}&format=json&limit=1`
          const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'LeckaRacePlanner/1.0 (info@getlecka.com)' } })
          if (geoRes.ok) {
            const geoData = await geoRes.json()
            if (geoData.length > 0) {
              const { lat, lon } = geoData[0]
              await sql`
                UPDATE plans SET
                  race_city = ${inputs.race_city.trim()},
                  race_lat  = ${parseFloat(lat)},
                  race_lng  = ${parseFloat(lon)},
                  race_start_time = ${inputs.race_start_time ?? null}
                WHERE id = ${rows[0].id}
              `
            }
          }
        } catch (geoErr) {
          console.error('[plans/POST] geocoding failed (non-fatal):', geoErr.message)
        }
      }

      return res.status(201).json({ planId: rows[0].id })
    }

    // ── PATCH — update plan metadata or checkpoints (requires auth + ownership) ─
    if (req.method === 'PATCH') {
      const user = await getUser(req)
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      const { planId, race_date, race_name, checkpoints, segmentData, fuel_reminder_date, weather_confirmed } = req.body ?? {}
      if (!planId) return res.status(400).json({ error: 'planId is required' })

      // Checkpoint save action
      if (checkpoints !== undefined) {
        const { rows } = await sql`
          UPDATE plans
          SET inputs = inputs || jsonb_build_object(
            'checkpoints', ${JSON.stringify(checkpoints)}::jsonb,
            'segmentData',  ${JSON.stringify(segmentData ?? [])}::jsonb
          )
          WHERE id = ${planId} AND user_id = ${user.id}
          RETURNING id
        `
        if (rows.length === 0) return res.status(404).json({ error: 'Plan not found' })
        return res.status(200).json({ ok: true, planId: rows[0].id })
      }

      if (fuel_reminder_date !== undefined) {
        const { rows } = await sql`
          UPDATE plans
          SET fuel_reminder_date = ${fuel_reminder_date ?? null},
              fuel_reminder_sent = false
          WHERE id = ${planId} AND user_id = ${user.id}
          RETURNING id, fuel_reminder_date
        `
        if (rows.length === 0) return res.status(404).json({ error: 'Plan not found' })
        return res.status(200).json(rows[0])
      }

      if (weather_confirmed !== undefined) {
        const { rows } = await sql`
          UPDATE plans
          SET weather_confirmed = ${Boolean(weather_confirmed)}
          WHERE id = ${planId} AND user_id = ${user.id}
          RETURNING id, weather_confirmed
        `
        if (rows.length === 0) return res.status(404).json({ error: 'Plan not found' })
        return res.status(200).json(rows[0])
      }

      if (race_name !== undefined) {
        const { rows } = await sql`
          UPDATE plans
          SET race_name = ${race_name || null}
          WHERE id = ${planId} AND user_id = ${user.id}
          RETURNING id, race_name
        `
        if (rows.length === 0) return res.status(404).json({ error: 'Plan not found' })
        return res.status(200).json(rows[0])
      }

      const { rows } = await sql`
        UPDATE plans
        SET race_date = ${race_date ?? null}
        WHERE id = ${planId} AND user_id = ${user.id}
        RETURNING id, race_date
      `
      if (rows.length === 0) return res.status(404).json({ error: 'Plan not found' })
      return res.status(200).json(rows[0])
    }

    // ── DELETE — remove plan (requires auth + ownership) ─────────────────────
    if (req.method === 'DELETE') {
      const user = await getUser(req)
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      const { planId } = req.body ?? {}
      if (!planId) return res.status(400).json({ error: 'planId is required' })

      const { rows } = await sql`
        DELETE FROM plans
        WHERE id = ${planId} AND user_id = ${user.id}
        RETURNING id
      `
      if (rows.length === 0) return res.status(404).json({ error: 'Plan not found' })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[plans] error:', err)
    return res.status(500).json({ error: 'Failed' })
  }
}
