import { sql, ensureMigrated } from './db.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()

  try {
    await ensureMigrated()

    const { rows: plans } = await sql`
      SELECT id, race_lat, race_lng, race_start_time, race_date,
             weather_estimated_temp, weather_live_temp_c
      FROM plans
      WHERE race_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
        AND race_lat IS NOT NULL
        AND race_lng IS NOT NULL
        AND inputs->>'mode' = 'pro'
      LIMIT 50
    `

    let updated = 0

    for (const plan of plans) {
      try {
        const date = plan.race_date.toISOString?.().split('T')[0] ?? String(plan.race_date).split('T')[0]
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${plan.race_lat}&longitude=${plan.race_lng}&hourly=temperature_2m,precipitation_probability&start_date=${date}&end_date=${date}&timezone=auto`
        const weatherRes = await fetch(url)
        if (!weatherRes.ok) continue

        const weatherData = await weatherRes.json()
        const temps = weatherData?.hourly?.temperature_2m ?? []
        const precip = weatherData?.hourly?.precipitation_probability ?? []

        let forecastTemp = null
        if (plan.race_start_time && temps.length > 0) {
          const hour = parseInt(plan.race_start_time.split(':')[0], 10)
          forecastTemp = temps[Math.min(hour, temps.length - 1)]
        } else if (temps.length > 0) {
          forecastTemp = temps.reduce((a, b) => a + b, 0) / temps.length
        }

        if (forecastTemp === null) continue

        await sql`
          UPDATE plans SET
            weather_live_temp_c   = ${Math.round(forecastTemp * 10) / 10},
            weather_last_fetched  = NOW()
          WHERE id = ${plan.id}
        `
        updated++
      } catch (planErr) {
        console.error(`[weather-update] plan ${plan.id} failed:`, planErr.message)
      }
    }

    return res.status(200).json({ ok: true, updated, checked: plans.length })
  } catch (err) {
    console.error('[weather-update] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
