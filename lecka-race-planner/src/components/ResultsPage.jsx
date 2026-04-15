/**
 * ResultsPage.jsx
 *
 * Renders the complete race-day nutrition plan:
 *   1. Hero header — race, duration, effort, conditions
 *   2. NutritionSummary — carbs / sodium / fluid targets per hour + totals
 *   3. ProductCards — what to buy, how many boxes, line price
 *   4. Shop CTA — buildCartURL() → Shopify cart (utm_source when embedded)
 *   5. RaceTimeline — every intake slot sorted chronologically
 *   6. EmailCapture — POST to /api/send-plan, notifyEmailCapture on success
 *   7. "Start over" footer link
 */

import React, { useState, useMemo } from 'react'
import { buildCartURL } from '../engine/shopify-link.js'
import { isEmbedded, notifyEmailCapture } from '../embed.js'

// ── Display label maps ────────────────────────────────────────────────────────

const RACE_LABELS = {
  '5k':                '5 km',
  '10k':               '10 km',
  'half_marathon':     'Half Marathon',
  'marathon':          'Marathon',
  'ultra_50k':         'Ultra 50 km',
  'ultra_100k':        'Ultra 100 km',
  'triathlon_sprint':  'Sprint Triathlon',
  'triathlon_olympic': 'Olympic Triathlon',
  'triathlon_70_3':    '70.3 Triathlon',
  'triathlon_140_6':   'Ironman 140.6',
}

const EFFORT_LABELS = {
  'easy':      'Easy pace',
  'race_pace': 'Race pace',
  'hard':      'Hard effort',
}

const CONDITION_LABELS = {
  'cool':  'Cool',
  'mild':  'Mild',
  'warm':  'Warm',
  'hot':   'Hot',
  'humid': 'Humid',
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

/** Badge label inside the timeline time column */
function formatTimingLabel(minutes, totalDuration) {
  if (minutes < 0) return `T-${Math.abs(minutes)} min`
  if (minutes >= totalDuration) {
    const postMin = minutes - totalDuration
    return postMin > 0 ? `+${postMin} min` : 'Finish'
  }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${minutes} min`
}

function timingPhase(minutes, totalDuration) {
  if (minutes < 0) return 'before'
  if (minutes >= totalDuration) return 'after'
  return 'during'
}

/**
 * Flatten all selection items into individual timeline events, sorted by time.
 * Each timing_minutes entry becomes its own event row.
 */
function buildTimeline(selection, totalDuration) {
  const events = []
  for (const item of selection) {
    for (const t of item.timing_minutes) {
      events.push({
        time: t,
        product: item.product,
        note: item.note,
        phase: timingPhase(t, totalDuration),
      })
    }
  }
  events.sort((a, b) => a.time - b.time)
  return events
}

/**
 * Aggregate selection items by product.id so each product appears once
 * on the product cards with total units and box count.
 */
function aggregateByProduct(selection) {
  const map = {}
  for (const item of selection) {
    const id = item.product.id
    if (!map[id]) map[id] = { product: item.product, totalUnits: 0 }
    map[id].totalUnits += item.quantity
  }
  return Object.values(map).map(({ product, totalUnits }) => {
    const boxes = Math.ceil(totalUnits / product.units_per_box)
    return { product, totalUnits, boxes, linePrice: boxes * product.price_usd }
  })
}

// ── Small shared UI primitives ────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

/** Coloured pill that identifies gel vs bar and caffeine */
function ProductIcon({ product }) {
  const isBar = product.type === 'bar'
  const isCaf = product.caffeine
  const bg  = isBar ? '#74C69D' : isCaf ? '#1B1B1B' : '#2D6A4F'
  const tag = isBar ? 'BAR' : isCaf ? 'CAF' : 'GEL'
  return (
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: bg }}
      aria-hidden="true"
    >
      <span className="text-white text-xs font-bold tracking-wide">{tag}</span>
    </div>
  )
}

// ── NutritionSummary ──────────────────────────────────────────────────────────

function NutritionSummary({ targets }) {
  return (
    <section>
      <SectionLabel>Nutrition targets</SectionLabel>
      <div className="border-2 border-gray-100 rounded-2xl p-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-2xl font-bold text-[#2D6A4F]">{targets.carb_per_hour}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">g carbs<br />per hour</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#2D6A4F]">{targets.sodium_per_hour}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">mg sodium<br />per hour</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#2D6A4F]">{targets.fluid_ml_per_hour}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">ml fluid<br />per hour</p>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
          <span>
            Total carbs:{' '}
            <span className="font-semibold text-[#1B1B1B]">{targets.total_carbs}g</span>
          </span>
          <span>
            Total sodium:{' '}
            <span className="font-semibold text-[#1B1B1B]">{targets.total_sodium}mg</span>
          </span>
        </div>
      </div>
    </section>
  )
}

// ── ProductCard ───────────────────────────────────────────────────────────────

function ProductCard({ product, totalUnits, boxes, linePrice }) {
  return (
    <div className="border-2 border-gray-100 rounded-2xl p-4 flex items-center gap-4">
      <ProductIcon product={product} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1B1B1B] leading-tight">{product.name}</p>
        <p className="text-xs text-gray-400 mt-1">
          {totalUnits} unit{totalUnits !== 1 ? 's' : ''}&nbsp;·&nbsp;
          {boxes} box{boxes !== 1 ? 'es' : ''} of {product.units_per_box}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-[#1B1B1B]">A${linePrice.toFixed(2)}</p>
        <p className="text-xs text-gray-400">{product.price_note}</p>
      </div>
    </div>
  )
}

// ── RaceTimeline ──────────────────────────────────────────────────────────────

const PHASE_BADGE = {
  before: 'bg-[#2D6A4F]/10 text-[#2D6A4F]',
  during: 'bg-[#74C69D]/40 text-[#1B4B35]',
  after:  'bg-gray-100 text-gray-500',
}

function RaceStartDivider() {
  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-[#2D6A4F]/5">
      <div className="flex-1 h-px bg-[#2D6A4F]/20" />
      <span className="text-xs font-semibold text-[#2D6A4F] uppercase tracking-wider whitespace-nowrap">
        Race start
      </span>
      <div className="flex-1 h-px bg-[#2D6A4F]/20" />
    </div>
  )
}

function FinishDivider({ totalDuration }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-gray-50">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
        Finish — {formatDuration(totalDuration)}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

function RaceTimeline({ events, totalDuration }) {
  if (events.length === 0) return null

  return (
    <section>
      <SectionLabel>Race timeline</SectionLabel>
      <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
        {events.map((ev, i) => {
          const prevPhase = i > 0 ? events[i - 1].phase : null
          const showRaceStart =
            ev.phase === 'during' && (prevPhase === 'before' || prevPhase === null)
          const showFinish =
            ev.phase === 'after' && (prevPhase === 'during' || prevPhase === null)

          return (
            <React.Fragment key={i}>
              {showRaceStart && <RaceStartDivider />}
              {showFinish && <FinishDivider totalDuration={totalDuration} />}

              <div
                className={`flex items-start gap-4 px-5 py-4 ${
                  i !== events.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                {/* Time badge — fixed width so product names align */}
                <div className="w-20 flex-shrink-0 pt-0.5">
                  <span
                    className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full
                                whitespace-nowrap ${PHASE_BADGE[ev.phase]}`}
                  >
                    {formatTimingLabel(ev.time, totalDuration)}
                  </span>
                </div>

                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1B1B1B] leading-tight">
                    {ev.product.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{ev.note}</p>
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </section>
  )
}

// ── EmailCapture ──────────────────────────────────────────────────────────────

function EmailCapture({ targets, selection, form }) {
  const [email,   setEmail]   = useState('')
  const [state,   setState]   = useState('idle') // idle | sending | success | error
  const [touched, setTouched] = useState(false)

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const showError = touched && email !== '' && !isValid

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (!isValid) return

    setState('sending')
    try {
      const res = await fetch('/api/send-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, targets, selection, form }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState('success')
      notifyEmailCapture(email, targets.race_type)
    } catch {
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <section className="border-2 border-[#74C69D]/40 bg-[#74C69D]/5 rounded-2xl p-5">
        <p className="text-sm font-bold text-[#2D6A4F]">Plan sent!</p>
        <p className="text-xs text-gray-500 mt-1">
          Check your inbox at{' '}
          <span className="font-medium text-[#1B1B1B]">{email}</span>.
          Your PDF nutrition plan is attached.
        </p>
      </section>
    )
  }

  return (
    <section>
      <SectionLabel>Email me this plan</SectionLabel>
      <div className="border-2 border-gray-100 rounded-2xl p-5">
        <p className="text-sm text-gray-500 mb-4">
          Get a PDF of your plan with timing guide and product list — straight to your inbox.
        </p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setTouched(false) }}
              onBlur={() => setTouched(true)}
              placeholder="your@email.com"
              disabled={state === 'sending'}
              className={[
                'flex-1 min-w-0 border-2 rounded-xl px-4 py-3 text-sm',
                'focus:outline-none focus:border-[#2D6A4F]',
                'disabled:opacity-50',
                showError ? 'border-red-300' : 'border-gray-200',
              ].join(' ')}
            />
            <button
              type="submit"
              disabled={state === 'sending'}
              className="min-h-[48px] px-5 bg-[#2D6A4F] text-white rounded-xl text-sm
                         font-semibold hover:bg-[#235a3e] transition-colors
                         disabled:opacity-50 whitespace-nowrap flex-shrink-0"
            >
              {state === 'sending' ? 'Sending…' : 'Send plan'}
            </button>
          </div>

          {showError && (
            <p className="text-xs text-red-500 mt-2">Please enter a valid email address.</p>
          )}
          {state === 'error' && (
            <p className="text-xs text-red-500 mt-2">
              Something went wrong — please try again or email us at info@getlecka.com
            </p>
          )}
        </form>
      </div>
    </section>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResultsPage({ targets, selection, form, onBack }) {
  const timeline   = useMemo(() => buildTimeline(selection, targets.total_duration_minutes), [selection, targets])
  const aggregated = useMemo(() => aggregateByProduct(selection), [selection])

  const subtotal  = aggregated.reduce((sum, row) => sum + row.linePrice, 0)
  const totalBoxes = aggregated.reduce((sum, row) => sum + row.boxes, 0)

  const cartURL = useMemo(
    () => buildCartURL(selection, '', isEmbedded ? 'shopify_embed' : ''),
    [selection]
  )

  const raceLabel      = RACE_LABELS[targets.race_type]     ?? targets.race_type
  const effortLabel    = EFFORT_LABELS[targets.effort]      ?? targets.effort
  const conditionLabel = CONDITION_LABELS[targets.conditions] ?? targets.conditions

  return (
    <div className="min-h-screen bg-white">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-[#2D6A4F] font-medium hover:underline
                       min-h-[44px] flex items-center"
          >
            ← Back
          </button>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Lecka
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">

        {/* ── Hero ────────────────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#74C69D] mb-1">
            Your plan
          </p>
          <h1 className="text-2xl font-bold text-[#1B1B1B]">{raceLabel}</h1>
          <p className="text-sm text-gray-400 mt-1.5">
            {formatDuration(targets.total_duration_minutes)}
            {' · '}{effortLabel}
            {' · '}{conditionLabel}
            {targets.caffeine_ok ? ' · Caffeine' : ''}
          </p>
        </div>

        {/* ── Nutrition targets ────────────────────────────────────────────────── */}
        <NutritionSummary targets={targets} />

        {/* ── Product cards ───────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>What to take</SectionLabel>
          <div className="space-y-3">
            {aggregated.map(row => (
              <ProductCard key={row.product.id} {...row} />
            ))}
          </div>
        </section>

        {/* ── Shop CTA ────────────────────────────────────────────────────────── */}
        <section className="border-2 border-[#2D6A4F]/20 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">
              {totalBoxes} box{totalBoxes !== 1 ? 'es' : ''}
            </span>
            <span className="text-xl font-bold text-[#1B1B1B]">
              A${subtotal.toFixed(2)}
            </span>
          </div>
          <a
            href={cartURL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-full min-h-[52px]
                       bg-[#2D6A4F] hover:bg-[#235a3e] text-white rounded-2xl
                       text-base font-bold transition-colors"
          >
            Shop my plan →
          </a>
          <p className="text-xs text-gray-400 text-center mt-3">
            Ships to Australia · Free shipping on orders over A$60
          </p>
        </section>

        {/* ── Race timeline ────────────────────────────────────────────────────── */}
        <RaceTimeline events={timeline} totalDuration={targets.total_duration_minutes} />

        {/* ── Email capture ────────────────────────────────────────────────────── */}
        <EmailCapture targets={targets} selection={selection} form={form} />

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div className="pb-10 text-center">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-[#2D6A4F] transition-colors"
          >
            ← Start over
          </button>
        </div>

      </div>
    </div>
  )
}
