import React, { useState, useEffect } from 'react'
import Nav from './Nav.jsx'

// ── Colour constants ──────────────────────────────────────────────────────────

const TEAL      = '#1D9E75'
const TEAL_LIGHT  = '#E1F5EE'
const TEAL_DARK   = '#085041'
const TEAL_MID    = '#0F6E56'
const GREY        = '#888780'
const GREY_LIGHT  = '#F1EFE8'
const GREY_MID    = '#5F5E5A'
const AMBER       = '#BA7517'
const AMBER_LIGHT = '#FAEEDA'
const AMBER_DARK  = '#633806'
const AMBER_MID   = '#854F0B'
const CORAL       = '#993C1D'
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

function getHeroCoachMessage(plan, heroDetail, days) {
  const name = plan.race_name || 'your race'
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
      style={{
        background: isPro ? TEAL_LIGHT : GREY_LIGHT,
        color:      isPro ? TEAL_MID   : GREY_MID,
      }}
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
      <span className="text-base">🔒</span>
      <span className="text-[10px] uppercase tracking-[.04em] text-gray-400 mt-1 text-center leading-tight">{label}</span>
    </div>
  )
}

function StatTile({ label, value }) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center rounded-xl px-2 py-3 min-w-0"
      style={{ background: TEAL_LIGHT }}
    >
      <span className="text-[15px] font-medium" style={{ color: TEAL_DARK }}>{value ?? '—'}</span>
      <span className="text-[10px] uppercase tracking-[.04em] mt-1 text-center leading-tight" style={{ color: TEAL_MID }}>{label}</span>
    </div>
  )
}

// ── Hero Card ─────────────────────────────────────────────────────────────────

function HeroCard({ hero, heroDetail, userId }) {
  const isPro    = hero.mode === 'pro'
  const days     = daysUntil(hero.race_date)
  const dateStr  = formatRaceDateLong(hero.race_date)
  const goalTime = formatGoalTime(hero.goal_minutes)

  const targets = heroDetail?.targets ?? {}
  const carbPerHour   = targets.carb_per_hour   ?? null
  const sodiumPerHour = targets.sodium_per_hour  ?? null
  const fluidPerHour  = targets.fluid_ml_per_hour ?? null
  const condLabel     = hero.conditions
    ? hero.conditions.charAt(0).toUpperCase() + hero.conditions.slice(1)
    : null

  const coachMsg = getHeroCoachMessage(hero, heroDetail, days ?? 0)

  // gel count for fuel card
  const gelCount = (() => {
    if (isPro && heroDetail?.selection) {
      const gels = heroDetail.selection.filter?.(i => i?.type === 'gel' || i?.product?.type === 'gel')
      if (gels.length > 0) return gels.reduce((s, i) => s + (i.quantity ?? i.count ?? 1), 0)
    }
    return null
  })()

  const [remindState, setRemindState] = useState('idle')
  const [remindDate,  setRemindDate]  = useState('')
  const [remindConfirmedDate, setRemindConfirmedDate] = useState('')
  const [fuelDismissed, setFuelDismissed] = useState(false)

  async function handleSetReminder() {
    if (!remindDate) return
    try {
      await fetch('/api/plans', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ planId: hero.id, fuel_reminder_date: remindDate }),
      })
    } catch {}
    setRemindConfirmedDate(new Date(remindDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }))
    setRemindState('confirmed')
  }

  return (
    <div
      className="border-l-4 rounded-2xl bg-white border border-gray-100 overflow-hidden"
      style={{ borderLeftColor: isPro ? TEAL : GREY }}
    >
      <div className="p-5 space-y-4">

        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: TEAL_LIGHT, color: TEAL_MID }}
              >
                Next race
              </span>
              <PlanPill mode={hero.mode} />
              {dateStr && (
                <span className="text-xs text-gray-400">{dateStr}</span>
              )}
            </div>
            <p className="leading-tight truncate" style={{ fontSize: 19, fontWeight: 500, color: '#1B1B1B' }}>
              {raceLabel(hero)}
            </p>
          </div>

          {/* Countdown */}
          <div className="flex-shrink-0 text-right">
            {days !== null ? (
              <>
                <p className="text-4xl font-bold" style={{ color: TEAL_DARK }}>{days}</p>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: TEAL }}> days to go</p>
              </>
            ) : (
              <p className="text-4xl font-bold" style={{ color: GREY }}>—</p>
            )}
          </div>
        </div>

        {/* Stat tiles */}
        <div className="flex gap-1.5">
          <StatTile label="Target time" value={goalTime} />
          <StatTile label="Carbs/hr" value={carbPerHour !== null ? `${carbPerHour}g` : '—'} />
          {isPro ? (
            <StatTile label="Sodium/hr" value={sodiumPerHour !== null ? `${sodiumPerHour}mg` : '—'} />
          ) : (
            <LockedTile label="Sodium/hr" />
          )}
          {isPro ? (
            <StatTile label="Fluid/hr" value={fluidPerHour !== null ? `${Math.round(fluidPerHour)}ml` : '—'} />
          ) : (
            <LockedTile label="Fluid/hr" />
          )}
          {isPro ? (
            <StatTile label="Temp" value={condLabel ?? '—'} />
          ) : (
            <LockedTile label="Temp" />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <a
            href={`/plan/${hero.id}`}
            className="flex-1 text-center text-sm font-semibold rounded-xl py-2.5 text-white transition-colors"
            style={{ background: TEAL }}
          >
            View full plan
          </a>
          <a
            href={`/plan/${hero.id}#print`}
            onClick={e => { e.preventDefault(); window.print() }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"/></svg>
            Print
          </a>
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

      {/* TODO: weather alert card */}

      {/* Fuel ordered? card */}
      {!fuelDismissed && (
        <div className="mx-5 my-4 rounded-xl p-4 space-y-3" style={{ background: AMBER_LIGHT }}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke={AMBER} strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <p className="text-sm font-semibold" style={{ color: AMBER_DARK }}>Fuel ordered yet?</p>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: AMBER_MID }}>
            {isPro
              ? (gelCount ? `~${gelCount} gels based on your plan. Check your full plan for quantities.` : 'Check your full plan for quantities.')
              : '~12 gels based on your quick plan. Upgrade for exact quantities.'}
          </p>

          {remindState === 'idle' && (
            <div className="flex gap-2">
              <button
                onClick={() => setFuelDismissed(true)}
                className="flex-1 py-2 text-sm font-semibold rounded-lg text-white transition-colors"
                style={{ background: AMBER }}
              >
                Done
              </button>
              <button
                onClick={() => setRemindState('picking')}
                className="flex-1 py-2 text-sm font-semibold rounded-lg border-2 transition-colors"
                style={{ borderColor: AMBER, color: AMBER }}
              >
                Remind me
              </button>
            </div>
          )}

          {remindState === 'picking' && (
            <div className="flex gap-2">
              <input
                type="date"
                value={remindDate}
                onChange={e => setRemindDate(e.target.value)}
                className="flex-1 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: AMBER }}
              />
              <button
                onClick={handleSetReminder}
                disabled={!remindDate}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-40"
                style={{ background: AMBER }}
              >
                Set
              </button>
            </div>
          )}

          {remindState === 'confirmed' && (
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: AMBER_MID }}>Reminder set for {remindConfirmedDate}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFuelDismissed(true)}
                  className="flex-1 py-2 text-sm font-semibold rounded-lg text-white"
                  style={{ background: AMBER }}
                >
                  Done
                </button>
                <button
                  onClick={() => { setRemindState('idle'); setRemindDate('') }}
                  className="flex-1 py-2 text-sm font-semibold rounded-lg border-2"
                  style={{ borderColor: AMBER, color: AMBER }}
                >
                  Cancel
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
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
  const goalTime = formatGoalTime(plan.goal_minutes)
  const condLabel = plan.conditions
    ? plan.conditions.charAt(0).toUpperCase() + plan.conditions.slice(1)
    : null

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      {/* Date column */}
      <div className="flex flex-col items-center w-8 flex-shrink-0">
        <span className="text-[10px] uppercase tracking-wide text-gray-400 leading-none">{month}</span>
        <span className="text-base font-bold text-gray-700 leading-tight">{day}</span>
      </div>

      {/* Name + pills */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-gray-800 truncate">{raceLabel(plan)}</span>
          <PlanPill mode={plan.mode} />
        </div>
        <div className="flex gap-1.5 mt-0.5 flex-wrap">
          {goalTime && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Goal {goalTime}</span>
          )}
          {plan.mode === 'pro' && condLabel && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: TEAL_LIGHT, color: TEAL_MID }}>{condLabel}</span>
          )}
        </div>
      </div>

      <a href={`/plan/${plan.id}`} className="text-sm font-semibold flex-shrink-0" style={{ color: TEAL }}>
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
      <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
        <div className="flex flex-col items-center w-8 flex-shrink-0">
          <span className="text-[10px] uppercase tracking-wide text-gray-400 leading-none">{month}</span>
          <span className="text-sm font-bold text-gray-500 leading-tight">{day}</span>
        </div>
        <span className="flex-1 text-sm text-gray-500 truncate">{raceLabel(plan)}</span>
        {plan.has_feedback
          ? <a href={`/plan/${plan.id}`} className="text-xs font-semibold flex-shrink-0" style={{ color: TEAL }}>View →</a>
          : <a href={`/feedback/${plan.id}`} className="text-xs font-semibold flex-shrink-0" style={{ color: CORAL }}>Log →</a>
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
          <span className="text-sm font-medium text-gray-800 truncate">{raceLabel(plan)}</span>
          <PlanPill mode={plan.mode} />
          {plan.has_feedback ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">✓ Logged</span>
          ) : (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: CORAL_LIGHT, color: CORAL }}
            >
              Log due
            </span>
          )}
        </div>
      </div>

      {plan.has_feedback
        ? <a href={`/plan/${plan.id}`} className="text-sm font-semibold flex-shrink-0" style={{ color: TEAL }}>View →</a>
        : <a href={`/feedback/${plan.id}`} className="text-sm font-semibold flex-shrink-0" style={{ color: CORAL }}>Log →</a>
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
            setPlans(prev => prev ? [{ id: data.planId, ...result.targets, race_name: result.form?.race_name ?? null, race_date: result.form?.race_date ?? null, mode: planMode, created_at: new Date().toISOString() }, ...prev] : prev)
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
        // Fetch hero detail
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
  const hero  = upcoming[0] ?? null
  const rest  = upcoming.slice(1)
  const empty = plans && plans.length === 0

  const recentPast = past.slice(0, 3)
  const olderPast  = past.slice(3)

  // Group older past by year
  const olderByYear = olderPast.reduce((acc, p) => {
    const year = new Date(p.race_date + 'T00:00:00').getFullYear()
    if (!acc[year]) acc[year] = []
    acc[year].push(p)
    return acc
  }, {})

  return (
    <div className="bg-white min-h-screen">
      <Nav />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: TEAL, borderTopColor: 'transparent' }} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="border-2 border-red-100 rounded-2xl p-5 text-center">
            <p className="text-sm text-red-500">Couldn't load your plans. Please refresh.</p>
            <button onClick={() => window.location.reload()} className="mt-3 text-sm font-semibold text-red-400 underline">
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {empty && (
          <div className="border-2 border-gray-100 rounded-2xl p-8 text-center">
            <p className="text-base font-semibold text-gray-800 mb-1">No plans yet</p>
            <p className="text-sm text-gray-400 mb-5">Build your first race nutrition plan.</p>
            <a
              href="/"
              className="inline-block px-6 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: TEAL }}
            >
              Build your first race plan →
            </a>
          </div>
        )}

        {/* Hero card */}
        {!loading && !error && hero && (
          <section>
            <SectionLabel>Your next race</SectionLabel>
            <HeroCard hero={hero} heroDetail={heroDetail} userId={userId} />
          </section>
        )}

        {/* Upcoming list */}
        {!loading && !error && (rest.length > 0 || hero) && (
          <section>
            <SectionLabel>Upcoming races</SectionLabel>
            <div className="rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
              {rest.map(plan => (
                <div key={plan.id} className="px-4">
                  <UpcomingRow plan={plan} />
                </div>
              ))}
              {rest.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-400">No other upcoming races.</div>
              )}
              <div className="px-4 py-3">
                <a href="/" className="text-sm font-semibold" style={{ color: TEAL }}>+ Add a race</a>
              </div>
            </div>
          </section>
        )}

        {/* Past races */}
        {!loading && !error && past.length > 0 && (
          <section>
            <SectionLabel>Past races</SectionLabel>
            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {recentPast.map(plan => (
                  <div key={plan.id} className="px-4">
                    <PastRow plan={plan} />
                  </div>
                ))}
              </div>

              {olderPast.length > 0 && (
                <>
                  <button
                    onClick={() => setShowOlder(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 hover:text-gray-600 border-t border-gray-100 transition-colors"
                  >
                    <span>{showOlder ? 'Show less' : `Show ${olderPast.length} older races`}</span>
                    <svg className={`w-4 h-4 transition-transform ${showOlder ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showOlder && (
                    <div className="border-t border-gray-100">
                      {Object.keys(olderByYear).sort((a, b) => b - a).map(year => (
                        <div key={year}>
                          <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-gray-50">{year}</p>
                          <div className="divide-y divide-gray-100">
                            {olderByYear[year].map(plan => (
                              <div key={plan.id} className="px-4">
                                <PastRow plan={plan} compact />
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
    </div>
  )
}
