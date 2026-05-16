/**
 * AdminPage.jsx — /admin
 *
 * Password-protected analytics dashboard. After unlock, fetches rich analytics
 * from /api/admin/analytics in parallel with the existing /api/record-plan
 * fallback counter.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import allProducts from '../config/products.json'
import competitorProducts from '../config/competitor-products.json'

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'lecka_plans_v1'
const CONFIGURED_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? ''
const IS_DEV = import.meta.env.MODE === 'development'

const RACE_TYPE_LABELS = {
  '5k': '5 km road',
  '10k': '10 km road',
  half_marathon: 'Half marathon',
  marathon: 'Marathon',
  ultra_50k: 'Ultra 50 km',
  ultra_100k: 'Ultra 100 km+',
  triathlon_sprint: 'Sprint triathlon',
  triathlon_olympic: 'Olympic triathlon',
  triathlon_70_3: '70.3 Triathlon',
  triathlon_140_6: 'Ironman 140.6',
}

const REGION_LABELS = {
  us: 'United States',
  de: 'Germany',
  dk: 'Denmark',
  ch: 'Switzerland',
  vn: 'Vietnam',
  sg: 'Singapore',
  hk: 'Hong Kong',
}

const CATALOG_REGIONS      = ['us', 'de', 'dk', 'ch', 'vn']
const CATALOG_REGION_CODES = { us: 'US', de: 'DE', dk: 'DK', ch: 'CH', vn: 'VN' }

const ATHLETE_PROFILE_LABELS = {
  untrained: 'New to endurance sports',
  intermediate: 'Intermediate',
  trained: 'Trained athlete',
  elite: 'Elite / competitive',
}

const FUELLING_STYLE_LABELS = {
  gels_only: 'Gels only',
  gels_and_bars: 'Gels + bars',
  drink_mix_base: 'Drink mix + gels',
  flexible: 'No preference',
  not_set: 'Not answered (pre-feature)',
}

const CONDITION_COLORS = {
  cool: 'blue',
  mild: 'teal',
  warm: 'amber',
  hot: 'red',
  humid: 'purple',
}

const EFFORT_COLORS = {
  easy: 'teal',
  race_pace: 'amber',
  hard: 'red',
}

const BAR_COLORS = {
  blue: '#185FA5',
  teal: '#48C4B0',
  amber: '#BA7517',
  red: '#A32D2D',
  purple: '#534AB7',
}

const productNameById = Object.fromEntries(
  allProducts.map(p => [p.id, p.name])
)

const competitorNameById = Object.fromEntries(
  competitorProducts.products.map(p => [p.id, p.display_name])
)

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

function formatMinutes(m) {
  if (m == null) return '—'
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${h}:${String(min).padStart(2, '0')}`
}

function dateToKey(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

// ── Password gate hook ────────────────────────────────────────────────────────

function usePasswordGate(t) {
  const [entered, setEntered] = useState('')
  const [unlocked, setUnlocked] = useState(IS_DEV && !CONFIGURED_PASSWORD)
  const [error, setError] = useState(false)

  function attempt() {
    if (!CONFIGURED_PASSWORD) {
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

// ── Shared UI components ──────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

function MetricCard({ value, label, sub, highlight = false }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 text-center">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${highlight ? 'text-[#48C4B0]' : 'text-[#1B1B1B]'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function BarRow({ label, count, pct, color = 'teal' }) {
  const barColor = BAR_COLORS[color] ?? BAR_COLORS.teal
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{count}</span>
          {pct != null && (
            <span className="ml-1.5 text-xs text-gray-400">{pct}%</span>
          )}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct ?? 0}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  )
}

function GoalTimeRow({ row }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-3 text-sm font-medium text-gray-800">
        {RACE_TYPE_LABELS[row.race_type] ?? row.race_type}
        {row.count < 3 && (
          <span className="ml-1.5 text-xs text-gray-400 font-normal">(small sample)</span>
        )}
      </td>
      <td className="py-2 px-2 text-sm text-center text-gray-700">{formatMinutes(row.avg_minutes)}</td>
      <td className="py-2 px-2 text-sm text-center text-gray-500">{formatMinutes(row.median_minutes)}</td>
      <td className="py-2 px-2 text-sm text-center text-gray-500">{formatMinutes(row.min_minutes)}</td>
      <td className="py-2 px-2 text-sm text-center text-gray-500">{formatMinutes(row.max_minutes)}</td>
      <td className="py-2 pl-2 text-sm text-center text-gray-400">{row.count}</td>
    </tr>
  )
}

function StatBox({ value, label, sub }) {
  return (
    <div className="border-2 border-gray-100 rounded-2xl p-5 text-center">
      <p className="text-4xl font-bold text-[#2D6A4F]">{value}</p>
      <p className="text-sm font-semibold text-[#1B1B1B] mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function DataUnavailable() {
  return <p className="text-sm text-gray-400 italic py-2">Data unavailable</p>
}

function SkeletonBar({ h = 'h-4', w = 'w-full' }) {
  return <div className={`${h} ${w} bg-gray-200 rounded animate-pulse`} />
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonBar h="h-3" w="w-24" />
      <SkeletonBar h="h-8" />
      <SkeletonBar h="h-8" />
      <SkeletonBar h="h-8" w="w-3/4" />
    </div>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ data }) {
  const ov = data.overview
  const raceTypes = data.by_race_type
  const regions = data.by_region
  const conditions = data.by_conditions
  const effort = data.by_effort
  const addon = data.addon_usage
  const caffeine = data.caffeine_usage

  return (
    <div className="space-y-8">
      {/* Row 1 — four MetricCards */}
      <section>
        {ov ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard value={ov.total_plans} label="Total plans" highlight />
            <MetricCard value={ov.this_month} label="This month" highlight />
            <MetricCard value={ov.this_week} label="This week" highlight />
            <MetricCard
              value={ov.registered_users}
              label="Registered users"
              sub={`${ov.email_capture_rate_pct ?? 0}% with email`}
            />
          </div>
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 2 — Race type breakdown */}
      <section>
        <SectionLabel>Race types</SectionLabel>
        {raceTypes ? (
          raceTypes.map(r => (
            <BarRow
              key={r.key}
              label={RACE_TYPE_LABELS[r.key] ?? r.key}
              count={r.count}
              pct={r.pct}
              color="teal"
            />
          ))
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 3 — Region breakdown */}
      <section>
        <SectionLabel>By region</SectionLabel>
        {regions ? (
          regions
            .filter(r => r.key != null)
            .map(r => (
              <BarRow
                key={r.key}
                label={REGION_LABELS[r.key] ?? r.key.toUpperCase()}
                count={r.count}
                pct={r.pct}
                color="teal"
              />
            ))
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 4 — Conditions + Effort */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section>
          <SectionLabel>Race conditions</SectionLabel>
          {conditions ? (
            conditions.map(r => (
              <BarRow
                key={r.key}
                label={r.key ? r.key.charAt(0).toUpperCase() + r.key.slice(1) : '—'}
                count={r.count}
                pct={r.pct}
                color={CONDITION_COLORS[r.key] ?? 'teal'}
              />
            ))
          ) : (
            <DataUnavailable />
          )}
        </section>

        <section>
          <SectionLabel>Effort level</SectionLabel>
          {effort ? (
            effort.map(r => (
              <BarRow
                key={r.key}
                label={r.key === 'race_pace' ? 'Race pace' : r.key ? r.key.charAt(0).toUpperCase() + r.key.slice(1) : '—'}
                count={r.count}
                pct={r.pct}
                color={EFFORT_COLORS[r.key] ?? 'teal'}
              />
            ))
          ) : (
            <DataUnavailable />
          )}
        </section>
      </div>

      {/* Row 5 — Add-on usage */}
      <section>
        <SectionLabel>Competitor add-on usage</SectionLabel>
        {addon ? (
          <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-2xl px-5 py-4">
            <p className="text-base font-semibold text-gray-800">
              {addon.addon_usage_pct ?? 0}% of plans include add-on products
              <span className="text-gray-500 font-normal"> (Maurten, SiS, etc.)</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {addon.plans_with_addons} of {addon.total_plans} plans
            </p>
          </div>
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 6 — Caffeine */}
      <section>
        <SectionLabel>Caffeine preference</SectionLabel>
        {caffeine ? (
          <div className="grid grid-cols-2 gap-3">
            {caffeine.map(r => (
              <MetricCard
                key={r.key}
                value={r.count}
                label={r.key === 'with_caffeine' ? 'With caffeine' : 'No caffeine'}
                sub={`${r.pct}%`}
                highlight={r.key === 'with_caffeine'}
              />
            ))}
          </div>
        ) : (
          <DataUnavailable />
        )}
      </section>
    </div>
  )
}

// ── Tab: Athletes ─────────────────────────────────────────────────────────────

function AthletesTab({ data }) {
  const ov = data.overview
  const gender = data.by_gender
  const profile = data.by_athlete_profile
  const fuelling = data.by_fuelling_style
  const goalTimes = data.avg_goal_time_by_race_type
  const elevation = data.elevation_usage
  const training = data.training_mode_usage

  const showTraining =
    training != null &&
    training.some(r => r.key === 'training_mode' && r.count > 0)

  return (
    <div className="space-y-8">
      {/* Row 1 — two MetricCards */}
      <section>
        {ov ? (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard value={ov.registered_users} label="Registered users" highlight />
            <MetricCard value={ov.anonymous_plans} label="Anonymous plans" />
          </div>
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 2 — Gender */}
      <section>
        <SectionLabel>Gender</SectionLabel>
        {gender ? (
          gender.map(r => (
            <BarRow
              key={r.key}
              label={r.key ? r.key.charAt(0).toUpperCase() + r.key.slice(1) : '—'}
              count={r.count}
              pct={r.pct}
              color="teal"
            />
          ))
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 3 — Athlete profile */}
      <section>
        <SectionLabel>Training level</SectionLabel>
        {profile ? (
          profile.map(r => (
            <BarRow
              key={r.key}
              label={ATHLETE_PROFILE_LABELS[r.key] ?? r.key}
              count={r.count}
              pct={r.pct}
              color="teal"
            />
          ))
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 4 — Fuelling style */}
      <section>
        <SectionLabel>Fuelling style preference</SectionLabel>
        {fuelling ? (
          fuelling.map(r => (
            <BarRow
              key={r.key}
              label={FUELLING_STYLE_LABELS[r.key] ?? r.key}
              count={r.count}
              pct={r.pct}
              color="teal"
            />
          ))
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 5 — Goal times table */}
      <section>
        <SectionLabel>Goal times by race type</SectionLabel>
        {goalTimes ? (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-2 pr-3 text-xs font-semibold text-gray-500">Race type</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-gray-500 text-center">Avg</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-gray-500 text-center">Median</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-gray-500 text-center">Fastest</th>
                  <th className="pb-2 px-2 text-xs font-semibold text-gray-500 text-center">Slowest</th>
                  <th className="pb-2 pl-2 text-xs font-semibold text-gray-500 text-center">Plans</th>
                </tr>
              </thead>
              <tbody>
                {goalTimes.map(r => <GoalTimeRow key={r.race_type} row={r} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 6 — Elevation */}
      <section>
        <SectionLabel>GPX / elevation usage</SectionLabel>
        {elevation ? (
          <div className="bg-gray-50 rounded-2xl px-5 py-4">
            <p className="text-base font-semibold text-gray-800">
              {elevation.total_plans > 0
                ? `${Math.round((elevation.plans_with_elevation / elevation.total_plans) * 100)}%`
                : '0%'}{' '}
              <span className="font-normal text-gray-500">of plans include elevation data</span>
            </p>
            {elevation.avg_elevation_when_used != null && (
              <p className="text-xs text-gray-500 mt-1">
                Avg elevation gain when used: {elevation.avg_elevation_when_used}m
              </p>
            )}
          </div>
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Row 7 — Training mode (hidden until feature is live) */}
      {showTraining && (
        <section>
          <SectionLabel>Plan mode</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {training.map(r => (
              <MetricCard
                key={r.key}
                value={r.count}
                label={r.key === 'training_mode' ? 'Training mode' : 'Race mode'}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Tab: Products ─────────────────────────────────────────────────────────────

const SEED_LABELS = {
  idle:    'Sync from products.json',
  confirm: 'Confirm sync?',
  seeding: 'Syncing…',
  done:    'Synced ✓',
  error:   'Sync failed',
}

function ProductsTab({ data, password }) {
  // ── Analytics state ─────────────────────────────────────────────────────────
  const preferred = data.preferred_products
  const addons    = data.addon_product_breakdown
  const [showAll, setShowAll] = useState(false)

  const maxFeaturing    = preferred?.[0]?.plans_featuring ?? 1
  const visibleProducts = preferred
    ? (showAll ? preferred : preferred.slice(0, 10))
    : []

  // ── Catalog state ───────────────────────────────────────────────────────────
  const [catalog,        setCatalog]        = useState(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError,   setCatalogError]   = useState(null)
  const [expandedId,     setExpandedId]     = useState(null)
  const [savingKey,      setSavingKey]      = useState(null)
  const [editDraft,      setEditDraft]      = useState({})
  const [seedState,      setSeedState]      = useState('idle')

  // ── Audit state ─────────────────────────────────────────────────────────────
  const [auditOpen,    setAuditOpen]    = useState(false)
  const [audit,        setAudit]        = useState(null)
  const [auditLoading, setAuditLoading] = useState(false)

  const adminFetch = useCallback((url, opts = {}) =>
    fetch(url, {
      ...opts,
      headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json', ...opts.headers },
    }),
  [password])

  const loadCatalog = useCallback(() => {
    setCatalogLoading(true)
    setCatalogError(null)
    adminFetch('/api/admin/products')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(rows => { setCatalog(rows); setCatalogLoading(false) })
      .catch(err => { setCatalogError(String(err)); setCatalogLoading(false) })
  }, [adminFetch])

  useEffect(() => { loadCatalog() }, [loadCatalog])

  function loadAudit() {
    setAuditLoading(true)
    adminFetch('/api/admin/products?op=audit')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(rows => { setAudit(rows); setAuditLoading(false) })
      .catch(() => { setAuditLoading(false) })
  }

  function toggleAudit() {
    if (!auditOpen && !audit) loadAudit()
    setAuditOpen(v => !v)
  }

  async function toggleAvailability(productId, region, currentAvailable) {
    const key = `avail:${productId}:${region}`
    setSavingKey(key)
    try {
      const res = await adminFetch('/api/admin/products?op=availability', {
        method: 'PATCH',
        body: JSON.stringify({ product_id: productId, region, available: !currentAvailable }),
      })
      if (!res.ok) throw new Error()
      setCatalog(prev => prev.map(p => {
        if (p.id !== productId) return p
        return { ...p, regions: p.regions.map(r => r.region === region ? { ...r, available: !currentAvailable } : r) }
      }))
    } catch { loadCatalog() }
    finally { setSavingKey(null) }
  }

  async function saveVariantField(variantId, productId, region, field) {
    const key  = `v:${variantId}:${field}`
    const raw  = editDraft[key]
    if (raw === undefined) return
    const value = field === 'price' ? parseFloat(raw) : raw
    if (field === 'price' && (isNaN(value) || value <= 0)) return
    if (field === 'shopify_variant_id' && !/^\d+$/.test(String(value))) return

    setSavingKey(key)
    try {
      const res = await adminFetch('/api/admin/products?op=variant', {
        method: 'PATCH',
        body: JSON.stringify({ variant_id: variantId, field, value }),
      })
      if (!res.ok) throw new Error()
      setCatalog(prev => prev.map(p => {
        if (p.id !== productId) return p
        return {
          ...p,
          regions: p.regions.map(r => {
            if (r.region !== region) return r
            return { ...r, variants: (r.variants ?? []).map(v => v.id === variantId ? { ...v, [field]: value } : v) }
          }),
        }
      }))
      setEditDraft(prev => { const n = { ...prev }; delete n[key]; return n })
    } catch { /* draft stays */ }
    finally { setSavingKey(null) }
  }

  async function handleSeed() {
    if (seedState === 'confirm') {
      setSeedState('seeding')
      try {
        const res = await adminFetch('/api/admin/products?op=seed', { method: 'POST', body: '{}' })
        if (!res.ok) throw new Error()
        setSeedState('done')
        loadCatalog()
        setTimeout(() => setSeedState('idle'), 3000)
      } catch {
        setSeedState('error')
        setTimeout(() => setSeedState('idle'), 3000)
      }
    } else if (seedState === 'idle') {
      setSeedState('confirm')
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Analytics: Lecka products leaderboard ─────────────────────────── */}
      <section>
        <SectionLabel>Most planned Lecka products</SectionLabel>
        {preferred ? (
          <>
            {visibleProducts.map(p => {
              const pct = Math.round((p.plans_featuring / maxFeaturing) * 100)
              return (
                <div key={p.product_id} className="mb-4">
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800">
                      {productNameById[p.product_id] ?? p.product_id}
                    </span>
                    <div className="text-right ml-4 shrink-0">
                      <p className="text-sm font-semibold text-gray-800">{p.plans_featuring} plans</p>
                      <p className="text-xs text-gray-400">{p.total_units_planned} total units</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                         style={{ width: `${pct}%`, backgroundColor: BAR_COLORS.teal }} />
                  </div>
                </div>
              )
            })}
            {preferred.length > 10 && (
              <button type="button" onClick={() => setShowAll(v => !v)}
                className="text-xs text-[#48C4B0] font-semibold hover:underline mt-1">
                {showAll ? 'Show fewer' : `Show all ${preferred.length} products`}
              </button>
            )}
          </>
        ) : <DataUnavailable />}
      </section>

      {/* ── Analytics: Competitor add-on products ─────────────────────────── */}
      <section>
        <SectionLabel>Competitor products selected by athletes</SectionLabel>
        {addons && addons.length > 0 ? (
          addons.map(p => (
            <BarRow
              key={p.product_id}
              label={competitorNameById[p.product_id] ?? p.product_id}
              count={p.plans_featuring}
              pct={addons[0].plans_featuring > 0
                ? Math.round((p.plans_featuring / addons[0].plans_featuring) * 100)
                : 0}
              color="amber"
            />
          ))
        ) : (
          <p className="text-sm text-gray-500 py-2">
            No add-on data yet — this will populate as athletes use the performance add-ons feature.
          </p>
        )}
      </section>

      {/* ── Catalog management ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Catalog management</SectionLabel>
          <button
            type="button"
            onClick={handleSeed}
            disabled={seedState === 'seeding'}
            className={[
              'text-xs font-semibold px-3 py-1.5 rounded-lg border-2 transition-colors',
              seedState === 'confirm'
                ? 'border-amber-400 text-amber-600 bg-amber-50'
                : seedState === 'done'
                ? 'border-[#48C4B0] text-[#48C4B0] bg-[#48C4B0]/5'
                : seedState === 'error'
                ? 'border-red-300 text-red-500 bg-red-50'
                : 'border-gray-200 text-gray-500 hover:border-[#48C4B0] hover:text-[#48C4B0]',
            ].join(' ')}
          >
            {SEED_LABELS[seedState]}
          </button>
        </div>

        {catalogLoading && (
          <div className="space-y-2">
            {[0,1,2,3].map(i => <SkeletonBar key={i} h="h-12" />)}
          </div>
        )}

        {!catalogLoading && catalogError && (
          <div className="text-sm text-red-500 py-2">
            Could not load catalog.{' '}
            <button type="button" onClick={loadCatalog}
              className="text-[#48C4B0] font-semibold hover:underline">Retry</button>
          </div>
        )}

        {!catalogLoading && catalog && (
          <>
            {/* Region header */}
            <div className="grid items-center px-3 py-1 mb-1"
                 style={{ gridTemplateColumns: '1fr repeat(5, 3rem)' }}>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Product</span>
              {CATALOG_REGIONS.map(r => (
                <span key={r} className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center">{CATALOG_REGION_CODES[r]}</span>
              ))}
            </div>

            <div className="space-y-1.5">
              {catalog.map(product => {
                const regMap = Object.fromEntries((product.regions ?? []).map(r => [r.region, r]))
                const isExpanded = expandedId === product.id

                return (
                  <div key={product.id} className="border-2 border-gray-100 rounded-xl overflow-hidden">
                    {/* Availability row */}
                    <div className="grid items-center px-3 py-2.5"
                         style={{ gridTemplateColumns: '1fr repeat(5, 3rem)' }}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : product.id)}
                        className="flex items-center gap-2 text-left min-w-0"
                      >
                        <span className="text-sm font-medium text-[#1B1B1B] truncate">{product.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{product.type}</span>
                        <span className="text-gray-300 shrink-0 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {CATALOG_REGIONS.map(region => {
                        const reg    = regMap[region]
                        const aKey   = `avail:${product.id}:${region}`
                        const isAvail  = reg?.available ?? false
                        const isSaving = savingKey === aKey
                        return (
                          <div key={region} className="flex justify-center">
                            <button
                              type="button"
                              disabled={isSaving || !reg}
                              onClick={() => toggleAvailability(product.id, region, isAvail)}
                              className={[
                                'w-10 h-6 rounded-full text-[10px] font-bold transition-colors',
                                isAvail  ? 'bg-[#48C4B0] text-white'  : 'bg-gray-100 text-gray-400',
                                isSaving ? 'opacity-50 cursor-wait'   : '',
                                !reg     ? 'opacity-20 cursor-default' : '',
                              ].join(' ')}
                            >
                              {isSaving ? '…' : isAvail ? 'ON' : 'OFF'}
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    {/* Variant editor — expands per product */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-3 pb-3 space-y-4 pt-3">
                        {CATALOG_REGIONS.map(region => {
                          const reg = regMap[region]
                          if (!reg?.variants?.length) return null
                          return (
                            <div key={region}>
                              <p className="text-xs font-semibold text-gray-400 mb-2">{CATALOG_REGION_CODES[region]}</p>
                              <div className="space-y-1.5">
                                {reg.variants.map(v => {
                                  const priceKey = `v:${v.id}:price`
                                  const vidKey   = `v:${v.id}:shopify_variant_id`
                                  const priceDraft = editDraft[priceKey]
                                  const vidDraft   = editDraft[vidKey]
                                  return (
                                    <div key={v.id} className="flex items-center gap-3 text-xs">
                                      <span className="text-gray-500 w-16 shrink-0">{v.units_per_pack}× pack</span>

                                      {/* Price */}
                                      <label className="flex items-center gap-1">
                                        <span className="text-gray-400">Price</span>
                                        <input
                                          className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                                          value={priceDraft ?? String(v.price)}
                                          onChange={e => setEditDraft(d => ({ ...d, [priceKey]: e.target.value }))}
                                        />
                                        {priceDraft !== undefined && (
                                          <button
                                            type="button"
                                            disabled={savingKey === priceKey}
                                            onClick={() => saveVariantField(v.id, product.id, region, 'price')}
                                            className="text-[#48C4B0] font-bold"
                                          >✓</button>
                                        )}
                                      </label>

                                      {/* Shopify variant ID */}
                                      <label className="flex items-center gap-1 ml-2">
                                        <span className="text-gray-400">VID</span>
                                        <input
                                          className="w-28 border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono"
                                          value={vidDraft ?? v.shopify_variant_id}
                                          onChange={e => setEditDraft(d => ({ ...d, [vidKey]: e.target.value }))}
                                        />
                                        {vidDraft !== undefined && (
                                          <button
                                            type="button"
                                            disabled={savingKey === vidKey}
                                            onClick={() => saveVariantField(v.id, product.id, region, 'shopify_variant_id')}
                                            className="text-[#48C4B0] font-bold"
                                          >✓</button>
                                        )}
                                      </label>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                        {CATALOG_REGIONS.every(r => !regMap[r]?.variants?.length) && (
                          <p className="text-xs text-gray-400">No variants configured for this product.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* ── Audit log ─────────────────────────────────────────────────────── */}
      <section>
        <button
          type="button"
          onClick={toggleAudit}
          className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700"
        >
          <span>Audit log</span>
          <span className="text-gray-300 text-xs">{auditOpen ? '▲' : '▼'}</span>
        </button>

        {auditOpen && (
          <div className="mt-3">
            {auditLoading && <SkeletonBar h="h-32" />}
            {!auditLoading && audit?.length === 0 && (
              <p className="text-sm text-gray-400">No audit entries yet.</p>
            )}
            {!auditLoading && audit && audit.length > 0 && (
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {audit.map(entry => (
                  <div key={entry.id}
                       className="grid gap-x-2 text-xs text-gray-600 py-0.5"
                       style={{ gridTemplateColumns: 'auto auto auto 1fr' }}>
                    <span className="text-gray-400">
                      {new Date(entry.changed_at).toLocaleString()}
                    </span>
                    <span className="font-mono font-medium truncate">{entry.product_id}</span>
                    <span className="text-gray-400">{entry.region ?? ''}</span>
                    <span>
                      <span className="font-semibold">{entry.field_changed}</span>
                      {entry.old_value != null && (
                        <span className="text-red-400 line-through ml-1">{entry.old_value}</span>
                      )}
                      {entry.new_value != null && (
                        <span className="text-[#48C4B0] ml-1">{entry.new_value}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  )
}

// ── Tab: Timeline ─────────────────────────────────────────────────────────────

function TimelineTab({ data }) {
  const lineCanvasRef = useRef(null)
  const barCanvasRef = useRef(null)

  const plansOverTime = data.plans_over_time
  const byMonth = data.by_month

  function renderLineChart() {
    if (!lineCanvasRef.current || !plansOverTime) return
    if (window.__leckaLineChart) {
      window.__leckaLineChart.destroy()
      window.__leckaLineChart = null
    }

    const dates = []
    for (let i = 89; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      dates.push(d.toISOString().slice(0, 10))
    }

    const countMap = Object.fromEntries(
      plansOverTime.map(r => [dateToKey(r.date), r.count])
    )
    const counts = dates.map(d => countMap[d] ?? 0)
    const labels = dates.map(d =>
      new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    )

    window.__leckaLineChart = new window.Chart(lineCanvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: counts,
          fill: true,
          backgroundColor: 'rgba(72, 196, 176, 0.12)',
          borderColor: '#48C4B0',
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.parsed.y} plans`,
              title: items => new Date(dates[items[0].dataIndex] + 'T12:00:00')
                .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 13 },
          },
          y: {
            min: 0,
            ticks: { stepSize: 1, precision: 0 },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    })
  }

  function renderBarChart() {
    if (!barCanvasRef.current || !byMonth) return
    if (window.__leckaBarChart) {
      window.__leckaBarChart.destroy()
      window.__leckaBarChart = null
    }

    const labels = byMonth.map(r => {
      const [year, month] = r.month.split('-')
      const name = new Date(parseInt(year), parseInt(month) - 1, 1)
        .toLocaleDateString('en-US', { month: 'short' })
      return `${name} '${year.slice(2)}`
    })
    const counts = byMonth.map(r => r.count)

    window.__leckaBarChart = new window.Chart(barCanvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: counts,
          backgroundColor: '#48C4B0',
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.parsed.y} plans`,
              title: items => `${labels[items[0].dataIndex]}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            min: 0,
            ticks: { stepSize: 1, precision: 0 },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    })
  }

  useEffect(() => {
    if (!plansOverTime) return

    const doRender = () => {
      renderLineChart()
      renderBarChart()
    }

    if (window.Chart) {
      doRender()
      return () => {
        if (window.__leckaLineChart) { window.__leckaLineChart.destroy(); window.__leckaLineChart = null }
        if (window.__leckaBarChart) { window.__leckaBarChart.destroy(); window.__leckaBarChart = null }
      }
    }

    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    script.onload = doRender
    document.head.appendChild(script)

    return () => {
      if (window.__leckaLineChart) { window.__leckaLineChart.destroy(); window.__leckaLineChart = null }
      if (window.__leckaBarChart) { window.__leckaBarChart.destroy(); window.__leckaBarChart = null }
    }
  }, [data])

  // Compute derived metrics from padded data
  const derivedMetrics = useMemo(() => {
    if (!plansOverTime) return null
    const today = new Date()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(today.getDate() - 30)

    const busiest = plansOverTime.reduce(
      (max, r) => (r.count > max.count ? r : max),
      { count: 0, date: '' }
    )
    const busiestLabel = busiest.date
      ? `${new Date(dateToKey(busiest.date) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${busiest.count} plans`
      : '—'

    const last30Sum = plansOverTime
      .filter(r => new Date(dateToKey(r.date) + 'T12:00:00') >= thirtyDaysAgo)
      .reduce((sum, r) => sum + r.count, 0)
    const dailyAvg = (last30Sum / 30).toFixed(1)

    const total90 = plansOverTime.reduce((sum, r) => sum + r.count, 0)
    const weeklyAvg = (total90 / 13).toFixed(1)

    return { busiestLabel, dailyAvg, weeklyAvg }
  }, [plansOverTime])

  return (
    <div className="space-y-8">
      {/* Line chart */}
      <section>
        <SectionLabel>Plans generated (last 90 days)</SectionLabel>
        {plansOverTime ? (
          <div style={{ height: 240 }}>
            <canvas ref={lineCanvasRef} />
          </div>
        ) : (
          <DataUnavailable />
        )}
      </section>

      {/* Derived metrics */}
      {derivedMetrics && (
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetricCard value={derivedMetrics.busiestLabel} label="Busiest single day" />
            <MetricCard value={derivedMetrics.dailyAvg} label="Daily avg (last 30 days)" highlight />
            <MetricCard value={derivedMetrics.weeklyAvg} label="Weekly avg (last 90 days)" highlight />
          </div>
        </section>
      )}

      {/* Bar chart — monthly */}
      <section>
        <SectionLabel>Monthly volume (last 12 months)</SectionLabel>
        {byMonth ? (
          <div style={{ height: 200 }}>
            <canvas ref={barCanvasRef} />
          </div>
        ) : (
          <DataUnavailable />
        )}
      </section>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'athletes', label: 'Athletes' },
  { id: 'products', label: 'Products' },
  { id: 'timeline', label: 'Timeline' },
]

export default function AdminPage() {
  const { t, i18n } = useTranslation(['admin', 'common'])
  const gate = usePasswordGate(t)

  // ── Existing: record-plan fetch ─────────────────────────────────────────────
  const [serverStats, setServerStats] = useState(null)
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

  // ── New: analytics fetch ────────────────────────────────────────────────────
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (!gate.unlocked) return
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    fetch('/api/record-plan?analytics=1', {
      headers: { 'X-Admin-Password': gate.entered },
    })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => { setAnalyticsData(data); setAnalyticsLoading(false) })
      .catch(err => { setAnalyticsError(err.message); setAnalyticsLoading(false) })
  }, [gate.unlocked, refreshKey])

  // ── localStorage fallback ───────────────────────────────────────────────────
  const localPlans = useMemo(loadPlans, [gate.unlocked])
  const localMonthLen = useMemo(() => thisMonthPlans(localPlans).length, [localPlans])
  const localBreakdown = useMemo(() => countByRaceType(localPlans, t), [localPlans, t])

  const serverOk = serverStats && serverStats !== 'error'
  const displayTotal = serverOk ? serverStats.total : localPlans.length
  const displayMonth = serverOk ? serverStats.this_month : localMonthLen
  const displayBreakdown = serverOk
    ? serverStats.by_race_type.map(r => ({
        key: r.key,
        label: t(`common:racetype.${r.key}`, { defaultValue: r.key }),
        count: r.count,
      }))
    : localBreakdown
  const displayRegions = serverOk && serverStats.by_region ? serverStats.by_region : null
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
            <p className="text-sm text-red-500 mb-4">{t('noPasswordSet')}</p>
          )}

          <input
            type="password"
            value={gate.entered}
            onChange={e => { gate.setEntered(e.target.value) }}
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
      <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between max-w-3xl mx-auto">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{t('header.label')}</p>
          <h1 className="text-lg font-bold text-[#1B1B1B]">{t('header.title')}</h1>
        </div>
        <a href="/" className="text-sm text-[#2D6A4F] font-medium hover:underline">
          {t('common:nav.backToPlanner')}
        </a>
      </div>

      {/* Status + refresh bar */}
      <div className="border-b border-gray-100 px-5 py-2 max-w-3xl mx-auto flex items-center gap-2">
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
          disabled={serverFetching || analyticsLoading}
          className="ml-auto text-xs text-[#2D6A4F] font-medium hover:underline
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {serverFetching || analyticsLoading ? t('status.refreshing') : t('status.refresh')}
        </button>
      </div>

      {/* Tab navigation — sticky on mobile */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 max-w-3xl mx-auto">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-[#48C4B0] text-[#48C4B0]'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-3xl mx-auto px-5 py-8">
        {/* Analytics loading / error states */}
        {analyticsLoading && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0,1,2,3].map(i => (
                <div key={i} className="bg-gray-50 rounded-2xl p-4 space-y-2">
                  <SkeletonBar h="h-3" w="w-3/4" />
                  <SkeletonBar h="h-8" />
                </div>
              ))}
            </div>
            <SectionSkeleton />
            <SectionSkeleton />
          </div>
        )}

        {!analyticsLoading && analyticsError && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 mb-4">
              Could not load analytics. Check that the database is reachable.
            </p>
            <button
              type="button"
              onClick={refreshStats}
              className="text-sm text-[#48C4B0] font-semibold hover:underline"
            >
              Retry
            </button>

            {/* Fallback: show legacy stats if analytics failed */}
            <div className="mt-10 text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
                {monthLabel}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <StatBox value={displayMonth} label={t('stats.plansThisMonth')} />
                <StatBox value={displayTotal} label={t('stats.plansAllTime')} />
              </div>
            </div>
          </div>
        )}

        {!analyticsLoading && !analyticsError && analyticsData && (
          <>
            {activeTab === 'overview' && <OverviewTab data={analyticsData} />}
            {activeTab === 'athletes' && <AthletesTab data={analyticsData} />}
            {activeTab === 'products' && <ProductsTab data={analyticsData} password={gate.entered} />}
            {activeTab === 'timeline' && <TimelineTab data={analyticsData} />}
          </>
        )}

        {/* Footer */}
        <p className="text-xs text-gray-300 text-center pt-8 pb-4">
          {t('footer')}
        </p>
      </div>
    </div>
  )
}
