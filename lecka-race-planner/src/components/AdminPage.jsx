/**
 * AdminPage.jsx
 *
 * Route: /admin
 *
 * Password-protected analytics view. On unlock it fetches aggregate stats from
 * GET /api/record-plan (server-side /tmp counter). Falls back to localStorage
 * when the API is unavailable (offline, local dev without Vercel CLI).
 *
 * Security note
 * -------------
 * The password is compared client-side against import.meta.env.VITE_ADMIN_PASSWORD.
 * This is intentionally lightweight — the page only shows non-sensitive aggregate
 * stats. Do not use this mechanism to protect personal data.
 *
 * Data sources (in priority order)
 * ----------------------------------
 * 1. GET /api/record-plan  — server-side /tmp counter (all users, approx.)
 * 2. localStorage 'lecka_plans_v1' — this-browser fallback (offline / dev)
 */

import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'lecka_plans_v1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadPlans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function thisMonthPlans(plans) {
  const now = new Date()
  return plans.filter(p => {
    const d = new Date(p.date)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
}

function countByRaceType(plans, tFn) {
  const counts = {}
  for (const p of plans) {
    counts[p.race_type] = (counts[p.race_type] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, label: tFn ? tFn(`common:racetype.${key}`, { defaultValue: key }) : key, count }))
}

// ── Password gate ─────────────────────────────────────────────────────────────

const CONFIGURED_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? ''
const IS_DEV              = import.meta.env.MODE === 'development'

function usePasswordGate(t) {
  const [entered, setEntered] = useState('')
  const [unlocked, setUnlocked] = useState(IS_DEV && !CONFIGURED_PASSWORD)
  const [error, setError]    = useState(false)

  function attempt() {
    if (!CONFIGURED_PASSWORD) {
      // No password configured — allow in dev, block in prod
      if (IS_DEV) { setUnlocked(true); return }
      setError(true)
      return
    }
    if (entered === CONFIGURED_PASSWORD) {
      setUnlocked(true)
      setError(false)
    } else {
      setError(true)
      setEntered('')
    }
  }

  return { unlocked, entered, setEntered, attempt, error }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ value, label, sub }) {
  return (
    <div className="border-2 border-gray-100 rounded-2xl p-5 text-center">
      <p className="text-4xl font-bold text-[#2D6A4F]">{value}</p>
      <p className="text-sm font-semibold text-[#1B1B1B] mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { t, i18n } = useTranslation(['admin', 'common'])
  const gate = usePasswordGate(t)

  // ── Server stats ────────────────────────────────────────────────────────────
  // null = not yet fetched | object = success | 'error' = failed
  const [serverStats,  setServerStats]  = useState(null)
  const [serverFetching, setServerFetching] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  function refreshStats() {
    setRefreshKey(k => k + 1)
  }

  useEffect(() => {
    if (!gate.unlocked) return
    setServerFetching(true)
    setServerStats(null)
    fetch(`/api/record-plan?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => setServerStats(data))
      .catch(() => setServerStats('error'))
      .finally(() => setServerFetching(false))
  }, [gate.unlocked, refreshKey])

  // ── localStorage fallback ────────────────────────────────────────────────────
  const localPlans     = useMemo(loadPlans, [gate.unlocked])
  const localMonthLen  = useMemo(() => thisMonthPlans(localPlans).length, [localPlans])
  const localBreakdown = useMemo(() => countByRaceType(localPlans, t), [localPlans, t])

  // ── Derived display values — prefer server, fall back to local ───────────────
  const serverOk = serverStats && serverStats !== 'error'

  const displayTotal  = serverOk ? serverStats.total      : localPlans.length
  const displayMonth  = serverOk ? serverStats.this_month : localMonthLen
  const displayBreakdown = serverOk
    ? serverStats.by_race_type.map(r => ({
        key:   r.key,
        label: t(`common:racetype.${r.key}`, { defaultValue: r.key }),
        count: r.count,
      }))
    : localBreakdown
  const displayRegions = serverOk && serverStats.by_region
    ? serverStats.by_region
    : null
  const topRaceType = displayBreakdown[0]

  const now = new Date()
  const monthLabel = now.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })

  // ── Password screen ─────────────────────────────────────────────────────────
  if (!gate.unlocked) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-5">
        <div className="w-full max-w-xs">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
            {t('title')}
          </p>
          <h1 className="text-xl font-bold text-[#1B1B1B] mb-6">{t('enterPassword')}</h1>

          {!CONFIGURED_PASSWORD && !IS_DEV && (
            <p className="text-sm text-red-500 mb-4">
              {t('noPasswordSet')}
            </p>
          )}

          <input
            type="password"
            value={gate.entered}
            onChange={e => { gate.setEntered(e.target.value); }}
            onKeyDown={e => e.key === 'Enter' && gate.attempt()}
            placeholder={t('passwordPlaceholder')}
            className={[
              'w-full border-2 rounded-xl px-4 py-3 text-sm',
              'focus:outline-none focus:border-[#2D6A4F]',
              gate.error ? 'border-red-300' : 'border-gray-200',
            ].join(' ')}
            autoFocus
          />
          {gate.error && (
            <p className="text-xs text-red-500 mt-2">{t('incorrectPassword')}</p>
          )}
          <button
            type="button"
            onClick={gate.attempt}
            className="mt-3 w-full min-h-[44px] bg-[#2D6A4F] text-white rounded-xl
                       text-sm font-semibold hover:bg-[#235a3e] transition-colors"
          >
            {t('unlock')}
          </button>
        </div>
      </div>
    )
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between max-w-2xl mx-auto">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{t('header.label')}</p>
          <h1 className="text-lg font-bold text-[#1B1B1B]">{t('header.title')}</h1>
        </div>
        <a href="/" className="text-sm text-[#2D6A4F] font-medium hover:underline">
          {t('common:nav.backToPlanner')}
        </a>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-8 space-y-8">

        {/* Data source indicator */}
        <div className="flex items-center gap-2">
          {serverFetching ? (
            <span className="text-xs text-gray-400">{t('status.loading')}</span>
          ) : serverOk ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold
                             text-[#2D6A4F] bg-[#2D6A4F]/8 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] inline-block" />
              {t('status.live')}
              {serverStats.generated_at && (
                <span className="text-[#2D6A4F]/60 font-normal">
                  · {new Date(serverStats.generated_at).toLocaleTimeString()}
                </span>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold
                             text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
              {serverStats === 'error' ? t('status.serverUnavailable') : t('status.localData')}
            </span>
          )}
          <button
            type="button"
            onClick={refreshStats}
            disabled={serverFetching}
            className="ml-auto text-xs text-[#2D6A4F] font-medium hover:underline
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {serverFetching ? t('status.refreshing') : t('status.refresh')}
          </button>
        </div>

        {/* This month / all-time counts */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
            {monthLabel}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <StatBox value={displayMonth} label={t('stats.plansThisMonth')} />
            <StatBox value={displayTotal} label={t('stats.plansAllTime')} />
          </div>
        </section>

        {/* Top race type */}
        {topRaceType && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
              {t('stats.mostPopular')}
            </p>
            <div className="border-2 border-[#2D6A4F]/20 rounded-2xl p-5 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-lg font-bold text-[#1B1B1B]">{topRaceType.label}</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {t('stats.planCount', { count: topRaceType.count })}
                  {displayTotal > 0 && (
                    <> {t('stats.pctOfTotal', { pct: Math.round((topRaceType.count / displayTotal) * 100) })}</>
                  )}
                </p>
              </div>
              <div className="text-3xl font-bold text-[#74C69D]">#1</div>
            </div>
          </section>
        )}

        {/* Race type breakdown */}
        {displayBreakdown.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
              {t('stats.allRaceTypes')}
            </p>
            <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
              {displayBreakdown.map((row, i) => (
                <div
                  key={row.key}
                  className={`flex items-center justify-between px-5 py-3 ${
                    i !== displayBreakdown.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <span className="text-sm font-medium text-[#1B1B1B]">{row.label}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2D6A4F] rounded-full"
                        style={{ width: `${(row.count / displayBreakdown[0].count) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-6 text-right">{row.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Region breakdown */}
        {displayRegions && displayRegions.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
              {t('stats.byRegion')}
            </p>
            <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
              {displayRegions.map((row, i) => {
                const regionLabel = t(`region.${row.key}`, { defaultValue: row.key.toUpperCase() })
                return (
                  <div
                    key={row.key}
                    className={`flex items-center justify-between px-5 py-3 ${
                      i !== displayRegions.length - 1 ? 'border-b border-gray-100' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-[#1B1B1B]">{regionLabel}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#2D6A4F] rounded-full"
                          style={{ width: `${(row.count / displayRegions[0].count) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-500 w-6 text-right">{row.count}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {displayTotal === 0 && !serverFetching && (
          <p className="text-sm text-gray-400 text-center py-12">
            {t('stats.noPlans')}
          </p>
        )}

        {/* Footer */}
        <p className="text-xs text-gray-300 text-center pb-4">
          {t('footer')}
        </p>
      </div>
    </div>
  )
}
