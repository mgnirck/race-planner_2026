import React, { useState, useEffect } from 'react'
import Nav from './Nav.jsx'

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
      const res = await fetch('/api/plans', {
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

function PlanCard({ plan, userId, onDateSaved, onNameSaved, onDeleted, showFeedback = false }) {
  const [addingDate,       setAddingDate]       = useState(false)
  const [editingName,      setEditingName]      = useState(false)
  const [nameValue,        setNameValue]        = useState(raceLabel(plan))
  const [savingName,       setSavingName]       = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting,         setDeleting]         = useState(false)

  const goalTime = formatGoalTime(plan.goal_minutes)
  const dateStr  = formatRaceDate(plan.race_date)

  const modeBadge = plan.mode === 'quick'
    ? { label: 'Quick', className: 'bg-gray-100 text-gray-500' }
    : plan.mode === 'pro'
    ? { label: 'Pro', className: 'bg-[#48C4B0]/10 text-[#48C4B0]' }
    : null

  function handleDateSaved(planId, newDate) {
    setAddingDate(false)
    onDateSaved(planId, newDate)
  }

  async function handleNameSave() {
    const trimmed = nameValue.trim()
    setSavingName(true)
    try {
      const res = await fetch('/api/plans', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ planId: plan.id, race_name: trimmed }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      onNameSaved(plan.id, updated.race_name)
      setEditingName(false)
    } catch {
      // keep input open on failure
    } finally {
      setSavingName(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch('/api/plans', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ planId: plan.id }),
      })
      if (!res.ok) throw new Error()
      onDeleted(plan.id)
    } catch {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <div className="border-2 border-gray-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleNameSave()
                  if (e.key === 'Escape') { setEditingName(false); setNameValue(raceLabel(plan)) }
                }}
                className="flex-1 min-w-0 border-2 border-[#48C4B0] rounded-xl px-3 py-1
                           text-sm text-[#1B1B1B] focus:outline-none"
              />
              <button
                onClick={handleNameSave}
                disabled={savingName}
                className="text-xs font-semibold text-white bg-[#48C4B0] rounded-lg px-2.5 py-1
                           hover:bg-[#3db09d] disabled:opacity-40 transition-colors"
              >
                {savingName ? '…' : '✓'}
              </button>
              <button
                onClick={() => { setEditingName(false); setNameValue(raceLabel(plan)) }}
                className="text-xs text-gray-400 hover:text-[#1B1B1B] transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              {modeBadge && (
                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md flex-shrink-0 ${modeBadge.className}`}>
                  {modeBadge.label}
                </span>
              )}
              <p className="text-base font-bold text-[#1B1B1B] leading-tight truncate">
                {raceLabel(plan)}
              </p>
            </div>
          )}
          {dateStr && !editingName && (
            <p className="text-sm text-[#48C4B0] font-medium mt-0.5">{dateStr}</p>
          )}
        </div>

        {!editingName && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setEditingName(true); setNameValue(raceLabel(plan)) }}
              title="Rename plan"
              className="p-1 text-gray-300 hover:text-[#48C4B0] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            {confirmingDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                >
                  {deleting ? '…' : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="text-xs text-gray-400 hover:text-[#1B1B1B] transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                title="Delete plan"
                className="p-1 text-gray-300 hover:text-red-400 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </button>
            )}
            <a
              href={`/plan/${plan.id}`}
              className="text-sm font-semibold text-[#48C4B0] hover:underline whitespace-nowrap mt-0.5"
            >
              View →
            </a>
          </div>
        )}
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

    fetch('/api/plans', {
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

  function handleNameSaved(planId, newName) {
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, race_name: newName } : p))
  }

  function handlePlanDeleted(planId) {
    setPlans(prev => prev.filter(p => p.id !== planId))
  }

  if (!userId) return null

  const { upcoming, past } = plans ? splitPlans(plans) : { upcoming: [], past: [] }
  const empty = plans && plans.length === 0

  return (
    <div className="bg-white min-h-screen">

      <Nav />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">

        {/* ── Page heading ─────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-[#1B1B1B]">Your race plans</h1>
        </div>

        {/* ── Start a new plan ──────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Start a new plan</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <a
              href="/planner"
              className="border-2 border-[#48C4B0] rounded-2xl p-5 block hover:bg-[#48C4B0]/5 transition-colors"
            >
              <p className="text-base font-bold text-[#1B1B1B] mb-1">Quick plan</p>
              <p className="text-sm text-gray-500 mb-4">3 inputs, instant result</p>
              <span className="text-sm font-semibold text-[#48C4B0]">Build quick plan →</span>
            </a>
            <a
              href="/planner/pro"
              className="bg-[#48C4B0] rounded-2xl p-5 block hover:bg-[#3db09d] transition-colors"
            >
              <p className="text-base font-bold text-white mb-1">Pro plan</p>
              <p className="text-sm text-white/75 mb-4">Full personalisation + gut training, aid stations &amp; more</p>
              <span className="text-sm font-semibold text-white">Build pro plan →</span>
            </a>
          </div>
        </section>

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
                  onNameSaved={handleNameSaved}
                  onDeleted={handlePlanDeleted}
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
                  onNameSaved={handleNameSaved}
                  onDeleted={handlePlanDeleted}
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
