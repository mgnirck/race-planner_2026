/**
 * api/record-plan.js — Vercel serverless function
 *
 * Lightweight server-side plan counter backed by Postgres.
 *
 * POST { race_type, region }
 *   Inserts a row into plan_events and returns 201.
 *
 * GET
 *   Returns aggregate stats: total, this_month, by_race_type, by_region.
 *
 * No personal data is stored — only race_type and region per plan generated.
 */

import { sql, ensureMigrated } from './db.js'

// ── Legacy /tmp storage — replaced by Postgres. Remove after confirming
//    DB migration has run in production.
//
// import { readFileSync, writeFileSync } from 'fs'
// const TMP_FILE   = '/tmp/lecka_plans.json'
// const MAX_STORED = 10_000
//
// function loadPlans() {
//   try { return JSON.parse(readFileSync(TMP_FILE, 'utf8')) ?? [] } catch { return [] }
// }
// function savePlans(plans) { writeFileSync(TMP_FILE, JSON.stringify(plans)) }

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

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

  // ── GET — return aggregate stats ────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      await ensureMigrated()

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
