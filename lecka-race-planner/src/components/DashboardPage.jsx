import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation, Trans } from 'react-i18next'
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

// Normalize a race_date value to a plain 'YYYY-MM-DD' string, regardless of
// whether the DB driver returned a Date object, an ISO datetime string, or a
// bare date string. Returns null for any falsy / unparseable input.
function normalizeDateStr(raw) {
  if (!raw) return null
  let s
  if (raw instanceof Date) {
    s = raw.toISOString()
  } else {
    s = String(raw)
  }
  // Strip any time/timezone component
  const bare = s.split('T')[0]
  // Validate it's actually a date before returning
  return /^\d{4}-\d{2}-\d{2}$/.test(bare) ? bare : null
}

function formatGoalTime(minutes) {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}:${String(m).padStart(2, '0')}`
}

function formatRaceDateLong(dateStr) {
  const d = normalizeDateStr(dateStr)
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatMonthDay(dateStr) {
  const d = normalizeDateStr(dateStr)
  if (!d) return { month: '—', day: '—' }
  const dt = new Date(d + 'T00:00:00')
  return {
    month: dt.toLocaleDateString('en-US', { month: 'short' }),
    day:   dt.getDate(),
  }
}

function formatMonthYear(dateStr) {
  const d = normalizeDateStr(dateStr)
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function daysUntil(dateStr) {
  const d = normalizeDateStr(dateStr)
  if (!d) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const race = new Date(d + 'T00:00:00')
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
    .filter(p => {
      const d = normalizeDateStr(p.race_date)
      return !d || new Date(d + 'T00:00:00') >= now
    })
    .sort((a, b) => {
      const da = normalizeDateStr(a.race_date)
      const db = normalizeDateStr(b.race_date)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return new Date(da + 'T00:00:00') - new Date(db + 'T00:00:00')
    })
  const past = plans
    .filter(p => {
      const d = normalizeDateStr(p.race_date)
      return d && new Date(d + 'T00:00:00') < now
    })
    .sort((a, b) => {
      const da = normalizeDateStr(a.race_date)
      const db = normalizeDateStr(b.race_date)
      return new Date(db + 'T00:00:00') - new Date(da + 'T00:00:00')
    })
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

function formatLastFetched(isoString, t) {
  if (!isoString) return null
  const d = new Date(isoString)
  const diffDays = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return t('updated.today')
  if (diffDays === 1) return t('updated.yesterday')
  return t('updated.date', { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })
}

function getHeroCoachMessage(plan, heroDetail, days, liveTemp, t) {
  const name = plan.race_name || t('coach.yourRace')
  if (liveTemp !== null && days !== null && days <= 14) {
    const cond = tempToConditions(liveTemp)
    if (cond === 'hot')  return t('coach.hot', { name, temp: Math.round(liveTemp) })
    if (cond === 'cool') return t('coach.cool', { name, temp: Math.round(liveTemp) })
  }
  if (plan.mode === 'quick') {
    if (days > 60) return t('coach.quick.far', { name })
    if (days > 14) return t('coach.quick.near', { name, days })
    return t('coach.quick.raceWeek')
  }
  if (days > 60) return t('coach.pro.far', { name, days })
  if (days > 14) return t('coach.pro.near', { days })
  return t('coach.pro.raceWeek', { name })
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

// ── Edit / Delete modal ───────────────────────────────────────────────────────

function EditPlanModal({ plan, userId, onSave, onClose }) {
  const { t } = useTranslation('dashboard')
  const [name, setName]   = useState(plan.race_name ?? '')
  const [date, setDate]   = useState(plan.race_date ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/plans', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ planId: plan.id, race_name: name }),
      })
      await fetch('/api/plans', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ planId: plan.id, race_date: date || null }),
      })
      onSave({ ...plan, race_name: name || null, race_date: date || null })
    } catch {}
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <p className="text-base font-bold text-gray-900">{t('edit.title')}</p>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t('edit.raceName')}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('edit.placeholder')}
            className="w-full border-2 rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: TEAL }}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t('edit.raceDate')}</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full border-2 rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: TEAL }}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white disabled:opacity-50"
            style={{ background: TEAL }}
          >
            {saving ? t('edit.saving') : t('edit.save')}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 border-gray-200 text-gray-600"
          >
            {t('edit.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
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
  const { t } = useTranslation('dashboard')
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
          {badge === 'live' ? t('hero.badge.live') : t('hero.badge.updated')}
        </span>
      )}
      <span className="text-[15px] font-medium text-gray-900">{value ?? '—'}</span>
      <span className="text-[10px] uppercase tracking-[.04em] text-gray-400 mt-1 text-center leading-tight">{label}</span>
    </div>
  )
}

// ── Hero Card ─────────────────────────────────────────────────────────────────

function HeroCard({ hero, heroDetail, userId, onEdit, onDelete }) {
  const { t } = useTranslation('dashboard')
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
  const _heroDateStr = normalizeDateStr(hero.race_date)
  const weatherWindowDate = _heroDateStr
    ? new Date(new Date(_heroDateStr + 'T00:00:00').getTime() - 14 * 24 * 60 * 60 * 1000)
    : null
  const weatherWindowStr = weatherWindowDate
    ? weatherWindowDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  const outsideWindow = days !== null && days > 14

  const [alertDismissed,  setAlertDismissed]  = useState(false)
  const [appliedTargets,  setAppliedTargets]  = useState(null)
  const [applyingWeather, setApplyingWeather] = useState(false)
  const [downloading,     setDownloading]     = useState(false)

  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/send-plan?planId=${hero.id}`, {
        headers: { 'Authorization': `Bearer ${userId}` },
      })
      if (!res.ok) throw new Error('failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `lecka-${(hero.race_name || hero.race_type || 'plan').toLowerCase().replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert(t('pdf.error'))
    } finally {
      setDownloading(false)
    }
  }

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
  const tempTileBadge = liveTemp !== null ? (hasSigChange && !alertDismissed ? 'updated' : 'live') : null
  const sodiumBadge   = showWeatherAlert ? 'updated' : null
  const fluidBadge    = showWeatherAlert ? 'updated' : null

  const coachMsg = getHeroCoachMessage(hero, heroDetail, days ?? 0, liveTemp, t)

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

  // Fuel card state — initialised from DB value once heroDetail loads
  const gelCount = (() => {
    if (isPro && heroDetail?.selection) {
      const gels = heroDetail.selection.filter?.(i => i?.type === 'gel' || i?.product?.type === 'gel')
      if (gels.length > 0) return gels.reduce((s, i) => s + (i.quantity ?? i.count ?? 1), 0)
    }
    return null
  })()

  // fuelDismissed persists in localStorage so "Done" survives a reload
  const dismissKey = `lecka_fuel_dismissed_${hero.id}`
  const [fuelDismissed, setFuelDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === '1' } catch { return false }
  })

  function dismissFuel() {
    try { localStorage.setItem(dismissKey, '1') } catch {}
    setFuelDismissed(true)
  }

  // savedReminderDate: the date string already in DB (ISO yyyy-mm-dd or null)
  const savedReminderDate = heroDetail?.fuel_reminder_date
    ? String(heroDetail.fuel_reminder_date).split('T')[0]
    : null

  // Editing state — only for when user wants to change an existing reminder
  const [editingReminder, setEditingReminder] = useState(false)
  const [pickDate,        setPickDate]        = useState('')
  // Live reminder date — may be updated after save without a full reload
  const [liveReminderDate, setLiveReminderDate] = useState(savedReminderDate)

  // Sync when heroDetail arrives (async)
  React.useEffect(() => {
    if (savedReminderDate && !liveReminderDate) setLiveReminderDate(savedReminderDate)
  }, [savedReminderDate]) // eslint-disable-line react-hooks/exhaustive-deps

  function formatReminderDate(isoDate) {
    if (!isoDate) return ''
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Idle picking state (when no reminder set yet)
  const [pickingNew, setPickingNew] = useState(false)
  const [newPickDate, setNewPickDate] = useState('')

  async function handleSetReminder(dateStr) {
    if (!dateStr) return
    try {
      await fetch('/api/plans', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ planId: hero.id, fuel_reminder_date: dateStr }),
      })
    } catch {}
    setLiveReminderDate(dateStr)
    setEditingReminder(false)
    setPickingNew(false)
    setNewPickDate('')
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
                {t('hero.nextRace')}
              </span>
              {isPro && <PlanPill mode="pro" />}
              <button onClick={() => onEdit(hero)} title="Edit" className="ml-1 text-gray-300 hover:text-gray-500 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.293-9.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L9 13z"/></svg>
              </button>
              <button onClick={() => onDelete(hero.id)} title="Delete" className="text-gray-300 hover:text-red-400 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 01-1-1V5a1 1 0 011-1h6a1 1 0 011 1v1a1 1 0 01-1 1H9z"/></svg>
              </button>
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
                <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: TEAL }}>{t('hero.daysToGo')}</p>
              </>
            ) : (
              <p className="text-4xl font-bold" style={{ color: GREY }}>—</p>
            )}
          </div>
        </div>

        {/* Stat tiles */}
        <div className="flex gap-1.5 mt-2">
          <StatTile label={t('hero.stat.target')}   value={goalTime} />
          <StatTile label={t('hero.stat.carbsHr')}  value={carbPerHour !== null ? `${carbPerHour}g` : '—'} />
          {isPro ? (
            <StatTile label={t('hero.stat.sodiumHr')} value={displaySodium !== null ? `${displaySodium}mg` : '—'}
              badge={sodiumBadge} highlighted={!!sodiumBadge} />
          ) : <LockedTile label={t('hero.stat.sodiumHr')} />}
          {isPro ? (
            <StatTile label={t('hero.stat.fluidHr')}  value={displayFluid !== null ? `${Math.round(displayFluid)}ml` : '—'}
              badge={fluidBadge} highlighted={!!fluidBadge} />
          ) : <LockedTile label={t('hero.stat.fluidHr')} />}
          {isPro ? (
            <StatTile label={liveTemp !== null ? t('hero.stat.forecast') : t('hero.stat.temp')} value={tempTileValue}
              badge={tempTileBadge} highlighted={tempTileBadge === 'updated'} />
          ) : <LockedTile label={t('hero.stat.temp')} />}
        </div>

        {/* Forecast source footnote */}
        {isPro && weatherLastFetched && (
          <p className="text-right text-[10px] text-gray-400 -mt-1 flex items-center justify-end gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('hero.forecast.source', { updated: formatLastFetched(weatherLastFetched, t) })}
          </p>
        )}

        {/* Weather notice strip — pro plan, outside 14-day window, no live data yet */}
        {isPro && outsideWindow && !liveTemp && city && weatherWindowStr && (
          <div className="rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: AMBER_LIGHT }}>
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke={AMBER} strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-xs leading-relaxed" style={{ color: AMBER_DARK }}>
              <Trans
                i18nKey="hero.weather.upcoming"
                values={{ city, date: weatherWindowStr }}
                components={{ bold: <strong className="font-semibold" /> }}
              />
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
            {t('hero.viewPlan')}
          </a>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading || !heroDetail}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-300 transition-colors disabled:opacity-40"
          >
            {downloading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a1 1 0 001 1h16a1 1 0 001-1v-3M3 7V4a1 1 0 011-1h5l2 2h7a1 1 0 011 1v3"/></svg>
            )}
            {downloading ? t('hero.generating') : t('hero.downloadPdf')}
          </button>
          <a
            href={`/plan/${hero.id}`}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            {t('hero.email')}
          </a>
        </div>
      </div>

      {/* Coach says strip */}
      <div className="px-5 py-3 flex items-start gap-3" style={{ background: TEAL_LIGHT }}>
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke={TEAL} strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: TEAL_MID }}>{t('hero.coachSays')}</p>
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
              <p className="text-sm font-bold mb-1" style={{ color: CORAL }}>{tempDiff > 0 ? t('hero.alert.heat') : t('hero.alert.cold')}</p>
              <p className="text-xs leading-relaxed" style={{ color: CORAL }}>
                {t('hero.alert.body', {
                  temp: Math.round(liveTemp),
                  diff: Math.abs(Math.round(tempDiff)),
                  direction: t(tempDiff > 0 ? 'hero.alert.warmer' : 'hero.alert.cooler'),
                  change: t(tempDiff > 0 ? 'hero.alert.increased' : 'hero.alert.decreased'),
                })}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                onClick={handleApplyWeather}
                disabled={applyingWeather}
                className="px-3 py-1.5 text-xs font-bold rounded-lg text-white disabled:opacity-50"
                style={{ background: CORAL }}
              >
                {applyingWeather ? '…' : t('hero.alert.apply')}
              </button>
              <button
                onClick={() => setAlertDismissed(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border-2 whitespace-nowrap"
                style={{ borderColor: CORAL, color: CORAL }}
              >
                {t('hero.alert.keepMine')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fuel section — two modes: reminder set (persistent strip) vs not set (dismissable card) */}

      {/* ── Reminder already set: compact persistent strip ── */}
      {liveReminderDate && !editingReminder && (
        <div className="mx-5 my-4 rounded-xl px-4 py-3 flex items-center gap-2" style={{ background: AMBER_LIGHT }}>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke={AMBER} strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <p className="flex-1 text-xs font-medium" style={{ color: AMBER_MID }}>
            {t('hero.fuel.reminder', { date: formatReminderDate(liveReminderDate) })}
          </p>
          <button
            onClick={() => { setPickDate(liveReminderDate); setEditingReminder(true) }}
            title="Edit reminder date"
            className="text-amber-400 hover:text-amber-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.293-9.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L9 13z"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Editing existing reminder: date picker inline ── */}
      {liveReminderDate && editingReminder && (
        <div className="mx-5 my-4 rounded-xl p-4 space-y-3" style={{ background: AMBER_LIGHT }}>
          <p className="text-xs font-semibold" style={{ color: AMBER_DARK }}>{t('hero.fuel.changeReminder')}</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={pickDate}
              onChange={e => setPickDate(e.target.value)}
              className="flex-1 min-w-0 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
              style={{ borderColor: AMBER }}
            />
            <button
              onClick={() => handleSetReminder(pickDate)}
              disabled={!pickDate}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40 flex-shrink-0"
              style={{ background: AMBER }}
            >
              {t('hero.fuel.save')}
            </button>
            <button
              onClick={() => setEditingReminder(false)}
              className="px-3 py-2 text-sm font-semibold rounded-lg border-2 bg-white"
              style={{ borderColor: AMBER, color: AMBER }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── No reminder set yet: dismissable card ── */}
      {!liveReminderDate && !fuelDismissed && (
        <div className="mx-5 my-4 rounded-xl p-4" style={{ background: AMBER_LIGHT }}>
          {!pickingNew ? (
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke={AMBER} strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <p className="text-sm font-semibold" style={{ color: AMBER_DARK }}>{t('hero.fuel.title')}</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: AMBER_MID }}>
                  {isPro
                    ? (gelCount ? t('hero.fuel.gelsPro', { count: gelCount }) : t('hero.fuel.gelsProUnknown'))
                    : t('hero.fuel.gelsQuick')}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={dismissFuel}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg text-white whitespace-nowrap"
                  style={{ background: AMBER }}
                >
                  {t('hero.fuel.done')}
                </button>
                <button
                  onClick={() => setPickingNew(true)}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg border-2 bg-white whitespace-nowrap"
                  style={{ borderColor: AMBER, color: AMBER }}
                >
                  {t('hero.fuel.remindMe')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold" style={{ color: AMBER_DARK }}>{t('hero.fuel.setReminder')}</p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={newPickDate}
                  onChange={e => setNewPickDate(e.target.value)}
                  className="flex-1 min-w-0 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                  style={{ borderColor: AMBER }}
                />
                <button
                  onClick={() => handleSetReminder(newPickDate)}
                  disabled={!newPickDate}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40 flex-shrink-0"
                  style={{ background: AMBER }}
                >
                  {t('hero.fuel.set')}
                </button>
                <button
                  onClick={() => { setPickingNew(false); setNewPickDate('') }}
                  className="px-3 py-2 text-sm font-semibold rounded-lg border-2 bg-white"
                  style={{ borderColor: AMBER, color: AMBER }}
                >
                  ×
                </button>
              </div>
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
            <p className="text-sm font-semibold" style={{ color: TEAL_DARK }}>{t('hero.upgrade.title')}</p>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: GREY_MID }}>
            {t('hero.upgrade.body')}
          </p>
          <button
            onClick={() => handleUpgrade(heroDetail)}
            className="w-full py-2.5 text-sm font-semibold rounded-lg text-white mt-1 transition-colors"
            style={{ background: TEAL }}
          >
            {t('hero.upgrade.cta')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Upcoming row ──────────────────────────────────────────────────────────────

function UpcomingRow({ plan, onEdit, onDelete }) {
  const { t } = useTranslation('dashboard')
  const { month, day } = formatMonthDay(plan.race_date)
  const goalTime = formatGoalTime(plan.goal_minutes)
  const tempLabel = plan.display_temp_c
    ? `${Math.round(parseFloat(plan.display_temp_c))}°C`
    : null
  const kmLabel = plan.custom_km ? `${plan.custom_km} km` : null

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
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{t('plan.goal', { time: goalTime })}</span>
          )}
          {kmLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{kmLabel}</span>
          )}
          {plan.mode === 'pro' && tempLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: GREY_LIGHT, color: GREY_MID }}>{tempLabel}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={() => onEdit(plan)} title="Edit" className="text-gray-300 hover:text-gray-500 transition-colors p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.293-9.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L9 13z"/></svg>
        </button>
        <button onClick={() => onDelete(plan.id)} title="Delete" className="text-gray-300 hover:text-red-400 transition-colors p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 01-1-1V5a1 1 0 011-1h6a1 1 0 011 1v1a1 1 0 01-1 1H9z"/></svg>
        </button>
        <a href={`/plan/${plan.id}`} className="text-sm font-bold" style={{ color: TEAL }}>
          {t('plan.view')}
        </a>
      </div>
    </div>
  )
}

// ── Past row ──────────────────────────────────────────────────────────────────

function PastRow({ plan, compact = false, onEdit, onDelete }) {
  const { t } = useTranslation('dashboard')
  const { month, day } = formatMonthDay(plan.race_date)
  const monthYear = formatMonthYear(plan.race_date)
  const goalTime  = formatGoalTime(plan.goal_minutes)
  const kmLabel   = plan.custom_km ? `${plan.custom_km} km` : null

  if (compact) {
    const compactMeta = [month, goalTime].filter(Boolean).join(' · ')
    return (
      <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-600 truncate block">{raceLabel(plan)}</span>
          {compactMeta && (
            <span className="text-[10px] text-gray-400">{compactMeta}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => onEdit(plan)} title="Edit" className="text-gray-300 hover:text-gray-500 transition-colors p-0.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.293-9.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L9 13z"/></svg>
          </button>
          <button onClick={() => onDelete(plan.id)} title="Delete" className="text-gray-300 hover:text-red-400 transition-colors p-0.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 01-1-1V5a1 1 0 011-1h6a1 1 0 011 1v1a1 1 0 01-1 1H9z"/></svg>
          </button>
          {plan.has_feedback
            ? <span className="text-xs text-green-500">✓</span>
            : <a href={`/feedback/${plan.id}`} className="text-xs font-bold" style={{ color: CORAL }}>{t('plan.log')}</a>
          }
        </div>
      </div>
    )
  }

  // detail line varies: logged = "Jan 2025 · 1:34 finish"; unlogged = "Oct 2024 · 42.2 km"
  const detailParts = plan.has_feedback
    ? [monthYear, goalTime ? t('plan.finish', { time: goalTime }) : null].filter(Boolean)
    : [monthYear, kmLabel].filter(Boolean)
  const detailLine = detailParts.join(' · ')

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
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">{t('plan.logged')}</span>
          ) : (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: CORAL_LIGHT, color: CORAL }}>
              {t('plan.logDue')}
            </span>
          )}
        </div>
        {detailLine && (
          <p className="text-[11px] text-gray-400 mt-0.5">{detailLine}</p>
        )}
        {plan.has_feedback && plan.feedback_note && (
          <p className="text-[11px] italic mt-0.5 truncate" style={{ color: GREY_MID }}>{plan.feedback_note}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
        <button onClick={() => onEdit(plan)} title="Edit" className="text-gray-300 hover:text-gray-500 transition-colors p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.293-9.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L9 13z"/></svg>
        </button>
        <button onClick={() => onDelete(plan.id)} title="Delete" className="text-gray-300 hover:text-red-400 transition-colors p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 01-1-1V5a1 1 0 011-1h6a1 1 0 011 1v1a1 1 0 01-1 1H9z"/></svg>
        </button>
        {plan.has_feedback
          ? <a href={`/plan/${plan.id}`}     className="text-sm font-bold" style={{ color: TEAL }}>{t('plan.view')}</a>
          : <a href={`/feedback/${plan.id}`} className="text-sm font-bold" style={{ color: CORAL }}>{t('plan.log')}</a>
        }
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const [plans,         setPlans]         = useState(null)
  const [heroDetail,    setHeroDetail]    = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(false)
  const [showOlder,     setShowOlder]     = useState(false)
  const [editingPlan,   setEditingPlan]   = useState(null)
  const [deletingId,    setDeletingId]    = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const userId = localStorage.getItem('lecka_user_id')

  function handleEditSave(updated) {
    setPlans(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
    setEditingPlan(null)
  }

  function handleDeleteRequest(planId) {
    setDeletingId(planId)
    setDeleteConfirm(true)
  }

  async function handleDeleteConfirm() {
    if (!deletingId) return
    setDeleteConfirm(false)
    try {
      await fetch('/api/plans', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ planId: deletingId }),
      })
    } catch {}
    setPlans(prev => prev ? prev.filter(p => p.id !== deletingId) : prev)
    if (heroDetail?.id === deletingId) setHeroDetail(null)
    setDeletingId(null)
  }

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
        // Hero fetch is isolated — never lets an error bubble to the outer .catch
        try {
          const { upcoming } = splitPlans(data)
          const hero = upcoming[0]
          if (hero) {
            fetch(`/api/plans?planId=${hero.id}`, { headers: { 'Authorization': `Bearer ${userId}` } })
              .then(r => r.ok ? r.json() : null)
              .then(detail => { if (detail) setHeroDetail(detail) })
              .catch(() => {})
          }
        } catch {}
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!userId) return null

  const { upcoming, past } = plans ? splitPlans(plans) : { upcoming: [], past: [] }
  const hero    = upcoming[0] ?? null
  const empty   = plans && plans.length === 0

  const recentPast = past.slice(0, 3)
  const olderPast  = past.slice(3)

  const olderByYear = olderPast.reduce((acc, p) => {
    const d = normalizeDateStr(p.race_date)
    const year = d ? new Date(d + 'T00:00:00').getFullYear() : 'Unknown'
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
            <p className="text-sm text-red-500">{t('error')}</p>
            <button onClick={() => window.location.reload()} className="mt-3 text-sm font-semibold text-red-400 underline">
              {t('retry')}
            </button>
          </div>
        )}

        {empty && (
          <div className="border-2 border-gray-100 rounded-2xl p-8 text-center">
            <p className="text-base font-semibold text-gray-800 mb-1">{t('empty.title')}</p>
            <p className="text-sm text-gray-400 mb-5">{t('empty.body')}</p>
            <a href="/" className="inline-block px-6 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: TEAL }}>
              {t('empty.cta')}
            </a>
          </div>
        )}

        {/* Hero card */}
        {!loading && !error && hero && (
          <HeroCard
            hero={hero}
            heroDetail={heroDetail}
            userId={userId}
            onEdit={setEditingPlan}
            onDelete={handleDeleteRequest}
          />
        )}

        {/* Two-column: Upcoming + Past */}
        {!loading && !error && plans && plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

            <section>
              <SectionLabel>{t('upcoming')}</SectionLabel>
              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                {upcoming.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {upcoming.map(plan => (
                      <div key={plan.id} className="px-4">
                        <UpcomingRow plan={plan} onEdit={setEditingPlan} onDelete={handleDeleteRequest} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-400">{t('noUpcoming')}</p>
                )}
                <div className="px-4 py-3 border-t border-gray-100">
                  <a href="/" className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: TEAL }}>
                    <span className="text-base leading-none">+</span> {t('addRace')}
                  </a>
                </div>
              </div>
            </section>

            {past.length > 0 && (
              <section>
                <SectionLabel>{t('past')}</SectionLabel>
                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {recentPast.map(plan => (
                      <div key={plan.id} className="px-4">
                        <PastRow plan={plan} onEdit={setEditingPlan} onDelete={handleDeleteRequest} />
                      </div>
                    ))}
                  </div>
                  {olderPast.length > 0 && (
                    <>
                      <button
                        onClick={() => setShowOlder(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 hover:text-gray-600 border-t border-gray-100 transition-colors"
                      >
                        <span>{showOlder ? t('showLess') : t('showOlder', { count: olderPast.length })}</span>
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
                                  <div key={plan.id} className="px-4">
                                    <PastRow plan={plan} compact onEdit={setEditingPlan} onDelete={handleDeleteRequest} />
                                  </div>
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

      {/* Edit modal */}
      {editingPlan && (
        <EditPlanModal
          plan={editingPlan}
          userId={userId}
          onSave={handleEditSave}
          onClose={() => setEditingPlan(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 space-y-4">
            <p className="text-base font-bold text-gray-900">{t('delete.title')}</p>
            <p className="text-sm text-gray-500">{t('delete.body')}</p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white bg-red-500"
              >
                {t('delete.confirm')}
              </button>
              <button
                onClick={() => { setDeleteConfirm(false); setDeletingId(null) }}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 border-gray-200 text-gray-600"
              >
                {t('delete.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
