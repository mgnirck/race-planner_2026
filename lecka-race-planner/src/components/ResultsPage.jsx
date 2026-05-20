/**
 * ResultsPage.jsx
 *
 * Renders the complete race-day nutrition plan:
 *   1. Hero header — race name / type, duration, effort, conditions
 *   2. NutritionSummary — carbs / sodium / fluid per hour + totals
 *   3. ProductCards — what to buy, how many boxes, line price
 *   4. Shop CTA — Shopify cart link
 *   5. RaceTimeline — compact visual bar + phase-grouped schedule
 *   6. EmailCapture — POST /api/send-plan
 *   7. Start over footer
 */

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { buildCartURLFromAggregated }                  from '../engine/shopify-link.js'
import { computeCartItems, computeLinePrice, isAvailableInRegion } from '../engine/region-utils.js'
import { isEmbedded, notifyEmailCapture, embedCartURL, getSavedRegion, saveRegion, getRegionConfig } from '../embed.js'
import Nav from './Nav.jsx'
import regionsConfig from '../config/regions.json'
import FALLBACK_PRODUCTS from '../config/products.json'
import researchMarkdown from '../../NUTRITION_RESEARCH_ANALYSIS.md?raw'
import { useProducts } from '../hooks/useProducts.js'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import i18n from '../i18n.js'
import { getRaceLabel, getEffortLabel, getConditionLabel } from '../i18n-utils.js'
import { formatAddonSummary } from '../engine/kit-calculator.js'
import ShareModal from './ShareModal.jsx'
import PlanLeftColumn from './PlanLeftColumn.jsx'
import PlanRightColumn from './PlanRightColumn.jsx'
import PlanProductEditor from './PlanProductEditor.jsx'
import GutTrainingTab from './GutTrainingTab.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────


const ELEVATION_MODIFIER_PCT = {
  rolling:    5,
  hilly:      10,
  very_hilly: 15,
  mountain:   22,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function formatPrice(amount, symbol, decimals = 2) {
  const num = decimals === 0
    ? Math.round(amount).toLocaleString('en-US')
    : amount.toFixed(decimals)
  return `${symbol}${num}`
}

function formatTimingLabel(minutes, totalDuration, t) {
  if (minutes < 0) return `T-${Math.abs(minutes)} min`
  if (minutes >= totalDuration) {
    const postMin = minutes - totalDuration
    if (postMin > 0) return `+${postMin} min`
    return t ? t('timing.finish') : 'Finish'
  }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0)          return `${h}h`
  return `${minutes} min`
}

function timingPhase(minutes, totalDuration) {
  if (minutes < 0)              return 'before'
  if (minutes >= totalDuration) return 'after'
  return 'during'
}

function buildTimeline(selection, totalDuration) {
  const events = []
  for (const item of selection) {
    if (!item.timing_minutes) continue
    for (const t of item.timing_minutes) {
      events.push({
        time:    t,
        product: item.product,
        note:    item.note,
        phase:   timingPhase(t, totalDuration),
        isAddon: item.isAddon ?? false,
      })
    }
  }
  events.sort((a, b) => a.time - b.time)
  return events
}

// Distribute addon quantities evenly across the race window (first at 20 min).
function buildAddonTimelineItems(resolvedAddonItems, totalDurationMinutes) {
  return resolvedAddonItems.map(({ product, quantity }) => {
    const firstIntake = 20
    let slots
    if (quantity <= 1) {
      slots = [firstIntake]
    } else {
      const lastSlot = totalDurationMinutes - 1
      slots = Array.from({ length: quantity }, (_, i) =>
        Math.round(firstIntake + (i * (lastSlot - firstIntake)) / (quantity - 1))
      )
    }
    return { product, quantity, timing_minutes: slots, note: 'Add-on — buy separately', isAddon: true }
  })
}

function aggregateByProduct(selection, region = 'us', manualQty = null, catalog = FALLBACK_PRODUCTS) {
  const map = {}
  for (const item of selection) {
    const id = item.product.id
    if (!map[id]) map[id] = { product: item.product, totalUnits: 0 }
    map[id].totalUnits += item.quantity
  }

  if (manualQty !== null) {
    for (const [id, units] of Object.entries(manualQty)) {
      if (units <= 0) {
        delete map[id]
      } else if (map[id]) {
        map[id].totalUnits = units
      } else {
        const product = catalog.find(p => p.id === id && (p.type === 'gel' || p.type === 'ultra_gel' || p.type === 'bar'))
        if (product) map[id] = { product, totalUnits: units }
      }
    }
  }

  return Object.values(map)
    .map(({ product, totalUnits }) => {
      const cartItems = computeCartItems(product, region, totalUnits)
      const linePrice = computeLinePrice(product, region, totalUnits)
      const cartUnits = cartItems.reduce((s, item) => s + item.quantity * item.units_per_pack, 0)
      return { product, totalUnits, cartItems, linePrice, cartUnits }
    })
    .filter(row => row.cartItems.length > 0)
}

function computeTrainingInfo(aggregated) {
  let gelRaceUnits = 0, gelCartUnits = 0
  let barRaceUnits = 0, barCartUnits = 0
  for (const row of aggregated) {
    if (row.product.type === 'gel' || row.product.type === 'ultra_gel' || row.product.type === 'variety_pack') {
      gelRaceUnits += row.totalUnits
      gelCartUnits += row.cartUnits
    } else if (row.product.type === 'bar') {
      barRaceUnits += row.totalUnits
      barCartUnits += row.cartUnits
    }
  }
  const gelOverage = gelCartUnits - gelRaceUnits
  const barOverage = barCartUnits - barRaceUnits
  return {
    hasOverage:    gelOverage > 0 || barOverage > 0,
    gelRaceUnits, gelCartUnits, gelOverage,
    barRaceUnits, barCartUnits, barOverage,
  }
}

function computeProvidedNutrition(selection, manualQty, totalDurationMinutes, catalog = FALLBACK_PRODUCTS) {
  const qtyMap = {}
  const productById = {}

  for (const item of selection) {
    const id = item.product.id
    qtyMap[id] = (qtyMap[id] || 0) + item.quantity
    productById[id] = item.product
  }

  if (manualQty) {
    for (const [id, qty] of Object.entries(manualQty)) {
      if (qty <= 0) {
        delete qtyMap[id]
      } else {
        qtyMap[id] = qty
        if (!productById[id]) {
          const p = catalog.find(p => p.id === id)
          if (p) productById[id] = p
        }
      }
    }
  }

  let totalCarbs = 0
  let totalSodium = 0
  for (const [id, qty] of Object.entries(qtyMap)) {
    const product = productById[id]
    if (!product) continue
    totalCarbs  += (product.carbs_per_unit  || 0) * qty
    totalSodium += (product.sodium_per_unit || 0) * qty
  }

  const durationHours = totalDurationMinutes / 60
  return {
    total_carbs_provided:       Math.round(totalCarbs),
    total_sodium_provided:      Math.round(totalSodium),
    carbs_per_hour_provided:    durationHours > 0 ? Math.round(totalCarbs  / durationHours) : 0,
    sodium_per_hour_provided:   durationHours > 0 ? Math.round(totalSodium / durationHours) : 0,
  }
}

/**
 * Group during-phase events by product and derive a compact schedule string.
 * Returns array of { product, note, count, scheduleText }
 */
function buildDuringGroups(duringEvents, t) {
  const byProduct = {}
  for (const ev of duringEvents) {
    const id = ev.product.id
    if (!byProduct[id]) byProduct[id] = { product: ev.product, note: ev.note, times: [], isAddon: ev.isAddon ?? false }
    byProduct[id].times.push(ev.time)
  }

  return Object.values(byProduct).map(({ product, note, times, isAddon }) => {
    let scheduleText
    if (times.length === 1) {
      scheduleText = t('results:timeline.atTime', { time: formatTimingLabel(times[0], Infinity, t) })
    } else {
      const intervals = times.slice(1).map((tv, i) => tv - times[i])
      const allSame   = intervals.every(iv => iv === intervals[0])
      if (allSame) {
        scheduleText = t('results:timeline.every', { interval: intervals[0], start: formatTimingLabel(times[0], Infinity, t) })
      } else {
        const labels = times.map(tv => formatTimingLabel(tv, Infinity, t))
        scheduleText = labels.length > 4
          ? `${labels.slice(0, 3).join(', ')} … ${t('results:timeline.moreSlots', { count: labels.length - 3 })}`
          : t('results:timeline.atTime', { time: labels.join(', ') })
      }
    }
    return { product, note, count: times.length, scheduleText, isAddon }
  })
}

/**
 * Rebuilds a selection array that reflects manual quantity overrides so the
 * race timeline stays in sync with the product quantities the user has set.
 *
 * - Removed products (qty = 0) are dropped entirely.
 * - Reduced quantities trim timing events from the end of the sorted list.
 * - Increased quantities extend the last detected interval forward, capped at
 *   totalDuration-1 for gels so they stay in the "during" phase.
 * - Products added fresh (not in the original selection) get evenly-spaced
 *   timings: gels during the race (every 30 min from 20 min), bars split
 *   equally between before (-30 min) and after (finish +15 min).
 */
function adjustTimelineSelection(selection, manualQty, totalDuration, allProducts) {
  if (!manualQty) return selection

  // Group all selection items by product ID
  const grouped = {}
  for (const item of selection) {
    const id = item.product.id
    if (!grouped[id]) grouped[id] = { product: item.product, items: [], allTimings: [], note: '' }
    grouped[id].items.push(item)
    for (const t of item.timing_minutes) grouped[id].allTimings.push(t)
    if (!grouped[id].note && item.note) grouped[id].note = item.note
  }

  const result = []

  // Process products that already exist in the selection
  for (const [productId, group] of Object.entries(grouped)) {
    const overrideQty = manualQty[productId]
    if (overrideQty === undefined) {
      result.push(...group.items)
      continue
    }
    if (overrideQty <= 0) continue

    const sorted = [...group.allTimings].sort((a, b) => a - b)
    const originalQty = sorted.length
    let newTimings

    if (overrideQty <= originalQty) {
      newTimings = sorted.slice(0, overrideQty)
    } else {
      const duringTimings = sorted.filter(t => t >= 0 && t < totalDuration)
      let interval = 30
      if (duringTimings.length > 1) {
        const span = duringTimings[duringTimings.length - 1] - duringTimings[0]
        interval = Math.max(1, Math.round(span / (duringTimings.length - 1)))
      }
      const lastDuring = duringTimings.length > 0
        ? duringTimings[duringTimings.length - 1]
        : sorted.filter(t => t >= 0).at(-1) ?? 0
      const extra = Array.from({ length: overrideQty - originalQty }, (_, i) =>
        Math.min(lastDuring + (i + 1) * interval, totalDuration - 1)
      )
      newTimings = [...sorted, ...extra]
    }

    result.push({ product: group.product, quantity: overrideQty, timing_minutes: newTimings, note: group.note })
  }

  // Products newly introduced via manualQty (not in original selection)
  for (const [productId, qty] of Object.entries(manualQty)) {
    if (qty <= 0 || grouped[productId]) continue
    const product = allProducts.find(p => p.id === productId)
    if (!product) continue

    const timings = []
    if (product.type === 'gel' || product.type === 'ultra_gel') {
      for (let i = 0; i < qty; i++) timings.push(Math.min(20 + i * 30, totalDuration - 1))
    } else if (product.type === 'bar') {
      const beforeQty = Math.ceil(qty / 2)
      const afterQty  = qty - beforeQty
      for (let i = 0; i < beforeQty; i++) timings.push(-30 - i * 15)
      for (let i = 0; i < afterQty; i++)  timings.push(totalDuration + 15 + i * 15)
    }
    if (timings.length > 0) {
      result.push({ product, quantity: qty, timing_minutes: timings, note: '' })
    }
  }

  return result
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

function ProductIcon({ product }) {
  const isBar = product.type === 'bar'
  const isCaf = product.caffeine
  const bg  = isBar ? '#48C4B0' : isCaf ? '#1B1B1B' : '#48C4B0'
  const tag = isBar ? 'BAR' : isCaf ? 'CAF' : 'GEL'
  return (
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: bg, opacity: isCaf ? 1 : (isBar ? 0.75 : 1) }}
      aria-hidden="true"
    >
      <span className="text-white text-xs font-bold tracking-wide">{tag}</span>
    </div>
  )
}

// ── Warnings ──────────────────────────────────────────────────────────────────

function WarningBox({ warnings }) {
  const { t } = useTranslation('results')
  if (!warnings || warnings.length === 0) return null
  return (
    <section>
      <SectionLabel>{t('section.notesAndTips')}</SectionLabel>
      <div className="space-y-2">
        {warnings.map((w, i) => (
          <div
            key={i}
            className="border-l-4 border-[#48C4B0] bg-[#48C4B0]/5 rounded-r-lg p-3 text-sm text-[#1B1B1B]"
          >
            <p className="leading-snug font-medium">{w.message}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── NutritionSummary ──────────────────────────────────────────────────────────

function nutritionStatusClass(provided, target) {
  if (!target) return 'bg-gray-50 text-gray-400'
  const r = provided / target
  if (r >= 0.9 && r <= 1.1) return 'bg-green-50 text-green-600'
  if (r >= 0.75)             return 'bg-amber-50 text-amber-600'
  if (r < 0.75)              return 'bg-red-50 text-red-500'
  if (r <= 1.3)              return 'bg-blue-50 text-blue-500'
  return 'bg-blue-100 text-blue-700'
}

function nutritionStatusLabel(provided, target, t) {
  if (!target) return ''
  const r = provided / target
  if (r >= 0.9 && r <= 1.1) return t('nutrition.status.onTarget')
  if (r >= 0.75)             return t('nutrition.status.slightlyUnder')
  if (r < 0.75)              return t('nutrition.status.under')
  if (r <= 1.3)              return t('nutrition.status.slightlyOver')
  return t('nutrition.status.over')
}

function NutritionSummary({ targets, provided, foundationTargets, addonCoverage }) {
  const { t } = useTranslation('results')
  const showProvided = provided.carbs_per_hour_provided > 0 || provided.sodium_per_hour_provided > 0

  const labelParts = key => t(key).split('\n').map((line, i) =>
    <React.Fragment key={i}>{line}{i === 0 && <br />}</React.Fragment>
  )

  const carbHint = (() => {
    const c = targets.carb_per_hour
    if (c === 0)  return 'No fuelling needed for this distance'
    if (c <= 30)  return 'About 1 gel per hour'
    if (c <= 50)  return 'About 1–2 gels per hour'
    if (c <= 70)  return 'About 2 gels per hour'
    return 'About 2–3 gels per hour'
  })()

  return (
    <section>
      <SectionLabel>{t('section.nutritionTargets')}</SectionLabel>
      <div className="border-2 border-gray-100 rounded-2xl p-5 space-y-4">

        {/* Target row */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{t('nutrition.needed')}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-bold text-[#48C4B0]">{targets.carb_per_hour}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{labelParts('nutrition.carbsPerHour')}</p>
              <p className="text-xs text-gray-400 italic mt-1 leading-tight">{carbHint}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#48C4B0]">{targets.sodium_per_hour}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{labelParts('nutrition.sodiumPerHour')}</p>
              <p className="text-xs text-gray-400 italic mt-1 leading-tight">From gels + electrolytes</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#48C4B0]">{targets.fluid_ml_per_hour}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{labelParts('nutrition.fluidPerHour')}</p>
              <p className="text-xs text-gray-400 italic mt-1 leading-tight">{t('nutrition.fluidNote')}</p>
            </div>
          </div>
        </div>

        {/* Foundation / addon split row */}
        {addonCoverage && addonCoverage.items?.length > 0 && foundationTargets && (() => {
          const total = targets.carb_per_hour
          const foundationPct = total > 0 ? Math.round((foundationTargets.carb_per_hour / total) * 100) : 100
          const addonPct = 100 - foundationPct
          return (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">How it's covered</p>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-[#48C4B0] font-medium">🌱 Lecka foundation: {foundationTargets.carb_per_hour}g carbs/hour</span>
                <span className="text-gray-400">+ Add-ons: {Math.round(addonCoverage.carbs_per_hour)}g/hour</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden flex">
                <div className="h-full bg-[#48C4B0] transition-all" style={{ width: `${foundationPct}%` }} />
                <div className="h-full bg-[#48C4B0]/40 transition-all" style={{ width: `${addonPct}%` }} />
              </div>
            </div>
          )
        })()}

        {/* Provided row */}
        {showProvided && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">{t('nutrition.provided')}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {/* Carbs provided */}
              <div>
                <p className="text-xl font-bold text-[#1B1B1B]">{provided.carbs_per_hour_provided}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">{labelParts('nutrition.carbsPerHour')}</p>
                <span
                  className={`mt-1.5 inline-block text-xs font-medium px-2 py-0.5 rounded-full ${nutritionStatusClass(provided.carbs_per_hour_provided, targets.carb_per_hour)}`}
                  title={nutritionStatusLabel(provided.carbs_per_hour_provided, targets.carb_per_hour, t)}
                >
                  {provided.carbs_per_hour_provided - targets.carb_per_hour >= 0 ? '+' : ''}{provided.carbs_per_hour_provided - targets.carb_per_hour}g
                </span>
              </div>
              {/* Sodium provided */}
              <div>
                <p className="text-xl font-bold text-[#1B1B1B]">{provided.sodium_per_hour_provided}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">{labelParts('nutrition.sodiumPerHour')}</p>
                <span
                  className={`mt-1.5 inline-block text-xs font-medium px-2 py-0.5 rounded-full ${nutritionStatusClass(provided.sodium_per_hour_provided, targets.sodium_per_hour)}`}
                  title={nutritionStatusLabel(provided.sodium_per_hour_provided, targets.sodium_per_hour, t)}
                >
                  {provided.sodium_per_hour_provided - targets.sodium_per_hour >= 0 ? '+' : ''}{provided.sodium_per_hour_provided - targets.sodium_per_hour}mg
                </span>
              </div>
              {/* Fluid — not product-tracked */}
              <div className="flex items-center justify-center">
                <p className="text-xs text-gray-400 italic leading-snug">—</p>
              </div>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-gray-100 pt-3 flex justify-between text-xs text-gray-400">
          <span>
            {t('nutrition.totalCarbs')}{' '}
            <span className="font-semibold text-[#1B1B1B]">{targets.total_carbs}g</span>
            {showProvided && (
              <span className="ml-1">→ <span className="font-semibold text-[#1B1B1B]">{provided.total_carbs_provided}g</span></span>
            )}
          </span>
          <span>
            {t('nutrition.totalSodium')}{' '}
            <span className="font-semibold text-[#1B1B1B]">{targets.total_sodium}mg</span>
            {showProvided && (
              <span className="ml-1">→ <span className="font-semibold text-[#1B1B1B]">{provided.total_sodium_provided}mg</span></span>
            )}
          </span>
        </div>

        {targets.elevation_tier && targets.elevation_tier !== 'flat' && (
          <p className="text-xs text-[#48C4B0] italic">
            {t('nutrition.elevationAdjust', { pct: ELEVATION_MODIFIER_PCT[targets.elevation_tier] })}
          </p>
        )}

      </div>
      <p className="text-xs text-gray-400 text-center mt-2">
        Numbers are personalised to your weight, conditions, and training level.
      </p>
    </section>
  )
}

// ── ProductCard ───────────────────────────────────────────────────────────────

function VarietyPackContents({ product, region }) {
  const contents = product.contains?.[region]
  if (!contents) return null
  const items = Object.entries(contents).map(([id, qty]) => {
    const label = id.replace('gel-', '').replace(/-/g, ' ')
    return `${qty}× ${label.charAt(0).toUpperCase() + label.slice(1)}`
  })
  return (
    <p className="text-xs text-gray-400 mt-0.5 leading-snug">{items.join(' · ')}</p>
  )
}

function ProductCard({ product, totalUnits, cartItems, linePrice, cartUnits, currencySymbol = '$', decimals = 2, savedAmount = 0, region = 'us' }) {
  const { t } = useTranslation('results')
  const isVarietyPack = product.type === 'variety_pack'
  const packSummary = cartItems
    .map(item => item.units_per_pack === 1
      ? `${item.quantity} ${t('product.single')}`
      : `${item.quantity}×${item.units_per_pack}-pack`
    )
    .join(' + ')

  const hasOverage = cartUnits > totalUnits

  return (
    <div className={[
      'border-2 rounded-2xl p-4 flex items-start gap-4',
      isVarietyPack ? 'border-[#48C4B0]/40 bg-[#48C4B0]/5' : 'border-gray-100',
    ].join(' ')}>
      <ProductIcon product={product} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[#1B1B1B] leading-tight">{product.name}</p>
          {isVarietyPack && savedAmount > 0 && (
            <span className="text-xs font-bold text-white bg-[#48C4B0] px-1.5 py-0.5 rounded-full whitespace-nowrap">
              {t('product.saves', { symbol: currencySymbol, amount: decimals === 0 ? Math.round(savedAmount).toLocaleString('en-US') : savedAmount.toFixed(decimals) })}
            </span>
          )}
        </div>
        {isVarietyPack
          ? <VarietyPackContents product={product} region={region} />
          : null
        }
        <p className="text-xs text-gray-400 mt-1">
          {t('product.forRace', { count: totalUnits })}&nbsp;·&nbsp;{packSummary}
        </p>
        {hasOverage && (
          <p className="text-xs text-[#48C4B0] mt-0.5">
            {t('product.extraForTraining', { count: cartUnits - totalUnits })}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-[#1B1B1B]">{formatPrice(linePrice, currencySymbol, decimals)}</p>
      </div>
    </div>
  )
}

// ── RaceTimelineV2 ────────────────────────────────────────────────────────────

function RaceTimelineV2({ events, totalDuration }) {
  const { t } = useTranslation('results')
  if (!events.length) return null

  const beforeEvents = events.filter(e => e.phase === 'before')
  const duringEvents = events.filter(e => e.phase === 'during')
  const afterEvents  = events.filter(e => e.phase === 'after')
  const duringGroups = buildDuringGroups(duringEvents, t)

  const PhaseHeader = ({ phase }) => (
    <div className="flex items-center gap-2 mt-4 mb-2 first:mt-0">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
        phase === 'during' ? 'bg-[#48C4B0]' : 'bg-gray-300'
      }`} />
      <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">
        {phase === 'before' ? t('timeline.preRace')
         : phase === 'during' ? t('timeline.duringRace')
         : t('timeline.postRace')}
      </span>
    </div>
  )

  const EventRow = ({ event }) => (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
        event.phase === 'before'
          ? 'bg-[#E1F5EE] text-[#085041]'
          : 'bg-gray-100 text-gray-400'
      }`}>
        {formatTimingLabel(event.time, totalDuration, t)}
      </span>
      <ProductIcon product={event.product} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#1B1B1B]">{event.product.name}</p>
        <p className="text-[10px] text-gray-400">{event.note}</p>
      </div>
    </div>
  )

  const DuringRow = ({ group }) => (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap
                       bg-gray-100 text-gray-500">
        ×{group.count}
      </span>
      <ProductIcon product={group.product} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#1B1B1B]">{group.product.name}</p>
        <p className="text-[10px] text-gray-400">{group.scheduleText}</p>
        {group.isAddon && (
          <span className="text-[10px] text-gray-400 italic">Add-on — buy separately</span>
        )}
      </div>
    </div>
  )

  return (
    <div>
      {beforeEvents.length > 0 && (
        <>
          <PhaseHeader phase="before" />
          {beforeEvents.map((ev, i) => <EventRow key={`b${i}`} event={ev} />)}
        </>
      )}
      {duringGroups.length > 0 && (
        <>
          <PhaseHeader phase="during" />
          {duringGroups.map((g, i) => <DuringRow key={`d${i}`} group={g} />)}
        </>
      )}
      {afterEvents.length > 0 && (
        <>
          <PhaseHeader phase="after" />
          {afterEvents.map((ev, i) => <EventRow key={`a${i}`} event={ev} />)}
        </>
      )}
    </div>
  )
}

// ── PlanDeliveryCard ──────────────────────────────────────────────────────────

function PlanDeliveryCard({ targets, selection, form, region = 'us', hideSave = false, resolvedAddonItems = [], planId: savedPlanId = null }) {
  const { t } = useTranslation('results')
  const [email,      setEmail]      = useState('')
  const [emailState, setEmailState] = useState('idle') // idle | sending | success | error
  const [saveState,  setSaveState]  = useState('idle') // idle | saving | saved | error
  const [touched,    setTouched]    = useState(false)

  const userId     = localStorage.getItem('lecka_user_id')
  const isLoggedIn = Boolean(userId)
  const alreadySaved = Boolean(savedPlanId)

  const isValid   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const showError = touched && email !== '' && !isValid

  async function handleSendPlan(e) {
    e.preventDefault()
    setTouched(true)
    if (!isValid) return
    setEmailState('sending')
    try {
      const fetches = [
        fetch('/api/send-plan', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            email, targets, inputs: form, selectedProducts: selection, region, lang: i18n.language,
            addon_items_summary: formatAddonSummary(resolvedAddonItems),
          }),
        }),
      ]
      if (!isLoggedIn && !hideSave) {
        try {
          localStorage.setItem('lecka_pending_plan', JSON.stringify({
            inputs: form, targets, selection, region, lang: i18n.language,
          }))
        } catch {}
        fetches.push(
          fetch('/api/auth/send-magic-link', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email }),
          })
        )
      }
      const [planRes] = await Promise.all(fetches)
      if (!planRes.ok) throw new Error(`HTTP ${planRes.status}`)
      setEmailState('success')
      notifyEmailCapture(email, targets.race_type)
    } catch {
      setEmailState('error')
    }
  }

  async function handleSave() {
    setSaveState('saving')
    try {
      const res = await fetch('/api/plans', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({
          inputs: { ...form, addon_items: form.addon_items ?? [] },
          targets, selection, region, lang: i18n.language,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  // Logged-out success: single unified message (includes magic-link hint when save is allowed)
  if (!isLoggedIn && emailState === 'success') {
    return (
      <section className="border-2 border-[#48C4B0]/40 bg-[#48C4B0]/5 rounded-2xl p-5">
        <p className="text-sm font-bold text-[#48C4B0]">✓ Plan sent to {email}</p>
        <p className="text-xs text-gray-500 mt-1">
          {hideSave
            ? 'Check your inbox for your PDF.'
            : 'Check your inbox for your PDF and a login link to save your plan for later.'}
        </p>
      </section>
    )
  }

  return (
    <section>
      <SectionLabel>{t('section.emailPlan')}</SectionLabel>
      <div className="border-2 border-gray-100 rounded-2xl p-5">
        {/* Email send form */}
        {emailState === 'success' ? (
          <p className="text-sm font-bold text-[#48C4B0] mb-4">
            ✓ {t('email.successBody', { email })}
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">{t('email.intro')}</p>
            <form onSubmit={handleSendPlan} noValidate>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setTouched(false) }}
                  onBlur={() => setTouched(true)}
                  placeholder={t('email.placeholder')}
                  disabled={emailState === 'sending'}
                  className={[
                    'flex-1 min-w-0 border-2 rounded-xl px-4 py-3 text-sm',
                    'focus:outline-none focus:border-[#48C4B0]',
                    'disabled:opacity-50',
                    showError ? 'border-red-300' : 'border-gray-200',
                  ].join(' ')}
                />
                <button
                  type="submit"
                  disabled={emailState === 'sending'}
                  className="min-h-[48px] px-5 bg-[#F64866] text-white rounded-xl text-sm
                             font-semibold hover:bg-[#e03558] transition-colors
                             disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                >
                  {emailState === 'sending'
                    ? t('email.sending')
                    : isLoggedIn ? t('email.send') : 'Send my plan + save it →'}
                </button>
              </div>
              {showError && (
                <p className="text-xs text-red-500 mt-2">{t('email.invalidEmail')}</p>
              )}
              {emailState === 'error' && (
                <p className="text-xs text-red-500 mt-2">{t('email.error')}</p>
              )}
              <p className="text-xs text-gray-400 mt-3">{t('email.consent')}</p>
            </form>
          </>
        )}

        {/* Logged-in: inline save section */}
        {isLoggedIn && !hideSave && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
            {(saveState === 'saved' || alreadySaved) ? (
              <>
                <p className="text-sm font-semibold text-[#48C4B0]">✓ Plan saved to your account</p>
                <a
                  href={savedPlanId ? `/plan/${savedPlanId}` : '/dashboard'}
                  className="text-sm font-semibold text-[#48C4B0] hover:underline whitespace-nowrap"
                >
                  View in My Plans →
                </a>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm font-bold text-[#1B1B1B]">Save this plan</p>
                  <p className="text-xs text-gray-400 mt-0.5">Add it to your race history.</p>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveState === 'saving'}
                  className="min-h-[44px] px-5 bg-[#48C4B0] text-white rounded-xl text-sm
                             font-semibold hover:bg-[#3db09d] transition-colors
                             disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                >
                  {saveState === 'saving' ? 'Saving…' : 'Save to My Plans →'}
                </button>
                {saveState === 'error' && (
                  <p className="text-xs text-red-500 mt-2 w-full">Something went wrong — please try again.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Research markdown renderer ────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0fdf9;padding:1px 5px;border-radius:3px;font-size:0.875em;font-family:monospace">$1</code>')
}

function markdownToHtml(md) {
  const lines = md.split('\n')
  const out = []
  let inCodeBlock = false
  let inTable = false
  let tableRows = []
  let inList = false

  function flushTable() {
    if (!tableRows.length) return
    out.push('<div style="overflow-x:auto;margin:12px 0"><table style="width:100%;border-collapse:collapse;font-size:13px">')
    tableRows.forEach((row, ri) => {
      const cells = row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1)
      const tag = ri === 0 ? 'th' : 'td'
      const style = ri === 0
        ? 'background:#48C4B0;color:#fff;padding:6px 10px;text-align:left;font-weight:600'
        : `padding:6px 10px;border-bottom:1px solid #e5e7eb;${ri % 2 === 0 ? 'background:#f9fafb' : ''}`
      out.push('<tr>' + cells.map(c => `<${tag} style="${style}">${renderInlineMarkdown(c.trim())}</${tag}>`).join('') + '</tr>')
    })
    out.push('</table></div>')
    tableRows = []
    inTable = false
  }

  function flushList() {
    if (inList) { out.push('</ul>'); inList = false }
  }

  for (const raw of lines) {
    const line = raw

    if (line.startsWith('```')) {
      flushList()
      if (inTable) flushTable()
      if (inCodeBlock) { out.push('</code></pre>'); inCodeBlock = false }
      else { out.push('<pre style="background:#f5f5f5;border-radius:6px;padding:12px;overflow-x:auto;font-size:12px;margin:10px 0"><code>'); inCodeBlock = true }
      continue
    }
    if (inCodeBlock) { out.push(escapeHtml(line) + '\n'); continue }

    if (line.startsWith('|')) {
      flushList()
      if (line.replace(/[\s|:-]/g, '') === '') continue // separator row
      tableRows.push(line)
      inTable = true
      continue
    }
    if (inTable) flushTable()

    if (/^---+$/.test(line.trim())) { flushList(); out.push('<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">'); continue }
    if (line.startsWith('### ')) { flushList(); out.push(`<h3 style="font-size:14px;font-weight:700;color:#1B1B1B;margin:16px 0 6px">${renderInlineMarkdown(line.slice(4))}</h3>`); continue }
    if (line.startsWith('## ')) { flushList(); out.push(`<h2 style="font-size:16px;font-weight:700;color:#1B1B1B;margin:20px 0 8px;border-bottom:2px solid #48C4B0;padding-bottom:4px">${renderInlineMarkdown(line.slice(3))}</h2>`); continue }
    if (line.startsWith('# ')) { flushList(); out.push(`<h1 style="font-size:20px;font-weight:800;color:#1B1B1B;margin:0 0 12px">${renderInlineMarkdown(line.slice(2))}</h1>`); continue }

    const listMatch = line.match(/^([*\-]) (.+)/)
    const numberedMatch = line.match(/^(\d+)\. (.+)/)
    if (listMatch) {
      if (!inList) { out.push('<ul style="padding-left:20px;margin:6px 0;line-height:1.8">'); inList = true }
      out.push(`<li style="color:#374151">${renderInlineMarkdown(listMatch[2])}</li>`)
      continue
    }
    if (numberedMatch) {
      flushList()
      out.push(`<p style="margin:4px 0;color:#374151;padding-left:8px">${numberedMatch[1]}. ${renderInlineMarkdown(numberedMatch[2])}</p>`)
      continue
    }

    flushList()
    if (line.trim() === '') { out.push('<div style="height:6px"></div>'); continue }
    out.push(`<p style="margin:4px 0;color:#374151;line-height:1.6">${renderInlineMarkdown(line)}</p>`)
  }

  if (inTable) flushTable()
  if (inList) out.push('</ul>')
  if (inCodeBlock) out.push('</code></pre>')

  return out.join('')
}

function ResearchModal({ onClose }) {
  const { t } = useTranslation('results')
  const contentRef = useRef(null)
  const htmlContent = useMemo(() => markdownToHtml(researchMarkdown), [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={contentRef}
        className="bg-white w-full sm:max-w-2xl sm:mx-4 sm:rounded-2xl
                   rounded-t-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#48C4B0]">{t('research.science')}</p>
            <h2 className="text-base font-bold text-[#1B1B1B]">{t('research.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full
                       bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {/* Scrollable content */}
        <div
          className="overflow-y-auto px-5 py-4 flex-1"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] bg-[#48C4B0] text-white rounded-xl
                       text-sm font-semibold hover:bg-[#3db09d] transition-colors"
          >
            {t('research.backToPlan')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CoachNotes (Pro) ──────────────────────────────────────────────────────────

const PRO_COACH_TTL_MS = 24 * 60 * 60 * 1000

function getProCoachFromCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, timestamp } = JSON.parse(raw)
    if (Date.now() - timestamp > PRO_COACH_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    return null
  }
}

function setProCoachCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }))
  } catch {}
}

function CoachNotes({ coachCopy, watchOut, loading, failed = false, onRetry, startExpanded = false }) {
  const [expanded, setExpanded] = useState(startExpanded)

  if (loading) {
    return (
      <section className="border-2 border-gray-100 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Coach notes</p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-600">
              AI · Lecka knowledge
            </span>
          </div>
          <div className="w-4 h-4 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-3/5" />
        </div>
        <div className="mt-4 h-14 bg-amber-50 rounded-xl animate-pulse" />
      </section>
    )
  }

  if (failed) {
    return (
      <section className="border-2 border-gray-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Coach notes</p>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-600">
            AI · Lecka knowledge
          </span>
        </div>
        <p className="text-sm text-gray-400 mb-3">Coach notes couldn&apos;t load this time.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold text-[#48C4B0] hover:underline"
          >
            Retry →
          </button>
        )}
      </section>
    )
  }

  if (!coachCopy) return null

  const firstSentence = coachCopy.replace(/\n/g, ' ').split(/(?<=\.)\s/)[0] ?? ''
  const teaser = firstSentence.length > 120
    ? firstSentence.slice(0, 120) + '…'
    : firstSentence

  const paragraphs = coachCopy.split(/\n\n+/).filter(Boolean)

  return (
    <section className="border-2 border-gray-100 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Coach notes</p>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-600">
            AI · Lecka knowledge
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {!expanded && (
        <p className="px-5 pb-4 text-sm text-gray-400 italic leading-snug">{teaser}</p>
      )}
      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="border-l-2 border-[#48C4B0] pl-3 mb-4 text-sm text-gray-700 leading-relaxed"
            >
              {p}
            </p>
          ))}
          {watchOut && (
            <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 mb-1">
                Watch out for
              </p>
              <p className="text-sm text-amber-900">{watchOut}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── TrainingAccordion ─────────────────────────────────────────────────────────

function TrainingAccordion({ trainingInfo, t }) {
  const [open, setOpen] = useState(false)
  if (!trainingInfo.hasOverage) return null
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-[#1B1B1B]"
      >
        <span>{t('results:training.prepTitle') || 'Training tips'}</span>
        <span className="text-gray-400 text-xs">{open ? '↑' : '↓'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-sm text-[#1B1B1B] mb-3">
            {trainingInfo.gelOverage > 0 && (
              <Trans
                t={t}
                i18nKey="results:training.gelOverage"
                count={trainingInfo.gelRaceUnits}
                values={{ race: trainingInfo.gelRaceUnits, cart: trainingInfo.gelCartUnits, extra: trainingInfo.gelOverage }}
                components={{ bold: <strong /> }}
              />
            )}
            {trainingInfo.gelOverage > 0 && trainingInfo.barOverage > 0 ? ' ' : ''}
            {trainingInfo.barOverage > 0 && (
              <Trans
                t={t}
                i18nKey={trainingInfo.gelOverage > 0 ? 'results:training.barOverage' : 'results:training.barOverageOnly'}
                count={trainingInfo.barOverage}
                values={{ extra: trainingInfo.barOverage }}
                components={{ bold: <strong /> }}
              />
            )}
          </p>
          <ul className="space-y-2">
            {[t('results:training.tip1'), t('results:training.tip2'), t('results:training.tip3'), t('results:training.tip4')].map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#1B1B1B]">
                <span className="text-[#48C4B0] font-bold flex-shrink-0 mt-0.5">→</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Race distance constant ─────────────────────────────────────────────────────

const RACE_DISTANCE_KM = {
  '5k': 5, '10k': 10, 'half_marathon': 21.1, 'marathon': 42.2,
  'ultra_50k': 50, 'ultra_100k': 100,
  'triathlon_70_3': 113, 'triathlon_140_6': 226,
}


// ── Main component ────────────────────────────────────────────────────────────

export default function ResultsPage({ targets, foundationTargets, selection, addonCoverage, resolvedAddonItems = [], form, onBack, region: regionProp, hideSave = false, isPublicView = false, planId: planIdProp = null }) {
  const { t } = useTranslation(['results', 'common'])
  const [showResearch,   setShowResearch]   = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [addonOverrides, setAddonOverrides] = useState({})
  const [region,         setRegion]         = useState(regionProp ?? getSavedRegion())
  const [manualQty,      setManualQty]      = useState(null) // null = auto; obj = overrides
  const [chatSummary,    setChatSummary]    = useState(null)
  const [copyPlanState,  setCopyPlanState]  = useState('idle') // idle | copied
  const [proCoachCopy,    setProCoachCopy]    = useState(null)
  const [proWatchOut,     setProWatchOut]     = useState(null)
  const [proCoachLoading, setProCoachLoading] = useState(!isPublicView)
  const [proCoachFailed,   setProCoachFailed]   = useState(false)
  const [coachRetryKey,    setCoachRetryKey]    = useState(0)
  const [planId,           setPlanId]           = useState(planIdProp)
  const emailRef = useRef(null)
  const regionConfig = getRegionConfig(region)
  const regionType   = regionsConfig[region]?.type ?? null

  const { products: liveProducts } = useProducts()
  const allProductsCatalog = liveProducts ?? FALLBACK_PRODUCTS

  // Reset manual overrides when plan inputs change
  useEffect(() => { setManualQty(null) }, [selection, region])

  // Strip non-Lecka placeholder items before any cart/aggregation logic
  const leckaSelection = useMemo(
    () => selection.filter(item => item.product?.type !== 'powder_placeholder'),
    [selection]
  )
  const powderPlaceholder = useMemo(
    () => selection.find(item => item.product?.type === 'powder_placeholder') ?? null,
    [selection]
  )

  const hasAddons = resolvedAddonItems.length > 0

  const totalGelCount = useMemo(
    () => selection
      .filter(i => i.product?.type === 'gel' || i.product?.type === 'ultra_gel')
      .reduce((sum, i) => sum + i.quantity, 0),
    [selection]
  )

  // Pro coach copy — only for live plans, not public/shared views
  useEffect(() => {
    if (isPublicView) return
    setProCoachLoading(true)
    setProCoachFailed(false)
    const cacheKey = `lecka_pro_coach_${targets.race_type}_${targets.total_duration_minutes}_${targets.conditions}_${form.athlete_profile ?? ''}`
    const cached = getProCoachFromCache(cacheKey)
    if (cached) {
      setProCoachCopy(cached.copy ?? null)
      setProWatchOut(cached.watch_out ?? null)
      setProCoachLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 30000)

    const weight_kg = (() => {
      if (!form.weight_value) return null
      const n = parseFloat(form.weight_value)
      if (!isFinite(n)) return null
      return form.weight_unit === 'lb' ? n / 2.20462 : n
    })()

    fetch('/api/coach-copy', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  controller.signal,
      body:    JSON.stringify({
        mode:              'pro',
        race_type:         targets.race_type,
        goal_minutes:      targets.total_duration_minutes,
        conditions:        targets.conditions,
        effort:            targets.effort,
        carb_per_hour:     targets.carb_per_hour,
        sodium_per_hour:   targets.sodium_per_hour,
        fluid_ml_per_hour: targets.fluid_ml_per_hour,
        total_carbs:       targets.total_carbs,
        total_sodium:      targets.total_sodium,
        gel_count:         totalGelCount,
        elevation_tier:    targets.elevation_tier,
        elevation_gain_m:  targets.elevation_gain_m,
        athlete_profile:   form.athlete_profile,
        gender:            form.gender,
        weight_kg,
        caffeine_ok:       targets.caffeine_ok,
        has_addons:        resolvedAddonItems.length > 0,
        addon_carbs_ph:    form.addon_carbs_per_hour ?? 0,
        fuelling_style:    form.fuelling_style,
        selected_products: effectiveSelection.map(s => s.product.name),
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        clearTimeout(timeout)
        if (data?.copy) {
          setProCoachCopy(data.copy)
          setProWatchOut(data.watch_out ?? null)
          setProCoachCache(cacheKey, { copy: data.copy, watch_out: data.watch_out ?? null })
        }
        setProCoachLoading(false)
      })
      .catch(() => {
        clearTimeout(timeout)
        setProCoachLoading(false)
        setProCoachFailed(true)
      })

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [coachRetryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Silent plan save for logged-in users — only for fresh plans, not when viewing a saved plan
  useEffect(() => {
    if (isPublicView || planIdProp) return
    const userId = localStorage.getItem('lecka_user_id')
    if (!userId) {
      localStorage.setItem('lecka_plan_needs_save', 'true')
      return
    }
    fetch('/api/plans', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
      body:    JSON.stringify({
        inputs:    { ...form, addon_items: form.addon_items ?? [], mode: 'pro' },
        targets,
        selection,
        region:    regionProp ?? getSavedRegion() ?? 'us',
        lang:      'en',
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.planId) setPlanId(data.planId) })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const aggregated   = useMemo(
    () => aggregateByProduct(leckaSelection, region, manualQty, allProductsCatalog),
    [leckaSelection, region, manualQty, allProductsCatalog]
  )
  const trainingInfo = useMemo(() => computeTrainingInfo(aggregated), [aggregated])
  const provided     = useMemo(
    () => computeProvidedNutrition(leckaSelection, manualQty, targets.total_duration_minutes, allProductsCatalog),
    [leckaSelection, manualQty, targets.total_duration_minutes, allProductsCatalog]
  )

  // Variety pack CTA — always just 1× gel variety pack + 1× bar variety pack, nothing else
  const vpCartURL = useMemo(() => {
    const gelVP = allProductsCatalog.find(p => p.type === 'variety_pack')
    if (!gelVP) return null
    const gelVPVariants = gelVP.regions?.[region]?.variants ?? []
    if (!gelVPVariants.length) return null

    const vpItems = []

    const gelVPVariant = gelVPVariants[0]
    vpItems.push({
      product:    gelVP,
      totalUnits: gelVPVariant.units_per_pack,
      cartItems:  [{ ...gelVPVariant, quantity: 1 }],
      linePrice:  gelVPVariant.price,
      cartUnits:  gelVPVariant.units_per_pack,
    })

    const barVP = allProductsCatalog.find(p => p.type === 'bar_variety_pack')
    if (barVP) {
      const barVPVariants = barVP.regions?.[region]?.variants ?? []
      if (barVPVariants.length > 0) {
        const barVPVariant = barVPVariants[0]
        vpItems.push({
          product:    barVP,
          totalUnits: barVPVariant.units_per_pack,
          cartItems:  [{ ...barVPVariant, quantity: 1 }],
          linePrice:  barVPVariant.price,
          cartUnits:  barVPVariant.units_per_pack,
        })
      }
    }

    return embedCartURL(buildCartURLFromAggregated(vpItems, region === 'us' ? 'NUTRIPLAN10' : '', '', region))
  }, [region, allProductsCatalog])

  // manualQty overrides must be reflected in anything sent off-device (email, saved
  // plan) — the raw selection prop still has the engine's original quantities.
  const effectiveSelection = useMemo(
    () => adjustTimelineSelection(leckaSelection, manualQty, targets.total_duration_minutes, allProductsCatalog),
    [leckaSelection, manualQty, targets, allProductsCatalog]
  )

  const addonTimelineItems = useMemo(
    () => buildAddonTimelineItems(resolvedAddonItems, targets.total_duration_minutes),
    [resolvedAddonItems, targets.total_duration_minutes]
  )

  const timeline = useMemo(
    () => buildTimeline([...effectiveSelection, ...addonTimelineItems], targets.total_duration_minutes),
    [effectiveSelection, addonTimelineItems, targets.total_duration_minutes]
  )

  const gapSelection = useMemo(() => {
    if (regionType === 'international') {
      return effectiveSelection.map(item => ({
        product: item.product,
        quantity: item.quantity,
        note: item.note ?? '',
      }))
    }
    return aggregated.map(row => {
      const selItem = effectiveSelection.find(s => s.product.id === row.product.id)
      return { product: row.product, quantity: row.totalUnits, note: selItem?.note ?? '' }
    })
  }, [aggregated, effectiveSelection, regionType])

  const subtotal   = aggregated.reduce((sum, row) => sum + row.linePrice, 0)
  const totalPacks = aggregated.reduce(
    (sum, row) => sum + row.cartItems.reduce((s, item) => s + item.quantity, 0), 0
  )

  // Cart URL built from the already-optimised aggregated rows (may use variety pack)
  const cartURL = useMemo(
    () => embedCartURL(buildCartURLFromAggregated(aggregated, region === 'us' ? 'NUTRIPLAN10' : '', '', region)),
    [aggregated, region]
  )

  function handleRegionChange(newRegion) {
    setRegion(newRegion)
    saveRegion(newRegion)
    const userId = localStorage.getItem('lecka_user_id')
    if (userId) {
      fetch('/api/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userId}`,
        },
        body: JSON.stringify({ preferred_region: newRegion }),
      }).catch(() => {})
    }
  }

  // VN region: open Zalo or Facebook chat and copy order summary to clipboard
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => execCopy(text))
    } else {
      execCopy(text)
    }
  }

  function execCopy(text) {
    const el = document.createElement('textarea')
    el.value = text
    el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(el)
    el.focus()
    el.select()
    try { document.execCommand('copy') } catch (_) {}
    document.body.removeChild(el)
  }

  function handleChatClick(chatUrl) {
    const lines = aggregated.map(row =>
      `• ${row.totalUnits}x ${row.product.name} — ${formatPrice(row.linePrice, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}`
    ).join('\n')
    const summary = [
      t('results:cta.chat.clipboardIntro'),
      lines,
      t('results:cta.chat.clipboardTotal', { total: formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2) }),
    ].join('\n')

    setChatSummary(summary)
    copyToClipboard(summary)
    window.open(chatUrl, '_blank', 'noopener,noreferrer')
  }

  function handleCopyPlan() {
    const raceName = form.race_name || heroTitle
    const fmtMin = m => { const h = Math.floor(m / 60); const mn = m % 60; return h > 0 ? `${h}h${mn > 0 ? String(mn).padStart(2, '0') : ''}` : `${mn}min` }
    const productLines = effectiveSelection.map(item => {
      const timingSummary = item.timing_minutes?.length > 0
        ? `at ${item.timing_minutes.map(fmtMin).join(', ')}`
        : ''
      return `• ${item.quantity}x ${item.product.name}${timingSummary ? ` (${timingSummary})` : ''}`
    }).join('\n')
    const summary = [
      `--- ${raceName} Nutrition Plan ---`,
      form.goal_time ? `Goal time: ${form.goal_time}` : null,
      conditionLabel ? `Conditions: ${conditionLabel}` : null,
      '',
      'Targets:',
      `• ${targets.carb_per_hour}g carbs/hour`,
      `• ${targets.sodium_per_hour}mg sodium/hour`,
      `• ${targets.fluid_ml_per_hour}ml fluid/hour`,
      '',
      productLines ? 'Products:' : null,
      productLines || null,
      '',
      'Built with Lecka — getlecka.com',
    ].filter(l => l !== null).join('\n')

    copyToClipboard(summary)
    setCopyPlanState('copied')
    setTimeout(() => setCopyPlanState('idle'), 2000)
  }

  function formatRaceDate(dateStr) {
    if (!dateStr) return null
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  function daysUntilRace(dateStr) {
    if (!dateStr) return null
    const race  = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((race - today) / (1000 * 60 * 60 * 24))
  }

  function retryCoach() {
    const cacheKey = `lecka_pro_coach_${targets.race_type}_${targets.total_duration_minutes}_${targets.conditions}_${form.athlete_profile ?? ''}`
    try { localStorage.removeItem(cacheKey) } catch {}
    setCoachRetryKey(k => k + 1)
  }

  function handleAddonChange(productId, qty) {
    setAddonOverrides(prev => ({ ...prev, [productId]: qty }))
  }

  // Prefer athlete's race name → triathlon type label (if triathlon) → distance typed → race_type label
  const heroTitle      = form.race_name ||
    (form.sport === 'triathlon' ? getRaceLabel(t, targets.race_type) : null) ||
    (form.custom_km_display ? `${form.custom_km_display} ${form.dist_unit || 'km'}` : null) ||
    getRaceLabel(t, targets.race_type)
  const effortLabel    = getEffortLabel(t, targets.effort)
  const conditionLabel = getConditionLabel(t, targets.conditions)
  const surfaceLabel   = form.surface_type
    ? (form.surface_type.charAt(0).toUpperCase() + form.surface_type.slice(1))
    : null

  const [mobileTab, setMobileTab] = useState('products')
  const htmlContent = useMemo(() => markdownToHtml(researchMarkdown), [])

  const orderSection = (
    <>
      {/* Region picker */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(regionsConfig).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleRegionChange(key)}
            className={[
              'px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-colors',
              region === key
                ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#48C4B0]',
            ].join(' ')}
          >
            {cfg.label}
          </button>
        ))}
      </div>

      {region == null ? (
        <div className="border-2 border-gray-100 rounded-2xl p-5 text-center text-sm text-gray-500">
          <p className="font-semibold text-[#1B1B1B] mb-1">Select your region above</p>
          <p>to see local pricing and order.</p>
        </div>
      ) : regionType === 'international' ? (
        <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5 space-y-3">
          <p className="text-sm text-[#1B1B1B] leading-relaxed">
            Lecka isn&apos;t available in your country yet — use this plan with any real food gel matching the targets above.
          </p>
          <a
            href="https://www.getlecka.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors"
          >
            Find Lecka → getlecka.com
          </a>
        </div>
      ) : aggregated.length === 0 ? (
        <div className="border-l-4 border-[#48C4B0] bg-[#48C4B0]/5 rounded-r-lg p-4 text-sm text-[#1B1B1B] leading-snug">
          We couldn&apos;t find products available in your region. Try switching region above.
        </div>
      ) : (
        <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{t('results:cta.packs', { count: totalPacks })}</span>
            <span className="text-lg font-bold text-[#1B1B1B]">
              {formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}
            </span>
          </div>

          {regionType === 'haravan' && (
            <div className="flex flex-col gap-2">
              <button onClick={() => handleChatClick(regionConfig.zalo_url)}
                className="flex items-center justify-center w-full min-h-[48px] bg-[#0068FF] hover:bg-[#0057d9] text-white rounded-2xl text-sm font-bold transition-colors">
                {t('results:cta.chat.zalo')}
              </button>
              <button onClick={() => handleChatClick(regionConfig.facebook_url)}
                className="flex items-center justify-center w-full min-h-[48px] bg-[#1877F2] hover:bg-[#1060d0] text-white rounded-2xl text-sm font-bold transition-colors">
                {t('results:cta.chat.facebook')}
              </button>
            </div>
          )}

          {regionType === 'shopify' && (
            <>
              <a href={cartURL} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors">
                {t('results:cta.buyPlan')}
              </a>
              {region === 'us' && (
                <p className="text-xs font-semibold text-[#48C4B0] text-center">{t('results:cta.discount')}</p>
              )}
              {region === 'us' && vpCartURL && (
                <a href={vpCartURL} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center w-full min-h-[44px] border-2 border-[#48C4B0] text-[#48C4B0] rounded-2xl text-sm font-semibold hover:bg-[#48C4B0] hover:text-white transition-colors">
                  {t('results:cta.varietyPack')}
                </a>
              )}
            </>
          )}

          {regionType === 'distributor' && (
            <a href={regionConfig.store_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors">
              Shop at {regionConfig.label} →
            </a>
          )}

          {chatSummary && (
            <div className="mt-2 bg-white rounded-xl p-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-1.5">{t('results:cta.chat.summaryLabel')}</p>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans select-all cursor-text leading-relaxed">{chatSummary}</pre>
            </div>
          )}
        </div>
      )}
    </>
  )

  const timelineTabContent = (
    <div className="space-y-6">
      <WarningBox warnings={targets.warnings} />
      {['hot', 'humid'].includes(targets.conditions) && targets.total_duration_minutes >= 240 && (
        <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg p-4 text-sm text-[#1B1B1B] leading-snug">
          <p className="font-semibold text-amber-800 mb-1">Pre-race sodium loading recommended</p>
          <p className="text-amber-900">
            2–4 hours before your start, mix ~2 teaspoons of salt (~10g) into 1L of water or electrolyte drink.
            Sip steadily — don&apos;t chug. This boosts blood sodium and plasma volume, helping you perform in the heat.
          </p>
        </div>
      )}
      <section>
        <SectionLabel>{t('section.raceTimeline')}</SectionLabel>
        <RaceTimelineV2 events={timeline} totalDuration={targets.total_duration_minutes} />
      </section>
      {leckaSelection.some(i => i.product?.type === 'ultra_gel') && (
        <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-xl p-3">
          <p className="text-xs font-semibold text-amber-900 mb-0.5">Running vest required</p>
          <p className="text-xs text-amber-800">Ultra gels are larger than standard gels and need a running vest pocket to carry during the race.</p>
        </div>
      )}
      {(() => {
        const f = targets.fluid_ml_per_hour
        const d = targets.total_duration_minutes
        let key
        if (d > 300)                key = 'nutrition.carry.vest2'
        else if (f > 500 && d > 120) key = 'nutrition.carry.vest1_5'
        else if (f > 500)           key = 'nutrition.carry.twoBottles'
        else if (d > 90)            key = 'nutrition.carry.softFlask'
        else                        key = 'nutrition.carry.singleBottle'
        return (
          <div className="border-l-4 border-[#48C4B0] pl-3 py-1">
            <p className="text-sm text-gray-600">{t(key)}</p>
          </div>
        )
      })()}
      <TrainingAccordion trainingInfo={trainingInfo} t={t} />
    </div>
  )

  const coachTabContent = (
    <div className="space-y-6">
      {!isPublicView && (
        <>
          <CoachNotes
            coachCopy={proCoachCopy}
            watchOut={proWatchOut}
            loading={proCoachLoading}
            failed={proCoachFailed}
            onRetry={retryCoach}
            startExpanded
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={retryCoach}
              disabled={proCoachLoading}
              className="text-xs text-gray-400 hover:text-[#48C4B0] transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              <span>↻</span>
              <span>{proCoachLoading ? 'Refreshing…' : 'Refresh with new product selection'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  )

  const scienceTabContent = (
    <div
      className="prose prose-sm max-w-none text-sm"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  )

  return (
    <div className="bg-white">

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showShareModal && (
        <ShareModal
          onClose={() => setShowShareModal(false)}
          planUrl={planId ? `plan.getlecka.com/plan/${planId}` : 'plan.getlecka.com'}
          planProps={{
            raceName:      heroTitle,
            duration:      formatDuration(targets.total_duration_minutes),
            conditions:    conditionLabel,
            effort:        effortLabel,
            carbsPerHour:  targets.carb_per_hour,
            sodiumPerHour: targets.sodium_per_hour,
            fluidPerHour:  targets.fluid_ml_per_hour,
            totalCarbs:    targets.total_carbs,
            totalSodium:   targets.total_sodium,
            products:      gapSelection.map(i => ({ name: i.product.name, quantity: i.quantity, type: i.product.type })),
            region,
          }}
        />
      )}

      {/* ── Desktop Nav bar ─────────────────────────────────────────────────── */}
      <div className="hidden lg:block">
        {isEmbedded ? null : <Nav />}
      </div>

      {/* ── Desktop teal hero header ─────────────────────────────────────────── */}
      <div className="hidden lg:flex bg-[#48C4B0] px-5 py-3
                      items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-medium text-white/70 uppercase tracking-[.06em] mb-1">
            Lecka Pro Plan
          </p>
          <h1 className="text-base font-bold text-white leading-tight">{heroTitle}</h1>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {(() => {
              const km = form.custom_race_km > 0
                ? form.custom_race_km
                : RACE_DISTANCE_KM[targets.race_type] ?? null
              return km ? (
                <span className="bg-black/15 text-white rounded-full px-2.5 py-0.5 text-[10px] font-medium">
                  {km} km
                </span>
              ) : null
            })()}
            <span className="bg-black/15 text-white rounded-full px-2.5 py-0.5 text-[10px]">
              {form.goal_time ? `Target ${formatDuration(targets.total_duration_minutes)}`
                              : formatDuration(targets.total_duration_minutes)}
            </span>
            {conditionLabel && (
              <span className="bg-black/15 text-white rounded-full px-2.5 py-0.5 text-[10px]">
                {conditionLabel}
              </span>
            )}
            {effortLabel && (
              <span className="bg-black/15 text-white rounded-full px-2.5 py-0.5 text-[10px]">
                {effortLabel}
              </span>
            )}
            {form.race_date && daysUntilRace(form.race_date) > 0 && (
              <span className="bg-white/20 text-white rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
                {new Date(form.race_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {daysUntilRace(form.race_date)}d to go
              </span>
            )}
            {form.race_date && daysUntilRace(form.race_date) === 0 && (
              <span className="bg-[#F64866] text-white rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
                Race day! 🎉
              </span>
            )}
            {form.training_mode && (
              <span className="bg-amber-400/80 text-white rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
                Training mode
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <button
            type="button"
            onClick={handleCopyPlan}
            className="bg-white/20 hover:bg-white/30 border-none rounded-lg px-2.5 py-1.5 text-white text-xs transition-colors"
          >
            {copyPlanState === 'copied' ? '✓ Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => emailRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="bg-white/20 hover:bg-white/30 border-none rounded-lg px-2.5 py-1.5 text-white text-xs transition-colors"
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="bg-white/20 hover:bg-white/30 border-none rounded-lg px-2.5 py-1.5 text-white text-xs transition-colors"
          >
            Share
          </button>
          {regionType === 'international' ? (
            <a href="https://www.getlecka.com" target="_blank" rel="noopener noreferrer"
               className="bg-[#F64866] hover:bg-[#e03558] rounded-lg px-3 py-1.5 text-white text-xs font-semibold transition-colors">
              Find Lecka →
            </a>
          ) : (
            <a href={cartURL} target="_blank" rel="noopener noreferrer"
               className="bg-[#F64866] hover:bg-[#e03558] rounded-lg px-3 py-1.5 text-white text-xs font-semibold transition-colors">
              Buy plan →
            </a>
          )}
        </div>
      </div>

      {/* ── Desktop 3-stat strip ─────────────────────────────────────────────── */}
      <div className="hidden lg:grid grid-cols-3 border-b border-gray-100">
        {[
          { value: targets.carb_per_hour,     unit: 'g',  label: 'carbs / hour',   sub: `${targets.total_carbs}g total` },
          { value: targets.sodium_per_hour,   unit: 'mg', label: 'sodium / hour',  sub: `${targets.total_sodium}mg total` },
          { value: targets.fluid_ml_per_hour, unit: 'ml', label: 'fluid / hour',   sub: null },
        ].map((m, i) => (
          <div key={m.label} className={`px-4 py-3 text-center ${i < 2 ? 'border-r border-gray-100' : ''}`}>
            <p className="text-[10px] font-medium uppercase tracking-[.07em] text-gray-400 mb-1">
              {m.label}
            </p>
            <p className="text-2xl font-bold text-[#1B1B1B] leading-none">
              {m.value}
              <span className="text-sm text-gray-400 font-normal">{m.unit}</span>
            </p>
            {m.sub && (
              <p className="text-[10px] text-gray-300 mt-1">{m.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Mobile view (<1024px) ───────────────────────────────────────────── */}
      <div className="lg:hidden">
        {/* Nav */}
        {isEmbedded ? (
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
            <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={onBack}
                className="text-sm text-[#48C4B0] font-medium hover:underline min-h-[44px] flex items-center"
              >
                {t('common:nav.back')}
              </button>
              <img src="/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" className="h-6" />
              <LanguageSwitcher compact />
            </div>
          </div>
        ) : (
          <Nav />
        )}

        {/* Teal header */}
        <div className="bg-[#48C4B0] px-5 pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-white text-base">lecka</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyPlan}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-xs hover:bg-white/30 transition-colors"
                title="Copy plan"
              >
                📋
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-xs hover:bg-white/30 transition-colors"
                title="Download PDF"
              >
                📄
              </button>
              <button
                type="button"
                onClick={() => { setMobileTab('order'); setTimeout(() => emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-xs hover:bg-white/30 transition-colors"
                title="Email plan"
              >
                ✉️
              </button>
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-xs hover:bg-white/30 transition-colors"
                title="Share"
              >
                🔗
              </button>
            </div>
          </div>
          <h1 className="text-xl font-bold text-white">{heroTitle}</h1>
          <p className="text-sm text-white/80 mt-1 flex flex-wrap items-center gap-1.5">
            {(() => {
              const km = form.custom_race_km > 0
                ? form.custom_race_km
                : RACE_DISTANCE_KM[targets.race_type] ?? null
              return km ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/15 text-white text-xs">
                  {km} km
                </span>
              ) : null
            })()}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/15 text-white text-xs">
              {form.goal_time ? 'Target ' : ''}{formatDuration(targets.total_duration_minutes)}
            </span>
            {conditionLabel && <span className="opacity-80">{conditionLabel}</span>}
          </p>
        </div>

        {/* Mobile tabs */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 flex">
          {[
            { key: 'products', label: 'Products' },
            { key: 'timeline', label: 'Timeline' },
            { key: 'coach',    label: 'Coach' },
            { key: 'order',    label: 'Order' },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMobileTab(tab.key)}
              className={[
                'flex-1 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors',
                mobileTab === tab.key
                  ? 'border-[#48C4B0] text-[#1B1B1B]'
                  : 'border-transparent text-gray-400',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Mobile tab content */}
        <div className="max-w-lg mx-auto px-5 py-6 space-y-8 pb-32">
          {mobileTab === 'timeline' && timelineTabContent}
          {mobileTab === 'products' && (
            <div className="space-y-6">
              <NutritionSummary targets={targets} provided={provided} foundationTargets={foundationTargets} addonCoverage={addonCoverage} />
              <section>
                <SectionLabel>
                  {form.fuelling_style === 'gels_only'       ? 'Your gels'
                   : form.fuelling_style === 'gels_and_bars'  ? 'Your gels and bars'
                   : form.fuelling_style === 'drink_mix_base' ? 'Your gels (drink mix coming soon)'
                   : 'What to take'}
                </SectionLabel>
                <PlanProductEditor
                  region={region}
                  regionType={regionType}
                  leckaSelection={leckaSelection}
                  resolvedAddonItems={resolvedAddonItems}
                  addonOverrides={addonOverrides}
                  onAddonChange={handleAddonChange}
                  manualQty={manualQty}
                  setManualQty={setManualQty}
                  targets={targets}
                  provided={provided}
                  catalog={allProductsCatalog}
                />
              </section>
            </div>
          )}
          {mobileTab === 'coach' && (
            <div className="space-y-6">
              {!isPublicView && (
                <CoachNotes
                  coachCopy={proCoachCopy}
                  watchOut={proWatchOut}
                  loading={proCoachLoading}
                  failed={proCoachFailed}
                  onRetry={retryCoach}
                  startExpanded
                />
              )}
              <details className="mt-4">
                <summary className="text-xs font-semibold text-[#48C4B0] cursor-pointer list-none flex items-center gap-1">
                  <span>Gut training protocol</span>
                  <span className="text-gray-400">↓</span>
                </summary>
                <div className="mt-3">
                  <GutTrainingTab targets={targets} form={form} leckaSelection={leckaSelection} />
                </div>
              </details>
            </div>
          )}
          {mobileTab === 'order' && (
            <div className="space-y-6">
              <section>
                <SectionLabel>Get your products</SectionLabel>
                {orderSection}
              </section>
              <div ref={emailRef}>
                <PlanDeliveryCard
                  targets={targets}
                  selection={effectiveSelection}
                  form={form}
                  region={region}
                  hideSave={hideSave}
                  resolvedAddonItems={resolvedAddonItems}
                  planId={planId}
                />
              </div>
            </div>
          )}
        </div>

        {/* Mobile sticky bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 px-5 py-3">
          {regionType === 'international' ? (
            <a
              href="https://www.getlecka.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors"
            >
              Find Lecka → getlecka.com
            </a>
          ) : (
            <a
              href={cartURL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors"
            >
              {aggregated.length > 0
                ? `Buy plan — ${formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2)} →`
                : 'Buy plan →'}
            </a>
          )}
        </div>
      </div>

      {/* ── Desktop two-column layout (≥1024px) ─────────────────────────────── */}
      <div className="hidden lg:grid" style={{ gridTemplateColumns: '1fr 2fr' }}>

        {/* Left column */}
        <PlanLeftColumn>
          {/* What to take */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
              {form.fuelling_style === 'gels_only'       ? 'Your gels'
               : form.fuelling_style === 'gels_and_bars'  ? 'Your gels and bars'
               : form.fuelling_style === 'drink_mix_base' ? 'Your gels'
               : 'What to take'}
            </p>
            <PlanProductEditor
              region={region}
              regionType={regionType}
              leckaSelection={leckaSelection}
              resolvedAddonItems={resolvedAddonItems}
              addonOverrides={addonOverrides}
              onAddonChange={handleAddonChange}
              manualQty={manualQty}
              setManualQty={setManualQty}
              targets={targets}
              provided={provided}
              catalog={allProductsCatalog}
            />
          </section>

          {/* Order card */}
          <section>
            <SectionLabel>Get your products</SectionLabel>
            {orderSection}
          </section>

          {/* Email plan */}
          <div ref={emailRef}>
            <PlanDeliveryCard
              targets={targets}
              selection={effectiveSelection}
              form={form}
              region={region}
              hideSave={hideSave}
              resolvedAddonItems={resolvedAddonItems}
              planId={planId}
            />
          </div>

          {/* Share button */}
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="flex items-center justify-center gap-2 w-full min-h-[44px] border-2 border-gray-200 rounded-2xl text-sm font-semibold text-[#1B1B1B] hover:border-[#48C4B0] hover:text-[#48C4B0] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share my plan
          </button>

          {/* Footer links */}
          <div className="pt-4 border-t border-gray-100 space-y-2">
            <p className="text-xs text-gray-400 text-center">
              <a href="https://www.getlecka.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#48C4B0]">getlecka.com</a>
              {' '}·{' '}
              <a href="mailto:info@getlecka.com" className="hover:text-[#48C4B0]">info@getlecka.com</a>
            </p>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              {[
                { label: 'US', href: 'https://www.getlecka.com' },
                { label: 'VN', href: 'https://www.getlecka.vn' },
                { label: 'DE', href: 'https://www.getlecka.de' },
                { label: 'DK', href: 'https://www.getlecka.dk' },
                { label: 'CH', href: 'https://www.getlecka.ch' },
                { label: 'SG', href: 'https://www.rdrc.sg/collections/lecka' },
                { label: 'HK', href: 'https://foodisdom.is/collections/lecka' },
              ].map(({ label, href }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-[#48C4B0] transition-colors">
                  {label}
                </a>
              ))}
            </div>
          </div>
        </PlanLeftColumn>

        {/* Right column with tabs */}
        <PlanRightColumn
          defaultTab={isPublicView ? 'timeline' : 'coach'}
          tabs={[
            {
              key: 'timeline',
              label: 'Timeline',
              content: timelineTabContent,
            },
            {
              key: 'coach',
              label: 'Coach notes',
              content: coachTabContent,
            },
            {
              key: 'gut',
              label: 'Gut training',
              content: (
                <GutTrainingTab
                  targets={targets}
                  form={form}
                  leckaSelection={leckaSelection}
                />
              ),
            },
            {
              key: 'science',
              label: 'Science',
              content: scienceTabContent,
            },
          ]}
        />

      </div>
    </div>
  )
}
