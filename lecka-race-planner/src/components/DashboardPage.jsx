import React, { useState, useEffect } from 'react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGoalTime(minutes) {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatRaceDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
    .filter(p => !p.race_date || new Date(p.race_date) >= now)
    .sort((a, b) => {
      if (!a.race_date && !b.race_date) return 0
      if (!a.race_date) return 1
      if (!b.race_date) return -1
      return new Date(a.race_date) - new Date(b.race_date)
    })
  const past = plans
    .filter(p => p.race_date && new Date(p.race_date) < now)
    .sort((a, b) => new Date(b.race_date) - new Date(a.race_date))
  return { upcoming, past }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

function MetaChip({ children }) {
  return (
    <span className="inline-block text-xs text-gray-400 bg-gray-50 border border-gray-100
                     px-2 py-0.5 rounded-full">
      {children}
    </span>
  )
}

function AddDateInline({ planId, userId, onSaved }) {
  const [value,  setValue]  = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!value) return
    setSaving(true)
    try {
      const res = await fetch('/api/plans/update', {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${userId}`,
        },
        body: JSON.stringify({ planId, race_date: value }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      onSaved(planId, updated.race_date)
    } catch {
      // silently keep the input open on failure
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <input
        type="date"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="border-2 border-gray-200 rounded-xl px-3 py-1.5 text-sm
                   focus:outline-none focus:border-[#48C4B0] text-[#1B1B1B]"
      />
      <button
        onClick={handleSave}
        disabled={!value || saving}
        className="text-sm font-semibold text-white bg-[#48C4B0] rounded-xl
                   px-3 py-1.5 hover:bg-[#3db09d] transition-colors
                   disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function PlanCard({ plan, userId, onDateSaved, showFeedback = false }) {
  const [addingDate, setAddingDate] = useState(false)

  const goalTime = formatGoalTime(plan.goal_minutes)
  const dateStr  = formatRaceDate(plan.race_date)

  function handleDateSaved(planId, newDate) {
    setAddingDate(false)
    onDateSaved(planId, newDate)
  }

  return (
    <div className="border-2 border-gray-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-[#1B1B1B] leading-tight truncate">
            {raceLabel(plan)}
          </p>
          {dateStr && (
            <p className="text-sm text-[#48C4B0] font-medium mt-0.5">{dateStr}</p>
          )}
        </div>
        <a
          href={`/plan/${plan.id}`}
          className="text-sm font-semibold text-[#48C4B0] hover:underline whitespace-nowrap flex-shrink-0 mt-0.5"
        >
          View plan →
        </a>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {goalTime && <MetaChip>Goal {goalTime}</MetaChip>}
        {plan.conditions && (
          <MetaChip>
            {plan.conditions.charAt(0).toUpperCase() + plan.conditions.slice(1).replace(/_/g, ' ')}
          </MetaChip>
        )}
      </div>

      <div className="flex items-center justify-between pt-0.5">
        {!plan.race_date && !addingDate && (
          <button
            onClick={() => setAddingDate(true)}
            className="text-xs font-semibold text-gray-400 hover:text-[#48C4B0]
                       transition-colors underline underline-offset-2"
          >
            + Add race date
          </button>
        )}
        {addingDate && (
          <AddDateInline planId={plan.id} userId={userId} onSaved={handleDateSaved} />
        )}

        {showFeedback && (
          plan.has_feedback
            ? (
              <span className="ml-auto text-xs font-semibold text-green-600 bg-green-50
                               border border-green-100 px-2.5 py-0.5 rounded-full">
                ✓ Feedback logged
              </span>
            )
            : (
              <a
                href={`/feedback/${plan.id}`}
                className="ml-auto text-sm font-semibold text-[#48C4B0]
                           hover:underline"
              >
                How did it go? →
              </a>
            )
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [plans,   setPlans]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  const userId = localStorage.getItem('lecka_user_id')
  const email  = localStorage.getItem('lecka_user_email')

  useEffect(() => {
    if (!userId) {
      window.location.replace('/auth/login')
      return
    }

    fetch('/api/plans/list', {
      headers: { 'Authorization': `Bearer ${userId}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setPlans(data); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [userId])

  function logout() {
    localStorage.removeItem('lecka_user_id')
    localStorage.removeItem('lecka_user_email')
    window.location.replace('/')
  }

  function handleDateSaved(planId, newDate) {
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, race_date: newDate } : p))
  }

  if (!userId) return null

  const { upcoming, past } = plans ? splitPlans(plans) : { upcoming: [], past: [] }
  const empty = plans && plans.length === 0

  return (
    <div className="bg-white min-h-screen">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <img src="/logo.svg" alt="Lecka" className="h-6 flex-shrink-0" />
          <div className="flex-1 min-w-0 text-right">
            {email && (
              <p className="text-xs text-gray-400 truncate">{email}</p>
            )}
          </div>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-[#1B1B1B] transition-colors
                       whitespace-nowrap flex-shrink-0"
          >
            Log out
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">

        {/* ── Page heading ─────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-[#1B1B1B]">Your race plans</h1>
        </div>

        {/* ── Loading ──────────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-[#48C4B0] border-t-transparent
                            rounded-full animate-spin" />
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <div className="border-2 border-red-100 rounded-2xl p-5 text-center">
            <p className="text-sm text-red-500">Couldn't load your plans. Please refresh.</p>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────────── */}
        {empty && (
          <div className="border-2 border-gray-100 rounded-2xl p-8 text-center">
            <p className="text-base font-semibold text-[#1B1B1B] mb-1">No plans yet</p>
            <p className="text-sm text-gray-400 mb-5">
              Build your first race nutrition plan.
            </p>
            <a
              href="/"
              className="inline-block px-6 py-3 bg-[#48C4B0] text-white rounded-xl
                         text-sm font-semibold hover:bg-[#3db09d] transition-colors"
            >
              Build your first race plan →
            </a>
          </div>
        )}

        {/* ── Upcoming ─────────────────────────────────────────────────────── */}
        {!loading && !error && upcoming.length > 0 && (
          <section>
            <SectionLabel>Upcoming races</SectionLabel>
            <div className="space-y-3">
              {upcoming.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  userId={userId}
                  onDateSaved={handleDateSaved}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Past ─────────────────────────────────────────────────────────── */}
        {!loading && !error && past.length > 0 && (
          <section>
            <SectionLabel>Past races</SectionLabel>
            <div className="space-y-3">
              {past.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  userId={userId}
                  onDateSaved={handleDateSaved}
                  showFeedback
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        {!loading && !error && !empty && (
          <div className="pb-10 text-center">
            <a
              href="/"
              className="text-sm text-gray-400 hover:text-[#48C4B0] transition-colors"
            >
              + Plan another race
            </a>
          </div>
        )}

      </div>
    </div>
  )
}
