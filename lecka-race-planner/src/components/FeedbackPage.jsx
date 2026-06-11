import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('common')
  const [plan,       setPlan]       = useState(null)
  const [loadError,  setLoadError]  = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  const [rating,         setRating]         = useState(0)
  const [hitCarbTarget,  setHitCarbTarget]  = useState('')
  const [giIssues,       setGiIssues]       = useState('')
  const [planFeltRight,  setPlanFeltRight]  = useState('')
  const [notes,          setNotes]          = useState('')
  // product_log: { [productId]: { status: 'used'|'skipped'|'swapped', swap_note: string, planned_qty: number, actual_qty: number } }
  const [productLog, setProductLog] = useState({})

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

  // Build a flat list of products from plan.selection for the product log section.
  // Each entry: { id, name, type, planned_qty }
  const planProducts = React.useMemo(() => {
    if (!plan?.selection) return []
    return (plan.selection ?? []).map(item => ({
      id:          item.product_id ?? item.product?.id ?? item.id ?? '',
      name:        item.product?.name ?? item.name ?? item.product_id ?? 'Product',
      type:        item.product?.type ?? item.type ?? '',
      planned_qty: item.quantity ?? item.qty ?? 1,
    })).filter(p => p.id)
  }, [plan])

  const canSubmit = rating > 0 && hitCarbTarget && giIssues

  function updateProductLog(productId, patch) {
    setProductLog(prev => ({
      ...prev,
      [productId]: { ...(prev[productId] ?? {}), ...patch },
    }))
  }

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
        // Serialise productLog — only include entries the user actually interacted with
        body: JSON.stringify({
          planId,
          rating,
          hit_carb_target: hitCarbTarget,
          gi_issues:       giIssues,
          plan_felt_right: planFeltRight,
          notes:           notes.trim() || null,
          product_log:     Object.keys(productLog).length > 0 ? productLog : null,
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
            {t('feedback.back')}
          </a>
          <img src="/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" className="h-6" />
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">

        {/* ── Page heading ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            {t('feedback.category')}
          </p>
          <h1 className="text-2xl font-bold text-[#1B1B1B]">{t('feedback.title')}</h1>
        </div>

        {/* ── Plan context card ─────────────────────────────────────────────── */}
        {loadError && (
          <div className="border-2 border-red-100 rounded-2xl p-5">
            <p className="text-sm text-red-500">{t('feedback.loadError')}</p>
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
            <FieldLabel>{t('feedback.overall')}</FieldLabel>
            <StarRating value={rating} onChange={setRating} />
            {rating > 0 && (
              <p className="text-xs text-[#48C4B0] mt-2">
                {[null, t('feedback.rating.1'), t('feedback.rating.2'), t('feedback.rating.3'), t('feedback.rating.4'), t('feedback.rating.5')][rating]}
              </p>
            )}
          </div>

          {/* 2 — Carb targets */}
          <div>
            <FieldLabel>{t('feedback.carbTarget')}</FieldLabel>
            <OptionGroup
              value={hitCarbTarget}
              onChange={setHitCarbTarget}
              options={[
                { value: 'yes',    label: t('feedback.yes') },
                { value: 'mostly', label: t('feedback.mostly') },
                { value: 'no',     label: t('feedback.no') },
              ]}
            />
          </div>

          {/* 3 — GI issues */}
          <div>
            <FieldLabel>{t('feedback.giIssues')}</FieldLabel>
            <OptionGroup
              value={giIssues}
              onChange={setGiIssues}
              options={[
                { value: 'none',        label: t('feedback.none') },
                { value: 'minor',       label: t('feedback.minor') },
                { value: 'significant', label: t('feedback.significant') },
              ]}
            />
          </div>

          {/* Product log — only shown if the plan has products */}
          {planProducts.length > 0 && (
            <div>
              <FieldLabel>What did you use?</FieldLabel>
              <p className="text-xs text-gray-400 mb-3">
                Mark each product from your plan. Tap +/- to log actual quantities.
              </p>
              <div className="space-y-3">
                {planProducts.map(product => {
                  const entry = productLog[product.id] ?? {}
                  const status = entry.status ?? null
                  const actualQty = entry.actual_qty ?? product.planned_qty

                  return (
                    <div
                      key={product.id}
                      className="border-2 border-gray-100 rounded-xl p-4"
                    >
                      {/* Product name + planned qty */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-[#1B1B1B] leading-tight">
                            {product.name}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Planned: {product.planned_qty}
                          </p>
                        </div>
                      </div>

                      {/* Status toggle: Used / Skipped / Swapped */}
                      <div className="flex gap-2 flex-wrap mb-3">
                        {[
                          { value: 'used',    label: '✓ Used' },
                          { value: 'skipped', label: '✗ Skipped' },
                          { value: 'swapped', label: '↔ Swapped' },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateProductLog(product.id, {
                              status: status === opt.value ? null : opt.value,
                              ...(opt.value !== 'swapped' ? { swap_note: '' } : {}),
                            })}
                            className={[
                              'px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-colors',
                              status === opt.value
                                ? 'border-[#48C4B0] bg-[#48C4B0]/10 text-[#48C4B0]'
                                : 'border-gray-200 bg-white text-gray-500 hover:border-[#48C4B0]',
                            ].join(' ')}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Swap note — only visible when status === 'swapped' */}
                      {status === 'swapped' && (
                        <input
                          type="text"
                          maxLength={100}
                          placeholder="What did you use instead?"
                          value={entry.swap_note ?? ''}
                          onChange={e => updateProductLog(product.id, { swap_note: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm
                                     focus:outline-none focus:border-[#48C4B0] mb-3"
                        />
                      )}

                      {/* Actual quantity — only shown if status === 'used' or 'swapped' */}
                      {(status === 'used' || status === 'swapped') && (
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 flex-1">Actual quantity</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateProductLog(product.id, {
                                actual_qty: Math.max(0, actualQty - 1),
                              })}
                              className="w-8 h-8 rounded-lg border-2 border-gray-200 text-gray-500
                                         hover:border-[#48C4B0] hover:text-[#48C4B0] text-base
                                         font-bold transition-colors flex items-center justify-center"
                            >
                              −
                            </button>
                            <span className="text-sm font-bold text-[#1B1B1B] w-6 text-center">
                              {actualQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateProductLog(product.id, {
                                actual_qty: actualQty + 1,
                              })}
                              className="w-8 h-8 rounded-lg border-2 border-gray-200 text-gray-500
                                         hover:border-[#48C4B0] hover:text-[#48C4B0] text-base
                                         font-bold transition-colors flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 4 — Notes */}
          <div>
            <FieldLabel>{t('feedback.notes')}</FieldLabel>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 500))}
              placeholder={t('feedback.notesPlaceholder')}
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
              {t('feedback.submitError')}
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
              {submitting ? t('feedback.saving') : t('feedback.save')}
            </button>
            {!canSubmit && (
              <p className="text-xs text-gray-400 text-center mt-2">
                {t('feedback.incomplete')}
              </p>
            )}
          </div>

        </form>
      </div>
    </div>
  )
}
