import { sql, ensureMigrated } from './_lib/db.js'
import { Resend } from 'resend'
import { createRequire } from 'module'

const resend = new Resend(process.env.RESEND_API_KEY)

const _require = createRequire(import.meta.url)
const REGIONS  = _require('../src/config/regions.json')

async function runWeatherUpdate() {
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
          weather_live_temp_c  = ${Math.round(forecastTemp * 10) / 10},
          weather_last_fetched = NOW()
        WHERE id = ${plan.id}
      `
      updated++
    } catch (planErr) {
      console.error(`[cron/weather] plan ${plan.id} failed:`, planErr.message)
    }
  }

  return { updated, checked: plans.length }
}

async function runSendReminders() {
  const { rows } = await sql`
    SELECT p.id, p.race_name, p.race_date, p.race_type, p.inputs,
           u.email
    FROM plans p
    JOIN users u ON u.id = p.user_id
    WHERE p.fuel_reminder_date = CURRENT_DATE
      AND p.fuel_reminder_sent = false
      AND u.email IS NOT NULL
    LIMIT 50
  `

  let sent = 0

  for (const plan of rows) {
    try {
      const raceName = plan.race_name || plan.race_type?.replace(/_/g, ' ') || 'your race'
      const raceDate = plan.race_date
        ? new Date(plan.race_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : ''

      await resend.emails.send({
        from: 'Lecka <info@getlecka.com>',
        to: [plan.email],
        subject: `Reminder: order your fuel for ${raceName}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <img src="https://plan.getlecka.com/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" style="height:28px;margin-bottom:24px" />
            <p style="font-size:16px;color:#111">Hey! You set a reminder to order your fuel for <strong>${raceName}</strong>${raceDate ? ` on ${raceDate}` : ''}.</p>
            <a href="https://plan.getlecka.com/plan/${plan.id}"
               style="display:inline-block;margin:24px 0;padding:14px 28px;background:#1D9E75;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
              View my plan →
            </a>
            <p style="font-size:13px;color:#666">Real food. Real performance.</p>
          </div>
        `,
      })

      await sql`UPDATE plans SET fuel_reminder_sent = true WHERE id = ${plan.id}`
      sent++
    } catch (err) {
      console.error(`[cron/reminder] plan ${plan.id} failed:`, err.message)
    }
  }

  return { sent }
}

async function runSendPostRaceLogReminders() {
  // Find plans where race_date was yesterday, no log email sent yet,
  // and no feedback record exists.
  const { rows } = await sql`
    SELECT p.id, p.race_name, p.race_type,
           u.email
    FROM plans p
    JOIN users u ON u.id = p.user_id
    WHERE p.race_date = CURRENT_DATE - INTERVAL '1 day'
      AND p.post_race_log_sent = false
      AND u.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM feedback f WHERE f.plan_id = p.id
      )
    LIMIT 50
  `

  let sent = 0

  for (const plan of rows) {
    try {
      const raceName = plan.race_name || plan.race_type?.replace(/_/g, ' ') || 'your race'
      const logUrl = `https://plan.getlecka.com/feedback/${plan.id}`

      await resend.emails.send({
        from: 'Lecka <info@getlecka.com>',
        to: [plan.email],
        subject: `How did ${raceName} go?`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <img src="https://plan.getlecka.com/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" style="height:28px;margin-bottom:24px" />
            <p style="font-size:16px;color:#111">You raced <strong>${raceName}</strong> yesterday. Nice work getting to the start line.</p>
            <p style="font-size:15px;color:#444;margin-top:12px">Log what you used, what you skipped, and how the nutrition held up. It takes 2 minutes and helps you race smarter next time.</p>
            <a href="${logUrl}"
               style="display:inline-block;margin:24px 0;padding:14px 28px;background:#1D9E75;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
              Log my race →
            </a>
            <p style="font-size:13px;color:#666">Real food. Real performance.</p>
          </div>
        `,
      })

      await sql`UPDATE plans SET post_race_log_sent = true WHERE id = ${plan.id}`
      sent++
    } catch (err) {
      console.error(`[cron/post-race-log] plan ${plan.id} failed:`, err.message)
    }
  }

  return { sent }
}

// ── Nightly cart-link check ────────────────────────────────────────────────────
// Compares every variant the live planner can put in a cart (GET /api/products —
// database + static fallback, exactly what customers get) against each Shopify
// store's public /products.json. Emails ALERT_EMAIL when a cart link would fail
// (DEAD), a variant is sold out, or a price differs. Sends an "all clear" on Mondays
// so silence never means "the check stopped running".

const ALERT_EMAIL  = process.env.ALERT_EMAIL || 'info@getlecka.com'
const PLANNER_HOST = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'plan.getlecka.com'

async function fetchStoreVariants(storeUrl) {
  const variants = new Map()
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(`${storeUrl}/products.json?limit=250&page=${page}`, {
      headers: { 'User-Agent': 'LeckaVariantCheck/1.0 (info@getlecka.com)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { products } = await res.json()
    if (!products?.length) break
    for (const p of products) for (const v of p.variants) {
      variants.set(String(v.id), { title: `${p.title} / ${v.title}`, price: Number(v.price), available: v.available })
    }
  }
  return variants
}

export async function runVariantCheck({ send = true, catalog = null, now = new Date() } = {}) {
  if (!catalog) {
    const res = await fetch(`https://${PLANNER_HOST}/api/products`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`planner /api/products HTTP ${res.status}`)
    catalog = await res.json()
  }

  const dead = [], soldOut = [], price = [], skipped = [], checked = []

  for (const [region, cfg] of Object.entries(REGIONS)) {
    if (cfg.type !== 'shopify') continue
    let live
    try {
      live = await fetchStoreVariants(cfg.store_url)
    } catch (err) {
      skipped.push(`${region.toUpperCase()} (${err.message})`)
      continue
    }
    checked.push(region.toUpperCase())

    for (const p of catalog) {
      for (const v of p.regions?.[region]?.variants ?? []) {
        const vid = String(v.shopify_variant_id ?? '')
        if (!/^\d+$/.test(vid)) continue // placeholders are never added to carts
        const label = `${region.toUpperCase()} · ${p.name ?? p.id} · ${v.units_per_pack}-pack`
        const hit = live.get(vid)
        if (!hit) { dead.push(`${label} · variant ${vid}`); continue }
        if (!hit.available) soldOut.push(`${label} (${hit.title})`)
        if (Math.abs(hit.price - Number(v.price)) > 0.01) {
          price.push(`${label} · planner ${v.price} / store ${hit.price}`)
        }
      }
    }
  }

  const issues   = dead.length + soldOut.length + price.length
  const isMonday = now.getUTCDay() === 1
  const summary  = { dead: dead.length, soldOut: soldOut.length, price: price.length, checked, skipped, emailed: false }

  if (!send || (issues === 0 && !isMonday)) return { ...summary, details: { dead, soldOut, price } }

  const subject = dead.length
    ? `⚠️ Planner: ${dead.length} broken cart link${dead.length === 1 ? '' : 's'}`
    : issues
      ? `Planner: ${issues} product issue${issues === 1 ? '' : 's'} (no broken carts)`
      : '✓ Planner: all cart links OK'

  const section = (title, items, color) => items.length ? `
    <h3 style="font-size:15px;color:${color};margin:24px 0 8px">${title} (${items.length})</h3>
    <ul style="font-size:13px;color:#333;padding-left:18px;margin:0">${items.map(i => `<li style="margin-bottom:4px">${i}</li>`).join('')}</ul>` : ''

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <p style="font-size:15px;color:#111;margin:0 0 4px"><strong>Nightly cart-link check</strong></p>
      <p style="font-size:13px;color:#666;margin:0">Stores checked: ${checked.join(', ') || 'none'}${skipped.length ? ` · Skipped: ${skipped.join(', ')}` : ''}</p>
      ${issues === 0 ? '<p style="font-size:14px;color:#1D9E75;margin-top:20px">Every variant the planner can add to a cart exists on its store, is in stock, and matches the store price.</p>' : ''}
      ${section('Broken cart links — customers in these regions cannot check out', dead, '#B42318')}
      ${section('Sold out on the store', soldOut, '#B54708')}
      ${section('Price differs from the store', price, '#B54708')}
      ${issues ? `<p style="font-size:13px;color:#666;margin-top:24px;line-height:1.5">How to fix: ask Claude Code to correct <code>src/config/products.json</code> and run <code>node scripts/check-variants.mjs</code>, push to main, then Admin → Products → <strong>Sync from products.json</strong>. Small price fixes can also be made directly in Admin → Products.</p>` : ''}
    </div>`

  await resend.emails.send({ from: 'Lecka Planner <info@getlecka.com>', to: [ALERT_EMAIL], subject, html })
  return { ...summary, emailed: true }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()

  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
  // Without the secret, anyone could trigger the cron (and the alert email) repeatedly.
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    await ensureMigrated()
    const [weather, reminders, postRaceLog, cartCheck] = await Promise.allSettled([
      runWeatherUpdate(),
      runSendReminders(),
      runSendPostRaceLogReminders(),
      runVariantCheck(),
    ])
    return res.status(200).json({
      ok: true,
      weather:     weather.status     === 'fulfilled' ? weather.value     : { error: weather.reason?.message },
      reminders:   reminders.status   === 'fulfilled' ? reminders.value   : { error: reminders.reason?.message },
      postRaceLog: postRaceLog.status === 'fulfilled' ? postRaceLog.value : { error: postRaceLog.reason?.message },
      cartCheck:   cartCheck.status   === 'fulfilled' ? cartCheck.value   : { error: cartCheck.reason?.message },
    })
  } catch (err) {
    console.error('[cron] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
