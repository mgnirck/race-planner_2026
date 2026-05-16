/**
 * api/record-plan.js — Vercel serverless function
 *
 * POST { race_type, region }
 *   Records a plan event and returns 201.
 *
 * GET (no auth)
 *   Returns lightweight aggregate stats from plan_events.
 *
 * GET ?analytics=1  +  X-Admin-Password header
 *   Returns rich analytics from the plans table (17 queries).
 */

import { sql, ensureMigrated } from './db.js'

// ── Rich analytics (admin-only) ───────────────────────────────────────────────

async function handleAnalytics(req, res) {
  const adminPassword = process.env.VITE_ADMIN_PASSWORD
  const provided = req.headers['x-admin-password'] ?? ''
  if (!adminPassword || provided !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const safe = async (fn) => {
    try { return await fn() } catch (e) { console.error('[analytics] query error:', e); return null }
  }

  const [
    overview,
    by_race_type,
    by_region,
    by_gender,
    by_athlete_profile,
    by_conditions,
    by_effort,
    by_fuelling_style,
    avg_goal_time_by_race_type,
    preferred_products,
    addon_usage,
    plans_over_time,
    elevation_usage,
    caffeine_usage,
    training_mode_usage,
    addon_product_breakdown,
    by_month,
  ] = await Promise.all([
    safe(async () => {
      const { rows } = await sql`
        SELECT
          COUNT(*)::int AS total_plans,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS this_month,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('week', NOW()))::int AS this_week,
          COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS registered_users,
          COUNT(*) FILTER (WHERE user_id IS NULL)::int AS anonymous_plans,
          ROUND(
            COUNT(*) FILTER (WHERE user_id IS NOT NULL)::numeric
            / NULLIF(COUNT(*), 0) * 100, 1
          ) AS email_capture_rate_pct
        FROM plans
      `
      return rows[0]
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT race_type AS key, COUNT(*)::int AS count,
          ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
        FROM plans WHERE race_type IS NOT NULL
        GROUP BY race_type ORDER BY count DESC
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT region AS key, COUNT(*)::int AS count,
          ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
        FROM plans GROUP BY region ORDER BY count DESC
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT inputs->>'gender' AS key, COUNT(*)::int AS count,
          ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
        FROM plans WHERE inputs->>'gender' IS NOT NULL
        GROUP BY inputs->>'gender' ORDER BY count DESC
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT inputs->>'athlete_profile' AS key, COUNT(*)::int AS count,
          ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
        FROM plans WHERE inputs->>'athlete_profile' IS NOT NULL
        GROUP BY inputs->>'athlete_profile' ORDER BY count DESC
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT conditions AS key, COUNT(*)::int AS count,
          ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
        FROM plans WHERE conditions IS NOT NULL
        GROUP BY conditions ORDER BY count DESC
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT effort AS key, COUNT(*)::int AS count,
          ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
        FROM plans WHERE effort IS NOT NULL
        GROUP BY effort ORDER BY count DESC
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT COALESCE(inputs->>'fuelling_style', 'not_set') AS key,
          COUNT(*)::int AS count,
          ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
        FROM plans GROUP BY inputs->>'fuelling_style' ORDER BY count DESC
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT race_type,
          ROUND(AVG(goal_minutes))::int AS avg_minutes,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY goal_minutes))::int AS median_minutes,
          MIN(goal_minutes)::int AS min_minutes,
          MAX(goal_minutes)::int AS max_minutes,
          COUNT(*)::int AS count
        FROM plans WHERE race_type IS NOT NULL AND goal_minutes IS NOT NULL
        GROUP BY race_type ORDER BY avg_minutes
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT prod->>'id' AS product_id,
          SUM((prod->>'quantity')::int)::int AS total_units_planned,
          COUNT(DISTINCT p.id)::int AS plans_featuring
        FROM plans p, jsonb_array_elements(p.selection) AS prod
        WHERE p.selection IS NOT NULL AND jsonb_typeof(p.selection) = 'array'
          AND prod->>'id' IS NOT NULL
        GROUP BY prod->>'id' ORDER BY plans_featuring DESC LIMIT 20
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT
          COUNT(*) FILTER (
            WHERE inputs->'addon_items' IS NOT NULL
            AND jsonb_array_length(inputs->'addon_items') > 0
          )::int AS plans_with_addons,
          COUNT(*)::int AS total_plans,
          ROUND(
            COUNT(*) FILTER (
              WHERE inputs->'addon_items' IS NOT NULL
              AND jsonb_array_length(inputs->'addon_items') > 0
            )::numeric / NULLIF(COUNT(*), 0) * 100, 1
          ) AS addon_usage_pct
        FROM plans
      `
      return rows[0]
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT DATE(created_at) AS date, COUNT(*)::int AS count
        FROM plans WHERE created_at >= NOW() - INTERVAL '90 days'
        GROUP BY DATE(created_at) ORDER BY date ASC
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT
          COUNT(*) FILTER (WHERE (inputs->>'elevation_gain_m')::numeric > 0)::int AS plans_with_elevation,
          COUNT(*)::int AS total_plans,
          ROUND(AVG(CASE WHEN (inputs->>'elevation_gain_m')::numeric > 0
            THEN (inputs->>'elevation_gain_m')::numeric END))::int AS avg_elevation_when_used
        FROM plans
      `
      return rows[0]
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT
          CASE WHEN (inputs->>'caffeine_ok')::boolean THEN 'with_caffeine' ELSE 'no_caffeine' END AS key,
          COUNT(*)::int AS count,
          ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
        FROM plans WHERE inputs->>'caffeine_ok' IS NOT NULL
        GROUP BY (inputs->>'caffeine_ok')::boolean
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT
          CASE WHEN (inputs->>'training_mode')::boolean THEN 'training_mode' ELSE 'race_mode' END AS key,
          COUNT(*)::int AS count
        FROM plans WHERE inputs->>'training_mode' IS NOT NULL
        GROUP BY (inputs->>'training_mode')::boolean
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT addon->>'id' AS product_id,
          SUM((addon->>'quantity')::int)::int AS total_units,
          COUNT(DISTINCT p.id)::int AS plans_featuring
        FROM plans p, jsonb_array_elements(p.inputs->'addon_items') AS addon
        WHERE p.inputs->'addon_items' IS NOT NULL
          AND jsonb_typeof(p.inputs->'addon_items') = 'array'
          AND addon->>'id' IS NOT NULL
        GROUP BY addon->>'id' ORDER BY plans_featuring DESC
      `
      return rows
    }),
    safe(async () => {
      const { rows } = await sql`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COUNT(*)::int AS count
        FROM plans WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at) ORDER BY month ASC
      `
      return rows
    }),
  ])

  return res.status(200).json({
    overview, by_race_type, by_region, by_gender, by_athlete_profile,
    by_conditions, by_effort, by_fuelling_style, avg_goal_time_by_race_type,
    preferred_products, addon_usage, plans_over_time, elevation_usage,
    caffeine_usage, training_mode_usage, addon_product_breakdown, by_month,
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password')

  if (req.method === 'OPTIONS') return res.status(204).end()

  // ── POST — record a new plan ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { race_type, region } = req.body ?? {}

    if (!race_type || typeof race_type !== 'string') {
      return res.status(400).json({ error: 'race_type is required' })
    }

    try {
      await ensureMigrated()
      const safeRegion = (region && typeof region === 'string') ? region : 'us'
      await sql`INSERT INTO plan_events (race_type, region) VALUES (${race_type}, ${safeRegion})`
      return res.status(201).json({ ok: true })
    } catch (err) {
      console.error('[record-plan] insert error:', err)
      return res.status(500).json({ error: 'Failed to record plan' })
    }
  }

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      await ensureMigrated()
    } catch (err) {
      console.error('[record-plan] migrate error:', err)
    }

    // Admin analytics mode — triggered by ?analytics=1 + password header
    if (req.query?.analytics === '1') {
      return handleAnalytics(req, res)
    }

    // Public lightweight stats from plan_events
    try {
      const [totalRes, monthRes, byTypeRes, byRegionRes] = await Promise.all([
        sql`SELECT COUNT(*)::int AS count FROM plan_events`,
        sql`SELECT COUNT(*)::int AS count FROM plan_events
            WHERE created_at >= date_trunc('month', NOW())`,
        sql`SELECT race_type AS key, COUNT(*)::int AS count
            FROM plan_events GROUP BY race_type ORDER BY count DESC`,
        sql`SELECT region AS key, COUNT(*)::int AS count
            FROM plan_events GROUP BY region ORDER BY count DESC`,
      ])

      return res.status(200).json({
        total:        totalRes.rows[0].count,
        this_month:   monthRes.rows[0].count,
        by_race_type: byTypeRes.rows,
        by_region:    byRegionRes.rows,
        generated_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[record-plan] query error:', err)
      return res.status(500).json({ error: 'Stats unavailable' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
