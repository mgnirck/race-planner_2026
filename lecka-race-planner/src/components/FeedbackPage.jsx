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

function raceLabel(plan) {
  return plan.race_name || (plan.race_type
    ? plan.race_type.charAt(0).toUpperCase() + plan.race_type.slice(1).replace(/_/g, ' ')
    : 'Race plan')
}

// ── Primitive UI components ───────────────────────────────────────────────────

function FieldLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

function StarRating({ value, onChange }) {
  const [hovered, setHovered] = useState(null)
  const fill = hovered ?? value

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center
                     rounded-xl transition-colors hover:bg-[#48C4B0]/5"
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-8 h-8 transition-colors"
            fill={star <= fill ? '#48C4B0' : 'none'}
            stroke={star <= fill ? '#48C4B0' : '#d1d5db'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
    </div>
  )
}

function OptionGroup({ options, value, onChange }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'min-h-[52px] px-3 py-3 rounded-xl border-2 text-sm font-semibold',
            'transition-colors text-center leading-tight',
            value === opt.value
              ? 'border-[#48C4B0] bg-[#48C4B0]/5 text-[#48C4B0]'
              : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#48C4B0]',
          ].join(' ')}
        >
          {opt.label}
          {opt.sub && (
            <span className={`block text-xs font-normal mt-0.5 ${value === opt.value ? 'text-[#48C4B0]/70' : 'text-gray-400'}`}>
              {opt.sub}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FeedbackPage({ planId }) {
  const [plan,       setPlan]       = useState(null)
  const [loadError,  setLoadError]  = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  const [rating,         setRating]         = useState(0)
  const [hitCarbTarget,  setHitCarbTarget]  = useState('')
  const [giIssues,       setGiIssues]       = useState('')
  const [planFeltRight,  setPlanFeltRight]  = useState('')
  const [notes,          setNotes]          = useState('')

  const userId = localStorage.getItem('lecka_user_id')

  useEffect(() => {
    if (!userId) {
      window.location.replace(`/auth/login?next=${encodeURIComponent(`/feedback/${planId}`)}`)
      return
    }
    if (!planId) { setLoadError(true); return }

    fetch(`/api/plans?planId=${planId}`, {
      headers: { 'Authorization': `Bearer ${userId}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setPlan)
      .catch(() => setLoadError(true))
  }, [planId, userId])

  if (!userId) return null

  const canSubmit = rating > 0 && hitCarbTarget && giIssues && planFeltRight

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(false)

    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${userId}`,
        },
        body: JSON.stringify({
          planId,
          rating,
          hit_carb_target: hitCarbTarget,
          gi_issues:       giIssues,
          plan_felt_right: planFeltRight,
          notes:           notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error()
      window.location.replace('/dashboard?feedback=saved')
    } catch {
      setSubmitError(true)
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white min-h-screen">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
          <a
            href="/dashboard"
            className="text-sm text-[#48C4B0] font-medium hover:underline
                       min-h-[44px] flex items-center"
          >
            ← Dashboard
          </a>
          <img src="/logo.svg" alt="Lecka" className="h-6" />
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">

        {/* ── Page heading ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            Post-race feedback
          </p>
          <h1 className="text-2xl font-bold text-[#1B1B1B]">How did it go?</h1>
        </div>

        {/* ── Plan context card ─────────────────────────────────────────────── */}
        {loadError && (
          <div className="border-2 border-red-100 rounded-2xl p-5">
            <p className="text-sm text-red-500">Couldn't load plan details. You can still submit feedback.</p>
          </div>
        )}

        {plan && (
          <div className="border-2 border-gray-100 rounded-2xl p-4 flex flex-wrap gap-x-4 gap-y-1">
            <div className="w-full">
              <p className="text-sm font-bold text-[#1B1B1B]">{raceLabel(plan)}</p>
            </div>
            {formatGoalTime(plan.goal_minutes) && (
              <span className="text-xs text-gray-400">Goal {formatGoalTime(plan.goal_minutes)}</span>
            )}
            {plan.conditions && (
              <span className="text-xs text-gray-400">
                {plan.conditions.charAt(0).toUpperCase() + plan.conditions.slice(1).replace(/_/g, ' ')}
              </span>
            )}
          </div>
        )}

        {/* ── Feedback form ─────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} noValidate className="space-y-8">

          {/* 1 — Overall rating */}
          <div>
            <FieldLabel>How did the race go overall?</FieldLabel>
            <StarRating value={rating} onChange={setRating} />
            {rating > 0 && (
              <p className="text-xs text-[#48C4B0] mt-2">
                {['', 'Tough day out there', 'Could have gone better', 'Solid effort', 'Really strong race', 'Perfect race!'][rating]}
              </p>
            )}
          </div>

          {/* 2 — Carb targets */}
          <div>
            <FieldLabel>Did you manage to hit your carb targets?</FieldLabel>
            <OptionGroup
              value={hitCarbTarget}
              onChange={setHitCarbTarget}
              options={[
                { value: 'yes',    label: 'Yes' },
                { value: 'mostly', label: 'Mostly' },
                { value: 'no',     label: 'No' },
              ]}
            />
          </div>

          {/* 3 — GI issues */}
          <div>
            <FieldLabel>Any GI issues during the race?</FieldLabel>
            <OptionGroup
              value={giIssues}
              onChange={setGiIssues}
              options={[
                { value: 'none',        label: 'None' },
                { value: 'minor',       label: 'Minor' },
                { value: 'significant', label: 'Significant' },
              ]}
            />
          </div>

          {/* 4 — Plan felt right */}
          <div>
            <FieldLabel>Did the nutrition plan feel right for the conditions?</FieldLabel>
            <OptionGroup
              value={planFeltRight}
              onChange={setPlanFeltRight}
              options={[
                { value: 'yes',    label: 'Yes' },
                { value: 'mostly', label: 'Mostly' },
                { value: 'no',     label: 'No' },
              ]}
            />
          </div>

          {/* 5 — Notes */}
          <div>
            <FieldLabel>Anything else? (optional)</FieldLabel>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 500))}
              placeholder="What worked well, what didn't, anything you'd change…"
              rows={4}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm
                         focus:outline-none focus:border-[#48C4B0] resize-none
                         placeholder:text-gray-300"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{notes.length}/500</p>
          </div>

          {/* Submit */}
          {submitError && (
            <p className="text-sm text-red-500 text-center">
              Something went wrong — please try again.
            </p>
          )}

          <div className="pb-10">
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className={[
                'w-full min-h-[52px] rounded-xl text-sm font-bold transition-colors',
                canSubmit && !submitting
                  ? 'bg-[#48C4B0] text-white hover:bg-[#3db09d]'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed',
              ].join(' ')}
            >
              {submitting ? 'Saving…' : 'Save feedback'}
            </button>
            {!canSubmit && (
              <p className="text-xs text-gray-400 text-center mt-2">
                Please answer all questions above to continue.
              </p>
            )}
          </div>

        </form>
      </div>
    </div>
  )
}
