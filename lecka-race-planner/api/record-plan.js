/**
 * api/record-plan.js — Vercel serverless function
 *
 * Lightweight server-side plan counter.
 *
 * POST { race_type }
 *   Appends { date, race_type } to /tmp/lecka_plans.json and returns 201.
 *
 * GET
 *   Returns aggregate stats: total, this_month, by_race_type breakdown.
 *
 * /tmp storage trade-offs
 * -----------------------
 * Vercel's /tmp directory (~512 MB) persists within a single function instance
 * but is RESET on cold starts and across separate instances (Vercel can spin up
 * many). For a low-volume MVP this is acceptable — counts are approximate, not
 * authoritative. For production hardening, replace the file read/write calls
 * with an Upstash Redis INCR / HINCRBY via their REST API (no SDK needed).
 *
 * No personal data is stored — only { date, race_type } per plan generated.
 */

import { readFileSync, writeFileSync } from 'fs'

// ── Config ────────────────────────────────────────────────────────────────────

const TMP_FILE   = '/tmp/lecka_plans.json'
const MAX_STORED = 10_000  // cap file growth; oldest entries dropped first

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadPlans() {
  try {
    const raw = readFileSync(TMP_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function savePlans(plans) {
  writeFileSync(TMP_FILE, JSON.stringify(plans))
}

function thisMonthCount(plans) {
  const now = new Date()
  return plans.filter(p => {
    const d = new Date(p.date)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
}

function countByRaceType(plans) {
  const counts = {}
  for (const p of plans) {
    counts[p.race_type] = (counts[p.race_type] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }))
}

function countByRegion(plans) {
  const counts = {}
  for (const p of plans) {
    const r = p.region ?? 'unknown'
    counts[r] = (counts[r] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }))
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  // ── POST — record a new plan ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { race_type, region } = req.body ?? {}

    if (!race_type || typeof race_type !== 'string') {
      return res.status(400).json({ error: 'race_type is required' })
    }

    try {
      const plans = loadPlans()
      const entry = { date: new Date().toISOString(), race_type }
      if (region && typeof region === 'string') entry.region = region
      plans.push(entry)
      savePlans(plans.slice(-MAX_STORED))
      return res.status(201).json({ ok: true })
    } catch (err) {
      console.error('[record-plan] write error:', err)
      return res.status(500).json({ error: 'Failed to record plan' })
    }
  }

  // ── GET — return aggregate stats ────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const plans = loadPlans()
      return res.status(200).json({
        total:         plans.length,
        this_month:    thisMonthCount(plans),
        by_race_type:  countByRaceType(plans),
        by_region:     countByRegion(plans),
        generated_at:  new Date().toISOString(),
        _note: '/tmp storage resets on cold start — counts are approximate for MVP',
      })
    } catch (err) {
      console.error('[record-plan] read error:', err)
      return res.status(500).json({ error: 'Failed to read stats' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
