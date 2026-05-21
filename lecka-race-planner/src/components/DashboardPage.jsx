import React, { useState, useEffect, useMemo } from 'react'
import Nav from './Nav.jsx'
import { calculateTargets } from '../engine/nutrition-engine'

// ── Colour constants ──────────────────────────────────────────────────────────

const TEAL       = '#1D9E75'
const TEAL_LIGHT = '#E1F5EE'
const TEAL_DARK  = '#085041'
const TEAL_MID   = '#0F6E56'
const GREY       = '#888780'
const GREY_LIGHT = '#F1EFE8'
const GREY_MID   = '#5F5E5A'
const AMBER      = '#BA7517'
const AMBER_LIGHT = '#FAEEDA'
const AMBER_DARK  = '#633806'
const AMBER_MID   = '#854F0B'
const CORAL      = '#993C1D'
const CORAL_LIGHT = '#FAECE7'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGoalTime(minutes) {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}:${String(m).padStart(2, '0')}`
}

function formatRaceDateLong(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatMonthDay(dateStr) {
  if (!dateStr) return { month: '—', day: '—' }
  const d = new Date(dateStr + 'T00:00:00')
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    day:   d.getDate(),
  }
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const race = new Date(dateStr + 'T00:00:00')
  return Math.round((race - now) / (1000 * 60 * 60 * 24))
}

function raceLabel(plan) {
  return plan.race_name || (plan.race_type
    ? plan.race_type.charAt(0).toUpperCase() + plan.race_type.slice(1).replace(/_/g, ' ')
    : 'Race plan')
}

function raceTypeLabel(raceType) {
  if (!raceType) return null
  return raceType.charAt(0).toUpperCase() + raceType.slice(1).replace(/_/g, ' ')
}

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function splitPlans(plans) {
  const now = today()
  const upcoming = plans
    .filter(p => !p.race_date || new Date(p.race_date + 'T00:00:00') >= now)
    .sort((a, b) => {
      if (!a.race_date && !b.race_date) return 0
      if (!a.race_date) return 1
      if (!b.race_date) return -1
      return new Date(a.race_date) - new Date(b.race_date)
    })
  const past = plans
    .filter(p => p.race_date && new Date(p.race_date + 'T00:00:00') < now)
    .sort((a, b) => new Date(b.race_date) - new Date(a.race_date))
  return { upcoming, past }
}

// Maps a conditions label to a representative °C value for comparison
function conditionsToEstimatedTemp(conditions) {
  const map = { cool: 8, mild: 15, warm: 22, hot: 30 }
  return map[conditions] ?? 15
}

// Maps a live °C value back to the nearest conditions label
function tempToConditions(tempC) {
  if (tempC === null || tempC === undefined) return 'mild'
  if (tempC < 10) return 'cool'
  if (tempC < 20) return 'mild'
  if (tempC < 28) return 'warm'
  return 'hot'
}

function formatLastFetched(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  const diffDays = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'updated today'
  if (diffDays === 1) return 'updated yesterday'
  return `updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function getHeroCoachMessage(plan, heroDetail, days, liveTemp) {
  const name = plan.race_name || 'your race'
  if (liveTemp !== null && days !== null && days <= 14) {
    const cond = tempToConditions(liveTemp)
    if (cond === 'hot')  return `${name} is looking hot — ${Math.round(liveTemp)}°C at race start. Pre-hydrate the morning before. Carry fluid to every aid station, don't skip any. Your carbs stay the same but sodium and fluid are up. Adjust your kit accordingly.`
    if (cond === 'cool') return `Good news for ${name} — ${Math.round(liveTemp)}°C is ideal running weather. Your fluid targets drop slightly. Stick to the plan.`
  }
  if (plan.mode === 'quick') {
    if (days > 60) return `Good base plan for ${name}. For a race this important, upgrading to Pro will dial in your sodium and fluid targets and add weather-aware pacing. Plenty of time to build on this.`
    if (days > 14) return `${days} days to ${name} — solid foundation. Upgrade to Pro for aid station timing and live weather targets.`
    return `Race week. Your quick plan gives you carb targets. Pro adds sodium, fluid, and a race-day timeline.`
  }
  if (days > 60) return `${days} days to ${name} — plenty of time. Focus on gut training with your plan targets from week 8 out.`
  if (days > 14) return `${days} days out. Weather integration active — we'll update your plan if conditions shift significantly.`
  return `Race week for ${name}. Stick exactly to your plan. No new products, no changes.`
}

function handleUpgrade(heroDetail) {
  const inputs = heroDetail?.inputs ?? {}
  const draft = {
    race_name:    inputs.race_name ?? '',
    race_date:    inputs.race_date ?? '',
    race_type:    inputs.race_type ?? '',
    goal_time_h:  inputs.goal_time_h ?? '',
    goal_time_m:  inputs.goal_time_m ?? '',
    conditions:   inputs.conditions ?? 'mild',
    temperature:  inputs.temperature ?? 'mild',
    humidity:     inputs.humidity ?? 'dry',
    surface_type: inputs.surface_type ?? '',
    weight_value: inputs.weight_value ?? '',
    weight_unit:  inputs.weight_unit ?? 'kg',
    gender:       inputs.gender ?? '',
    caffeine_ok:  inputs.caffeine_ok ?? null,
    _from_simple: true,
  }
  try { sessionStorage.setItem('lecka_form_draft', JSON.stringify(draft)) } catch {}
  window.location.href = '/planner/pro'
}

// ── Primitive UI ──────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

function PlanPill({ mode }) {
  const isPro = mode === 'pro'
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: isPro ? TEAL_LIGHT : GREY_LIGHT, color: isPro ? TEAL_MID : GREY_MID }}
    >
      {isPro ? 'Pro' : 'Quick'}
    </span>
  )
}

function LockedTile({ label }) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center rounded-xl px-2 py-3 min-w-0"
      style={{ border: '1.5px dashed #D1D0CB', opacity: 0.6 }}
    >
      <span className="text-sm">🔒</span>
      <span className="text-[10px] uppercase tracking-[.04em] text-gray-400 mt-1 text-center leading-tight">{label}</span>
    </div>
  )
}

// badge: null | 'live' | 'updated'
// highlighted: show amber border
function StatTile({ label, value, badge = null, highlighted = false }) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center rounded-xl px-2 min-w-0 relative"
      style={{
        background: '#F5F4F0',
        border: highlighted ? `1.5px solid ${AMBER}` : '1.5px solid transparent',
        paddingTop:    badge ? 20 : 12,
        paddingBottom: 12,
      }}
    >
      {badge && (
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: badge === 'live' ? TEAL : AMBER, color: '#fff' }}
        >
          {badge === 'live' ? 'live' : '↑ updated'}
        </span>
      )}
      <span className="text-[15px] font-medium text-gray-900">{value ?? '—'}</span>
      <span className="text-[10px] uppercase tracking-[.04em] text-gray-400 mt-1 text-center leading-tight">{label}</span>
    </div>
  )
}

// ── Hero Card ─────────────────────────────────────────────────────────────────

function HeroCard({ hero, heroDetail, userId }) {
  const isPro    = hero.mode === 'pro'
  const days     = daysUntil(hero.race_date)
  const dateStr  = formatRaceDateLong(hero.race_date)

  // Meta line: "April 21, 2025 · Marathon · 42.2 km · Berlin"
  const typeName = raceTypeLabel(hero.race_type)
  const distKm   = heroDetail?.inputs?.custom_km ? `${heroDetail.inputs.custom_km} km` : null
  const city     = heroDetail?.race_city || heroDetail?.inputs?.race_city || null
  const metaParts = [dateStr, typeName, distKm, city].filter(Boolean)
  const metaLine  = metaParts.join(' · ')

  const goalTime = formatGoalTime(hero.goal_minutes)
  const baseTargets = heroDetail?.targets ?? {}
  const carbPerHour   = baseTargets.carb_per_hour    ?? null
  const sodiumPerHour = baseTargets.sodium_per_hour   ?? null
  const fluidPerHour  = baseTargets.fluid_ml_per_hour ?? null

  // ── Weather state ──────────────────────────────────────────────────────────
  const liveTemp           = heroDetail?.weather_live_temp_c ?? null
  const weatherLastFetched = heroDetail?.weather_last_fetched ?? null
  const weatherConfirmedDB = heroDetail?.weather_confirmed ?? false
  const estimatedTempC     = conditionsToEstimatedTemp(hero.conditions)
  const tempDiff           = liveTemp !== null ? liveTemp - estimatedTempC : 0
  const hasSigChange       = liveTemp !== null && Math.abs(tempDiff) > 4

  // Days until the 14-day forecast window opens
  const weatherWindowDate = hero.race_date
    ? new Date(new Date(hero.race_date + 'T00:00:00').getTime() - 14 * 24 * 60 * 60 * 1000)
    : null
  const weatherWindowStr = weatherWindowDate
    ? weatherWindowDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  const outsideWindow = days !== null && days > 14

  const [alertDismissed,  setAlertDismissed]  = useState(false)
  const [appliedTargets,  setAppliedTargets]  = useState(null)
  const [applyingWeather, setApplyingWeather] = useState(false)

  // Recalculate targets with live weather conditions (client-side, pure)
  const pendingTargets = useMemo(() => {
    if (!hasSigChange || !heroDetail?.inputs || weatherConfirmedDB) return null
    const inp = heroDetail.inputs
    const weight_kg = parseFloat(inp.weight_value) * (inp.weight_unit === 'lb' ? 0.453592 : 1)
    if (!weight_kg || isNaN(weight_kg)) return null
    try {
      return calculateTargets({
        race_type:        hero.race_type,
        goal_minutes:     hero.goal_minutes,
        weight_kg,
        gender:           inp.gender,
        conditions:       tempToConditions(liveTemp),
        effort:           inp.effort,
        caffeine_ok:      inp.caffeine_ok,
        athlete_profile:  inp.athlete_profile,
        elevation_gain_m: inp.elevation_gain_m ?? 0,
        distance_km:      parseFloat(inp.custom_km) || 0,
        training_mode:    inp.training_mode ?? false,
      })
    } catch {
      return null
    }
  }, [hasSigChange, heroDetail, weatherConfirmedDB, hero, liveTemp])

  const showWeatherAlert = isPro && pendingTargets !== null && !alertDismissed && !weatherConfirmedDB
  const effectiveTargets = (appliedTargets) ?? (showWeatherAlert ? pendingTargets : baseTargets)
  const displaySodium = effectiveTargets?.sodium_per_hour   ?? null
  const displayFluid  = effectiveTargets?.fluid_ml_per_hour ?? null

  // Temp tile display
  const tempTileValue = liveTemp !== null
    ? `${Math.round(liveTemp * 10) / 10}°C`
    : hero.conditions ? `~${estimatedTempC}°C` : '—'
  const tempTileLabel = liveTemp !== null ? 'Forecast' : 'Temp'
  const tempTileBadge = liveTemp !== null ? (hasSigChange && !alertDismissed ? 'updated' : 'live') : null
  const sodiumBadge   = showWeatherAlert ? 'updated' : null
  const fluidBadge    = showWeatherAlert ? 'updated' : null

  const coachMsg = getHeroCoachMessage(hero, heroDetail, days ?? 0, liveTemp)

  async function handleApplyWeather() {
    if (!pendingTargets) return
    setApplyingWeather(true)
    try {
      await fetch('/api/plans', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ planId: hero.id, targets: pendingTargets }),
      })
    } catch {}
    setAppliedTargets(pendingTargets)
    setAlertDismissed(true)
    setApplyingWeather(false)
  }

  // Fuel card state
  const gelCount = (() => {
    if (isPro && heroDetail?.selection) {
      const gels = heroDetail.selection.filter?.(i => i?.type === 'gel' || i?.product?.type === 'gel')
      if (gels.length > 0) return gels.reduce((s, i) => s + (i.quantity ?? i.count ?? 1), 0)
    }
    return null
  })()

  const [remindState,          setRemindState]          = useState('idle')
  const [remindDate,           setRemindDate]           = useState('')
  const [remindConfirmedDate,  setRemindConfirmedDate]  = useState('')
  const [fuelDismissed,        setFuelDismissed]        = useState(false)

  async function handleSetReminder() {
    if (!remindDate) return
    try {
      await fetch('/api/plans', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ planId: hero.id, fuel_reminder_date: remindDate }),
      })
    } catch {}
    setRemindConfirmedDate(
      new Date(remindDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    )
    setRemindState('confirmed')
  }

  return (
    <div
      className="border-l-4 rounded-2xl bg-white border border-gray-100 overflow-hidden"
      style={{ borderLeftColor: isPro ? TEAL : GREY }}
    >
      <div className="p-5 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: TEAL_LIGHT, color: TEAL_MID }}
              >
                Next race
              </span>
              {isPro && <PlanPill mode="pro" />}
            </div>
            {metaLine && (
              <p className="text-xs text-gray-400 mb-1 leading-tight">{metaLine}</p>
            )}
            <p className="leading-tight font-bold" style={{ fontSize: 20, color: '#1B1B1B' }}>
              {raceLabel(hero)}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            {days !== null ? (
              <>
                <p className="text-4xl font-bold leading-none" style={{ color: TEAL_DARK }}>{days}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: TEAL }}>days to go</p>
              </>
            ) : (
              <p className="text-4xl font-bold" style={{ color: GREY }}>—</p>
            )}
          </div>
        </div>

        {/* Stat tiles */}
        <div className="flex gap-1.5 mt-2">
          <StatTile label="Target"    value={goalTime} />
          <StatTile label="Carbs/hr"  value={carbPerHour !== null ? `${carbPerHour}g` : '—'} />
          {isPro ? (
            <StatTile label="Sodium/hr" value={displaySodium !== null ? `${displaySodium}mg` : '—'}
              badge={sodiumBadge} highlighted={!!sodiumBadge} />
          ) : <LockedTile label="Sodium/hr" />}
          {isPro ? (
            <StatTile label="Fluid/hr"  value={displayFluid !== null ? `${Math.round(displayFluid)}ml` : '—'}
              badge={fluidBadge} highlighted={!!fluidBadge} />
          ) : <LockedTile label="Fluid/hr" />}
          {isPro ? (
            <StatTile label={tempTileLabel} value={tempTileValue}
              badge={tempTileBadge} highlighted={tempTileBadge === 'updated'} />
          ) : <LockedTile label="Temp" />}
        </div>

        {/* Forecast source footnote */}
        {isPro && weatherLastFetched && (
          <p className="text-right text-[10px] text-gray-400 -mt-1 flex items-center justify-end gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Forecast via Open-Meteo · {formatLastFetched(weatherLastFetched)}
          </p>
        )}

        {/* Weather notice strip — pro plan, outside 14-day window, no live data yet */}
        {isPro && outsideWindow && !liveTemp && city && weatherWindowStr && (
          <div className="rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: AMBER_LIGHT }}>
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke={AMBER} strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-xs leading-relaxed" style={{ color: AMBER_DARK }}>
              Weather based on your estimate. Live forecast for <strong>{city}</strong> unlocks{' '}
              <strong>{weatherWindowStr}</strong> — we'll update your plan automatically.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <a
            href={`/plan/${hero.id}`}
            className="flex-1 text-center text-sm font-semibold rounded-xl py-2.5 text-white transition-colors"
            style={{ background: TEAL }}
          >
            View full plan
          </a>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"/></svg>
            Print
          </button>
          <a
            href={`/plan/${hero.id}`}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Email
          </a>
        </div>
      </div>

      {/* Coach says strip */}
      <div className="px-5 py-3 flex items-start gap-3" style={{ background: TEAL_LIGHT }}>
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke={TEAL} strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: TEAL_MID }}>Coach says</p>
          <p className="text-sm leading-relaxed" style={{ color: TEAL_DARK }}>{coachMsg}</p>
        </div>
      </div>

      {/* Weather alert card */}
      {showWeatherAlert && (
        <div className="mx-5 my-4 rounded-xl p-4" style={{ background: CORAL_LIGHT }}>
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke={CORAL} strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold mb-1" style={{ color: CORAL }}>Plan updated for {tempDiff > 0 ? 'heat' : 'cold'}</p>
              <p className="text-xs leading-relaxed" style={{ color: CORAL }}>
                Forecast shows {Math.round(liveTemp)}°C —{' '}
                {Math.abs(Math.round(tempDiff))}° {tempDiff > 0 ? 'warmer' : 'cooler'} than your estimate.
                Sodium and fluid targets have been {tempDiff > 0 ? 'increased' : 'decreased'}.
                Review and confirm to apply.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                onClick={handleApplyWeather}
                disabled={applyingWeather}
                className="px-3 py-1.5 text-xs font-bold rounded-lg text-white disabled:opacity-50"
                style={{ background: CORAL }}
              >
                {applyingWeather ? '…' : 'Apply'}
              </button>
              <button
                onClick={() => setAlertDismissed(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border-2 whitespace-nowrap"
                style={{ borderColor: CORAL, color: CORAL }}
              >
                Keep mine
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fuel ordered? card */}
      {!fuelDismissed && (
        <div className="mx-5 my-4 rounded-xl p-4 space-y-3" style={{ background: AMBER_LIGHT }}>

          {/* Heading row */}
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke={AMBER} strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <p className="text-sm font-semibold" style={{ color: AMBER_DARK }}>Fuel ordered yet?</p>
          </div>

          {/* Body — varies by state */}
          {remindState === 'idle' && (
            <p className="text-xs leading-relaxed" style={{ color: AMBER_MID }}>
              {isPro
                ? (gelCount ? `~${gelCount} gels based on your plan. Check your full plan for quantities.` : 'Check your full plan for quantities.')
                : '~12 gels based on your quick plan. Upgrade for exact quantities.'}
            </p>
          )}

          {remindState === 'picking' && (
            <>
              <p className="text-xs font-medium" style={{ color: AMBER_MID }}>Remind me on:</p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={remindDate}
                  onChange={e => setRemindDate(e.target.value)}
                  className="flex-1 min-w-0 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                  style={{ borderColor: AMBER }}
                />
                <button
                  onClick={handleSetReminder}
                  disabled={!remindDate}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40 flex-shrink-0"
                  style={{ background: AMBER }}
                >
                  Set
                </button>
              </div>
            </>
          )}

          {remindState === 'confirmed' && (
            <div className="flex items-center gap-1.5" style={{ color: AMBER_MID }}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <p className="text-xs font-medium">Reminder set for {remindConfirmedDate}</p>
            </div>
          )}

          {/* Action buttons — always a horizontal row at bottom */}
          {remindState === 'idle' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setFuelDismissed(true)}
                className="flex-1 py-2 text-sm font-semibold rounded-lg text-white"
                style={{ background: AMBER }}
              >
                Done
              </button>
              <button
                onClick={() => setRemindState('picking')}
                className="flex-1 py-2 text-sm font-semibold rounded-lg border-2 bg-white"
                style={{ borderColor: AMBER, color: AMBER }}
              >
                Remind me
              </button>
            </div>
          )}

          {remindState === 'confirmed' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setFuelDismissed(true)}
                className="flex-1 py-2 text-sm font-semibold rounded-lg text-white"
                style={{ background: AMBER }}
              >
                Done
              </button>
              <button
                onClick={() => { setRemindState('idle'); setRemindDate('') }}
                className="flex-1 py-2 text-sm font-semibold rounded-lg border-2 bg-white"
                style={{ borderColor: AMBER, color: AMBER }}
              >
                × Cancel
              </button>
            </div>
          )}

        </div>
      )}

      {/* Upgrade card (quick plans only) */}
      {!isPro && (
        <div className="mx-5 mb-5 rounded-xl p-4 border-2 space-y-2" style={{ borderColor: TEAL }}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke={TEAL} strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-sm font-semibold" style={{ color: TEAL_DARK }}>Upgrade to pro plan</p>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: GREY_MID }}>
            Get sodium &amp; fluid targets, live race-day weather, aid station plan, and gut training schedule — built on what you've already entered.
          </p>
          <button
            onClick={() => handleUpgrade(heroDetail)}
            className="w-full py-2.5 text-sm font-semibold rounded-lg text-white mt-1 transition-colors"
            style={{ background: TEAL }}
          >
            Upgrade →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Upcoming row ──────────────────────────────────────────────────────────────

function UpcomingRow({ plan }) {
  const { month, day } = formatMonthDay(plan.race_date)
  const goalTime  = formatGoalTime(plan.goal_minutes)
  const condLabel = plan.conditions
    ? `~${plan.conditions.charAt(0).toUpperCase() + plan.conditions.slice(1)}`
    : null

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="flex flex-col items-center w-8 flex-shrink-0">
        <span className="text-[10px] uppercase tracking-wide text-gray-400 leading-none">{month}</span>
        <span className="text-base font-bold text-gray-700 leading-tight">{day}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-sm font-semibold text-gray-800 truncate">{raceLabel(plan)}</span>
          <PlanPill mode={plan.mode} />
        </div>
        <div className="flex gap-1.5 mt-0.5 flex-wrap">
          {goalTime && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Goal {goalTime}</span>
          )}
          {plan.mode === 'pro' && condLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: GREY_LIGHT, color: GREY_MID }}>{condLabel}</span>
          )}
        </div>
      </div>
      <a href={`/plan/${plan.id}`} className="text-sm font-bold flex-shrink-0" style={{ color: TEAL }}>
        View →
      </a>
    </div>
  )
}

// ── Past row ──────────────────────────────────────────────────────────────────

function PastRow({ plan, compact = false }) {
  const { month, day } = formatMonthDay(plan.race_date)

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
        <div className="flex flex-col items-center w-8 flex-shrink-0">
          <span className="text-[10px] uppercase tracking-wide text-gray-400 leading-none">{month}</span>
          <span className="text-sm font-bold text-gray-500 leading-tight">{day}</span>
        </div>
        <span className="flex-1 text-sm text-gray-500 truncate">{raceLabel(plan)}</span>
        {plan.has_feedback
          ? <a href={`/plan/${plan.id}`}    className="text-xs font-bold flex-shrink-0" style={{ color: TEAL }}>View →</a>
          : <a href={`/feedback/${plan.id}`} className="text-xs font-bold flex-shrink-0" style={{ color: CORAL }}>Log →</a>
        }
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="flex flex-col items-center w-8 flex-shrink-0 mt-0.5">
        <span className="text-[10px] uppercase tracking-wide text-gray-400 leading-none">{month}</span>
        <span className="text-base font-bold text-gray-700 leading-tight">{day}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-800 truncate">{raceLabel(plan)}</span>
          <PlanPill mode={plan.mode} />
          {plan.has_feedback ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">✓ Logged</span>
          ) : (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: CORAL_LIGHT, color: CORAL }}>
              Log due
            </span>
          )}
        </div>
      </div>
      {plan.has_feedback
        ? <a href={`/plan/${plan.id}`}    className="text-sm font-bold flex-shrink-0 mt-0.5" style={{ color: TEAL }}>View →</a>
        : <a href={`/feedback/${plan.id}`} className="text-sm font-bold flex-shrink-0 mt-0.5" style={{ color: CORAL }}>Log →</a>
      }
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [plans,      setPlans]      = useState(null)
  const [heroDetail, setHeroDetail] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)
  const [showOlder,  setShowOlder]  = useState(false)

  const userId = localStorage.getItem('lecka_user_id')

  // Auto-save a plan that was created before the user was logged in
  useEffect(() => {
    const needsSave = localStorage.getItem('lecka_plan_needs_save')
    if (!needsSave || !userId) return
    localStorage.removeItem('lecka_plan_needs_save')
    try {
      const raw = localStorage.getItem('lecka_current_plan')
      if (!raw) return
      const result = JSON.parse(raw)
      if (!result?.targets || !result?.selection) return
      const planMode = result.mode === 'simple' ? 'quick' : 'pro'
      fetch('/api/plans', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body: JSON.stringify({
          inputs:    { ...(result.form ?? {}), mode: planMode },
          targets:   result.targets,
          selection: result.selection,
          region:    result.form?.region ?? 'us',
          lang:      'en',
        }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.planId) {
            setPlans(prev => prev ? [{
              id: data.planId, ...result.targets,
              race_name: result.form?.race_name ?? null,
              race_date: result.form?.race_date ?? null,
              mode: planMode,
              created_at: new Date().toISOString(),
            }, ...prev] : prev)
          }
        })
        .catch(() => {})
    } catch {}
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userId) {
      window.location.replace('/auth/login')
      return
    }
    fetch('/api/plans', { headers: { 'Authorization': `Bearer ${userId}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setPlans(data)
        setLoading(false)
        const { upcoming } = splitPlans(data)
        const hero = upcoming[0]
        if (hero) {
          fetch(`/api/plans?planId=${hero.id}`, { headers: { 'Authorization': `Bearer ${userId}` } })
            .then(r => r.ok ? r.json() : null)
            .then(detail => { if (detail) setHeroDetail(detail) })
            .catch(() => {})
        }
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!userId) return null

  const { upcoming, past } = plans ? splitPlans(plans) : { upcoming: [], past: [] }
  const hero         = upcoming[0] ?? null
  const restUpcoming = upcoming.slice(1)
  const empty        = plans && plans.length === 0

  const recentPast = past.slice(0, 3)
  const olderPast  = past.slice(3)

  const olderByYear = olderPast.reduce((acc, p) => {
    const year = new Date(p.race_date + 'T00:00:00').getFullYear()
    if (!acc[year]) acc[year] = []
    acc[year].push(p)
    return acc
  }, {})

  return (
    <div className="bg-white min-h-screen">
      <Nav />

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-8">

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: TEAL, borderTopColor: 'transparent' }} />
          </div>
        )}

        {error && (
          <div className="border-2 border-red-100 rounded-2xl p-5 text-center">
            <p className="text-sm text-red-500">Couldn't load your plans. Please refresh.</p>
            <button onClick={() => window.location.reload()} className="mt-3 text-sm font-semibold text-red-400 underline">
              Retry
            </button>
          </div>
        )}

        {empty && (
          <div className="border-2 border-gray-100 rounded-2xl p-8 text-center">
            <p className="text-base font-semibold text-gray-800 mb-1">No plans yet</p>
            <p className="text-sm text-gray-400 mb-5">Build your first race nutrition plan.</p>
            <a href="/" className="inline-block px-6 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: TEAL }}>
              Build your first race plan →
            </a>
          </div>
        )}

        {/* Hero card */}
        {!loading && !error && hero && (
          <HeroCard hero={hero} heroDetail={heroDetail} userId={userId} />
        )}

        {/* Two-column: Upcoming + Past */}
        {!loading && !error && plans && plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

            <section>
              <SectionLabel>Upcoming races</SectionLabel>
              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                {restUpcoming.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {restUpcoming.map(plan => (
                      <div key={plan.id} className="px-4"><UpcomingRow plan={plan} /></div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-400">No other upcoming races.</p>
                )}
                <div className="px-4 py-3 border-t border-gray-100">
                  <a href="/" className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: TEAL }}>
                    <span className="text-base leading-none">+</span> Add a race
                  </a>
                </div>
              </div>
            </section>

            {past.length > 0 && (
              <section>
                <SectionLabel>Past races</SectionLabel>
                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {recentPast.map(plan => (
                      <div key={plan.id} className="px-4"><PastRow plan={plan} /></div>
                    ))}
                  </div>
                  {olderPast.length > 0 && (
                    <>
                      <button
                        onClick={() => setShowOlder(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 hover:text-gray-600 border-t border-gray-100 transition-colors"
                      >
                        <span>{showOlder ? 'Show less' : `Show ${olderPast.length} older`}</span>
                        <svg className={`w-4 h-4 transition-transform ${showOlder ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showOlder && (
                        <div className="border-t border-gray-100">
                          {Object.keys(olderByYear).sort((a, b) => b - a).map(year => (
                            <div key={year}>
                              <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-gray-50">{year}</p>
                              <div className="divide-y divide-gray-100">
                                {olderByYear[year].map(plan => (
                                  <div key={plan.id} className="px-4"><PastRow plan={plan} compact /></div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
