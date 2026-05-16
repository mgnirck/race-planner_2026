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
import { isEmbedded, notifyEmailCapture, embedCartURL, detectRegion, getRegionConfig } from '../embed.js'
import Nav from './Nav.jsx'
import regionsConfig from '../config/regions.json'
import allProductsCatalog from '../config/products.json'
import researchMarkdown from '../../NUTRITION_RESEARCH_ANALYSIS.md?raw'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import i18n from '../i18n.js'
import { getRaceLabel, getEffortLabel, getConditionLabel } from '../i18n-utils.js'
import { formatAddonSummary } from '../engine/kit-calculator.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const STORE_LINKS = {
  de: { label: 'Germany',      url: 'https://www.getlecka.de' },
  dk: { label: 'Denmark',      url: 'https://www.getlecka.dk' },
  ch: { label: 'Switzerland',  url: 'https://www.getlecka.ch' },
  sg: { label: 'Singapore',    url: 'https://www.rdrc.sg/collections/lecka' },
  hk: { label: 'Hong Kong',    url: 'https://foodisdom.is/collections/lecka' },
}

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

function aggregateByProduct(selection, region = 'us', manualQty = null) {
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
        const product = allProductsCatalog.find(p => p.id === id && (p.type === 'gel' || p.type === 'ultra_gel' || p.type === 'bar'))
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

function computeProvidedNutrition(selection, manualQty, totalDurationMinutes) {
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
          const p = allProductsCatalog.find(p => p.id === id)
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

        {/* Carry strategy tip */}
        {(() => {
          const f = targets.fluid_ml_per_hour
          const d = targets.total_duration_minutes
          let key
          if (d > 300)           key = 'nutrition.carry.vest2'
          else if (f > 500 && d > 120) key = 'nutrition.carry.vest1_5'
          else if (f > 500)      key = 'nutrition.carry.twoBottles'
          else if (d > 90)       key = 'nutrition.carry.softFlask'
          else                   key = 'nutrition.carry.singleBottle'
          return (
            <div className="border-l-4 border-[#48C4B0] pl-3 py-1">
              <p className="text-sm text-gray-600">{t(key)}</p>
            </div>
          )
        })()}
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

// ── RaceTimeline ──────────────────────────────────────────────────────────────

/**
 * Visual fuel bar — shows each gel as a dot along the race duration track.
 * Works well for any race length; a 14-hour ultra simply has closely-spaced dots.
 */
function FuelBar({ events, totalDuration }) {
  const { t } = useTranslation('results')
  const duringEvents = events.filter(e => e.phase === 'during')
  const hasCaf       = duringEvents.some(e => e.product.caffeine)

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
        <span>{t('timeline.start')}</span>
        <span>{t('timeline.finish', { duration: formatDuration(totalDuration) })}</span>
      </div>

      {/* Track */}
      <div className="relative h-4 mx-0.5">
        {/* Background rail */}
        <div className="absolute inset-y-[5px] inset-x-0 bg-gray-100 rounded-full" />
        {/* Coloured fill */}
        <div className="absolute inset-y-[5px] inset-x-0 bg-gradient-to-r from-[#48C4B0]/30 to-[#48C4B0]/10 rounded-full" />

        {/* Gel dots */}
        {duringEvents.map((ev, i) => {
          const pct = Math.min(Math.max((ev.time / totalDuration) * 100, 1), 99)
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2
                         w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm"
              style={{
                left:            `${pct}%`,
                backgroundColor: ev.product.caffeine ? '#1B1B1B' : '#48C4B0',
                zIndex:          1,
              }}
            />
          )
        })}

        {/* Start marker */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2
                        w-3 h-3 rounded-full bg-[#48C4B0] border-2 border-white" style={{ zIndex: 2 }} />
        {/* Finish marker */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2
                        w-3 h-3 rounded-full bg-gray-300 border-2 border-white" style={{ zIndex: 2 }} />
      </div>

      {/* Legend */}
      {hasCaf && (
        <div className="flex gap-4 mt-2 justify-end">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#48C4B0]" />
            <span className="text-xs text-gray-400">{t('timeline.gel')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#1B1B1B]" />
            <span className="text-xs text-gray-400">{t('timeline.caffeineGel')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

const PHASE_BADGE = {
  before: 'bg-[#48C4B0]/10 text-[#48C4B0]',
  during: 'bg-[#48C4B0]/20 text-[#1B1B1B]',
  after:  'bg-gray-100 text-gray-500',
}

function TimelineRow({ event, totalDuration, isLast }) {
  const { t } = useTranslation('results')
  const badgeClass = event.isAddon ? 'bg-gray-100 text-gray-500' : PHASE_BADGE[event.phase]
  return (
    <div className={`flex items-start gap-4 px-5 py-3 ${!isLast ? 'border-b border-gray-100' : ''}`}>
      <div className="w-24 flex-shrink-0 pt-0.5">
        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full
                          whitespace-nowrap ${badgeClass}`}>
          {formatTimingLabel(event.time, totalDuration, t)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1B1B1B] leading-tight">
          {event.isAddon
            ? (event.product.display_name ?? event.product.name)
            : event.product.name}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{event.note}</p>
      </div>
    </div>
  )
}

function DuringGroupRow({ group, isLast }) {
  const { t } = useTranslation('results')
  const badgeClass = group.isAddon ? 'bg-gray-100 text-gray-500' : PHASE_BADGE.during
  return (
    <div className={`flex items-start gap-4 px-5 py-3 ${!isLast ? 'border-b border-gray-100' : ''}`}>
      <div className="w-24 flex-shrink-0 pt-0.5">
        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full
                          whitespace-nowrap ${badgeClass}`}>
          ×{group.count}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1B1B1B] leading-tight">
          {group.isAddon
            ? (group.product.display_name ?? group.product.name)
            : group.product.name}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{group.scheduleText}</p>
        {!group.isAddon && group.product.caffeine && (
          <span className="text-xs font-medium text-[#48C4B0]">+ {t('hero.caffeineTag').toLowerCase()}</span>
        )}
        {group.isAddon && (
          <span className="text-xs text-gray-400 italic">Add-on — buy separately</span>
        )}
      </div>
    </div>
  )
}

function RaceStartDivider() {
  const { t } = useTranslation('results')
  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-[#48C4B0]/5">
      <div className="flex-1 h-px bg-[#48C4B0]/30" />
      <span className="text-xs font-semibold text-[#48C4B0] uppercase tracking-wider whitespace-nowrap">
        {t('timeline.raceStart')}
      </span>
      <div className="flex-1 h-px bg-[#48C4B0]/30" />
    </div>
  )
}

function FinishDivider({ totalDuration }) {
  const { t } = useTranslation('results')
  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-gray-50">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
        {t('timeline.finishLine', { duration: formatDuration(totalDuration) })}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

/**
 * Compact timeline that works for any race length.
 * - Visual fuel bar at top shows gel density across the race.
 * - "During" events are always shown grouped by product + schedule pattern
 *   (e.g. "every 30 min from 20 min × 14") instead of individual rows.
 * - Before / After retain individual rows (typically 1–2 items each).
 */
function RaceTimeline({ events, totalDuration }) {
  const { t } = useTranslation('results')
  if (events.length === 0) return null

  const beforeEvents = events.filter(e => e.phase === 'before')
  const duringEvents = events.filter(e => e.phase === 'during')
  const afterEvents  = events.filter(e => e.phase === 'after')
  const duringGroups = buildDuringGroups(duringEvents, t)

  return (
    <section>
      <SectionLabel>{t('section.raceTimeline')}</SectionLabel>

      {/* Visual fuel bar */}
      {duringEvents.length > 0 && (
        <div className="mb-5">
          <FuelBar events={events} totalDuration={totalDuration} />
        </div>
      )}

      {/* Phase list */}
      <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">

        {/* Before */}
        {beforeEvents.map((ev, i) => (
          <TimelineRow
            key={`b${i}`}
            event={ev}
            totalDuration={totalDuration}
            isLast={false}
          />
        ))}

        {/* Race start divider */}
        <RaceStartDivider />

        {/* During — grouped */}
        {duringGroups.map((group, i) => (
          <DuringGroupRow
            key={`d${i}`}
            group={group}
            isLast={i === duringGroups.length - 1 && afterEvents.length === 0}
          />
        ))}

        {/* Finish divider */}
        {afterEvents.length > 0 && <FinishDivider totalDuration={totalDuration} />}

        {/* After */}
        {afterEvents.map((ev, i) => (
          <TimelineRow
            key={`a${i}`}
            event={ev}
            totalDuration={totalDuration}
            isLast={i === afterEvents.length - 1}
          />
        ))}
      </div>
    </section>
  )
}

// ── PlanDeliveryCard ──────────────────────────────────────────────────────────

function PlanDeliveryCard({ targets, selection, form, region = 'us', hideSave = false, resolvedAddonItems = [] }) {
  const { t } = useTranslation('results')
  const [email,      setEmail]      = useState('')
  const [emailState, setEmailState] = useState('idle') // idle | sending | success | error
  const [saveState,  setSaveState]  = useState('idle') // idle | saving | saved | error
  const [touched,    setTouched]    = useState(false)

  const userId     = localStorage.getItem('lecka_user_id')
  const isLoggedIn = Boolean(userId)

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
      const res = await fetch('/api/plans/save', {
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
            {saveState === 'saved' ? (
              <>
                <p className="text-sm font-semibold text-[#48C4B0]">✓ Plan saved to your account</p>
                <a href="/dashboard" className="text-sm font-semibold text-[#48C4B0] hover:underline whitespace-nowrap">
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

// ── CartEditorModal ───────────────────────────────────────────────────────────

function CartEditorModal({ region, aggregated, manualQty, setManualQty, onClose, regionConfig, provided, targets }) {
  const { t } = useTranslation(['results', 'form'])
  const availableProducts = useMemo(() =>
    allProductsCatalog.filter(p => (p.type === 'gel' || p.type === 'ultra_gel' || p.type === 'bar') && isAvailableInRegion(p, region)),
    [region]
  )

  function getCurrentQty(productId) {
    if (manualQty !== null && productId in manualQty) return manualQty[productId]
    const row = aggregated.find(r => r.product.id === productId)
    return row ? row.totalUnits : 0
  }

  function handleChange(productId, delta) {
    const next = Math.max(0, getCurrentQty(productId) + delta)
    setManualQty(prev => ({ ...(prev ?? {}), [productId]: next }))
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const gels = availableProducts.filter(p => p.type === 'gel' || p.type === 'ultra_gel')
  const bars = availableProducts.filter(p => p.type === 'bar')

  function ProductRow({ product }) {
    const qty = getCurrentQty(product.id)
    return (
      <div className="flex items-center gap-3 py-2">
        <ProductIcon product={product} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1B1B1B] leading-tight">{product.name}</p>
          <p className="text-xs text-gray-400">
            {t('form:product.carbs', { value: product.carbs_per_unit })}
            {product.caffeine ? ` · ${t('form:product.caffeine', { value: product.caffeine_mg })}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => handleChange(product.id, -1)}
            disabled={qty === 0}
            className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center
                       text-gray-500 hover:border-[#48C4B0] hover:text-[#48C4B0] transition-colors
                       disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
          >−</button>
          <span className="w-6 text-center text-sm font-bold text-[#1B1B1B]">{qty}</span>
          <button
            type="button"
            onClick={() => handleChange(product.id, +1)}
            className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center
                       text-gray-500 hover:border-[#48C4B0] hover:text-[#48C4B0] transition-colors text-lg leading-none"
          >+</button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:mx-4 sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '85vh' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#1B1B1B]">{t('adjust.title')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t('adjust.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full
                       bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors text-lg leading-none"
            aria-label="Close"
          >×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {gels.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">{t('adjust.gels')}</p>
              <div className="space-y-1">
                {gels.map(p => <ProductRow key={p.id} product={p} />)}
              </div>
            </div>
          )}
          {bars.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">{t('adjust.bars')}</p>
              <div className="space-y-1">
                {bars.map(p => <ProductRow key={p.id} product={p} />)}
              </div>
            </div>
          )}
        </div>

        {/* Nutrition match bar */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2.5">{t('nutrition.provided')}</p>
          <div className="space-y-2.5">
            {[
              { label: t('nutrition.carbsShort'), prov: provided.carbs_per_hour_provided, target: targets.carb_per_hour, unit: 'g/h' },
              { label: t('nutrition.sodiumShort'), prov: provided.sodium_per_hour_provided, target: targets.sodium_per_hour, unit: 'mg/h' },
            ].map(({ label, prov, target, unit }) => {
              const fillPct = target > 0 ? Math.min(130, Math.round((prov / target) * 100)) : 0
              const barColor = fillPct >= 90 && fillPct <= 110 ? '#48C4B0'
                : fillPct < 75  ? '#ef4444'
                : fillPct < 90  ? '#f59e0b'
                : '#3b82f6'
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-semibold text-[#1B1B1B]">{prov} / {target} {unit}</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(fillPct, 100)}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 space-y-2">
          {manualQty !== null && (
            <button
              type="button"
              onClick={() => setManualQty(null)}
              className="w-full min-h-[44px] border-2 border-gray-200 text-gray-500 rounded-xl
                         text-sm font-semibold hover:border-[#48C4B0] hover:text-[#48C4B0] transition-colors"
            >
              {t('adjust.reset')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[52px] bg-[#48C4B0] hover:bg-[#3db09d] text-white rounded-xl
                       text-sm font-bold transition-colors"
          >
            {t('adjust.done')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResultsPage({ targets, foundationTargets, selection, addonCoverage, resolvedAddonItems = [], form, onBack, region: regionProp, hideSave = false, isPublicView = false }) {
  const { t } = useTranslation(['results', 'common'])
  const [showResearch,   setShowResearch]   = useState(false)
  const [showCartEditor, setShowCartEditor] = useState(false)
  const [region,         setRegion]         = useState(regionProp ?? detectRegion)
  const [manualQty,      setManualQty]      = useState(null) // null = auto; obj = overrides
  const [chatSummary,    setChatSummary]    = useState(null)
  const [copyPlanState,  setCopyPlanState]  = useState('idle') // idle | copied
  const regionConfig = getRegionConfig(region)

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

  const aggregated   = useMemo(
    () => aggregateByProduct(leckaSelection, region, manualQty),
    [leckaSelection, region, manualQty]
  )
  const trainingInfo = useMemo(() => computeTrainingInfo(aggregated), [aggregated])
  const provided     = useMemo(
    () => computeProvidedNutrition(leckaSelection, manualQty, targets.total_duration_minutes),
    [leckaSelection, manualQty, targets.total_duration_minutes]
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

    return embedCartURL(buildCartURLFromAggregated(vpItems, 'NUTRIPLAN10', '', region))
  }, [region])

  // manualQty overrides must be reflected in anything sent off-device (email, saved
  // plan) — the raw selection prop still has the engine's original quantities.
  const effectiveSelection = useMemo(
    () => adjustTimelineSelection(leckaSelection, manualQty, targets.total_duration_minutes, allProductsCatalog),
    [leckaSelection, manualQty, targets]
  )

  const addonTimelineItems = useMemo(
    () => buildAddonTimelineItems(resolvedAddonItems, targets.total_duration_minutes),
    [resolvedAddonItems, targets.total_duration_minutes]
  )

  const timeline = useMemo(
    () => buildTimeline([...effectiveSelection, ...addonTimelineItems], targets.total_duration_minutes),
    [effectiveSelection, addonTimelineItems, targets.total_duration_minutes]
  )

  const gapSelection = useMemo(() =>
    aggregated.map(row => {
      const selItem = effectiveSelection.find(s => s.product.id === row.product.id)
      return { product: row.product, quantity: row.totalUnits, note: selItem?.note ?? '' }
    }),
    [aggregated, effectiveSelection]
  )

  const subtotal   = aggregated.reduce((sum, row) => sum + row.linePrice, 0)
  const totalPacks = aggregated.reduce(
    (sum, row) => sum + row.cartItems.reduce((s, item) => s + item.quantity, 0), 0
  )

  // Cart URL built from the already-optimised aggregated rows (may use variety pack)
  const cartURL = useMemo(
    () => embedCartURL(buildCartURLFromAggregated(aggregated, 'NUTRIPLAN10', '', region)),
    [aggregated, region]
  )

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

  return (
    <div className="bg-white">

      {/* ── Research modal ─────────────────────────────────────────────────── */}
      {showResearch && <ResearchModal onClose={() => setShowResearch(false)} />}

      {/* ── Cart editor modal ───────────────────────────────────────────────── */}
      {showCartEditor && (
        <CartEditorModal
          region={region}
          aggregated={aggregated}
          manualQty={manualQty}
          setManualQty={setManualQty}
          onClose={() => setShowCartEditor(false)}
          regionConfig={regionConfig}
          provided={provided}
          targets={targets}
        />
      )}

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      {isEmbedded ? (
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
          <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-[#48C4B0] font-medium hover:underline
                         min-h-[44px] flex items-center"
            >
              {t('common:nav.back')}
            </button>
            <img src="/logo.svg" alt="Lecka" className="h-6" />
            <LanguageSwitcher region={region} />
          </div>
        </div>
      ) : (
        <Nav backHref="/planner" backLabel="Back to planner" />
      )}

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            {t('results:hero.plan')}
          </p>
          <h1 className="text-2xl font-bold text-[#1B1B1B]">{heroTitle}</h1>
          <p className="text-sm text-gray-400 mt-1.5">
            {formatDuration(targets.total_duration_minutes)}
            {surfaceLabel ? ` · ${surfaceLabel}` : ''}
            {' · '}{effortLabel}
            {' · '}{conditionLabel}
            {targets.caffeine_ok ? ` · ${t('results:hero.caffeineTag')}` : ''}
          </p>
          {targets.elevation_gain_m > 0 && (
            <span className="inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full
                             bg-[#48C4B0]/10 text-[#48C4B0] text-xs font-semibold">
              {targets.elevation_gain_m} m gain
              {' · '}
              {targets.elevation_tier
                .split('_')
                .map((w, i) => i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)
                .join(' ')}
            </span>
          )}
          {form.race_date && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-gray-500">
                📅 {formatRaceDate(form.race_date)}
              </span>
              {daysUntilRace(form.race_date) > 0 && (
                <span className="text-xs font-semibold text-white bg-[#48C4B0]
                                 px-2.5 py-0.5 rounded-full">
                  {daysUntilRace(form.race_date)} days to go
                </span>
              )}
              {daysUntilRace(form.race_date) === 0 && (
                <span className="text-xs font-semibold text-white bg-[#F64866]
                                 px-2.5 py-0.5 rounded-full">
                  Race day! 🎉
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-[#48C4B0] font-medium mt-2 italic">
            {hasAddons
              ? 'Real food foundation + add-ons — your complete race plan.'
              : 'Lecka is your real food foundation. Everything else is optional.'}
          </p>
          {form.training_mode === true && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1
                            bg-amber-50 border border-amber-200 rounded-full">
              <span className="text-xs font-semibold text-amber-700">
                Training mode — carb targets reduced for gut adaptation
              </span>
            </div>
          )}
        </div>

        {/* ── Warnings ────────────────────────────────────────────────────── */}
        <WarningBox warnings={targets.warnings} />

        {/* ── Nutrition targets ───────────────────────────────────────────── */}
        <NutritionSummary targets={targets} provided={provided} foundationTargets={foundationTargets} addonCoverage={addonCoverage} />
        <button
          type="button"
          onClick={() => setShowResearch(true)}
          className="text-xs text-[#48C4B0] underline underline-offset-2 hover:text-[#3db09d]
                     transition-colors -mt-4 text-left"
        >
          {t('results:research.learnMore')}
        </button>

        {/* ── Act 1: What to take ──────────────────────────────────────────── */}
        <section>
          <SectionLabel>What to take</SectionLabel>
          {aggregated.length === 0 ? (
            <div className="border-l-4 border-[#48C4B0] bg-[#48C4B0]/5 rounded-r-lg p-4 text-sm text-[#1B1B1B] leading-snug">
              We couldn&apos;t find products available in your region for this plan.
              Try switching your region below, or contact us at{' '}
              <a href="mailto:info@getlecka.com" className="text-[#48C4B0] underline">
                info@getlecka.com
              </a>.
            </div>
          ) : (
            <>
              <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
                {gapSelection.map((item, i) => (
                  <div
                    key={item.product.id + i}
                    className={`flex items-center gap-4 px-5 py-3
                                ${i < gapSelection.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <ProductIcon product={item.product} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1B1B1B]">{item.product.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.note}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-[#1B1B1B]">×{item.quantity}</p>
                      <p className="text-xs text-gray-400">
                        {item.product.type === 'gel' || item.product.type === 'ultra_gel'
                          ? 'gels'
                          : item.product.type === 'bar'
                          ? 'bars'
                          : 'units'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {powderPlaceholder && (
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 bg-gray-50 flex items-center gap-3 mt-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-500">
                      🔜 Lecka Carb + Hydration Powder — coming soon
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <a
                        href="mailto:info@getlecka.com?subject=Powder waitlist"
                        className="text-[#48C4B0] underline"
                      >
                        Join the waitlist →
                      </a>
                    </p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowCartEditor(true)}
                className="text-xs text-[#48C4B0] font-semibold hover:underline mt-3 block"
              >
                {t('results:cta.adjustPlan')}
              </button>
            </>
          )}
        </section>

        {/* ── Act 1: Add-ons ───────────────────────────────────────────────── */}
        {hasAddons && (
          <section>
            <SectionLabel>Add-ons — your complete race fuel</SectionLabel>
            <p className="text-xs text-gray-400 mb-3">
              These products supplement your Lecka foundation. Buy them separately from your usual supplier.
            </p>
            <div className="border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden">
              {resolvedAddonItems.map((item, i) => (
                <div
                  key={item.product.id}
                  className={`flex items-center gap-4 px-5 py-3
                              ${i < resolvedAddonItems.length - 1
                                ? 'border-b border-dashed border-gray-200' : ''}`}
                >
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center
                                  justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-gray-400">
                      {item.product.brand?.slice(0,3).toUpperCase() ?? 'ADD'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1B1B1B]">
                      {item.product.display_name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.product.carbs_per_unit * item.quantity}g carbs total
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-[#1B1B1B]">×{item.quantity}</p>
                    <p className="text-xs text-gray-400 italic">buy separately</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Race timeline ─────────────────────────────────────────────────── */}
        <RaceTimeline events={timeline} totalDuration={targets.total_duration_minutes} />

        {/* ── Copy plan to clipboard ────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleCopyPlan}
          className="text-sm text-gray-500 border border-gray-200 rounded-xl px-4 py-2
                     hover:border-[#48C4B0] hover:text-[#48C4B0] transition-colors w-full"
        >
          {copyPlanState === 'copied' ? '✓ Copied!' : `📋 ${t('cta.copyPlan')}`}
        </button>

        {/* ── Email + save plan ─────────────────────────────────────────────── */}
        <PlanDeliveryCard targets={targets} selection={effectiveSelection} form={form} region={region} hideSave={hideSave} resolvedAddonItems={resolvedAddonItems} />

        {/* ── Visual break ──────────────────────────────────────────────────── */}
        <div className="my-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#48C4B0]/10 flex items-center
                              justify-center">
                <svg className="w-4 h-4 text-[#48C4B0]" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
              </div>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-[#1B1B1B]">Ready to stock up?</p>
            <p className="text-sm text-gray-400 mt-1">Here&apos;s how to get your Lecka products.</p>
          </div>
        </div>

        {/* ── Act 2: Region picker ──────────────────────────────────────────── */}
        {!isEmbedded && (
          <section>
            <SectionLabel>{t('results:section.shippingTo')}</SectionLabel>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(regionsConfig).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRegion(key)}
                  className={[
                    'px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors',
                    region === key
                      ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                      : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#48C4B0]',
                  ].join(' ')}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Act 2: Get your products ──────────────────────────────────────── */}
        <section>
          <SectionLabel>Get your products</SectionLabel>
          {aggregated.length === 0 ? (
            <div className="border-l-4 border-[#48C4B0] bg-[#48C4B0]/5 rounded-r-lg p-4 text-sm text-[#1B1B1B] leading-snug">
              We couldn&apos;t find products available in your region. Try switching region above.
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-5">
                {aggregated.map(row => (
                  <ProductCard
                    key={row.product.id}
                    {...row}
                    currencySymbol={regionConfig.currency_symbol}
                    decimals={regionConfig.decimals ?? 2}
                    cartUnits={row.cartUnits}
                    savedAmount={row.savedAmount ?? 0}
                    region={region}
                  />
                ))}
              </div>

              {region === 'vn' && (
                <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
                  {hasAddons && (
                    <p className="text-xs text-gray-400 text-center mb-3">
                      Cart includes Lecka products only — add-on products are sourced separately.
                    </p>
                  )}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500">
                      {t('results:cta.packs', { count: totalPacks })}
                    </span>
                    <span className="text-xl font-bold text-[#1B1B1B]">
                      {formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleChatClick(regionConfig.zalo_url)}
                      className="flex items-center justify-center w-full min-h-[52px]
                                 bg-[#0068FF] hover:bg-[#0057d9] text-white rounded-2xl
                                 text-base font-bold transition-colors"
                    >
                      {t('results:cta.chat.zalo')}
                    </button>
                    <button
                      onClick={() => handleChatClick(regionConfig.facebook_url)}
                      className="flex items-center justify-center w-full min-h-[52px]
                                 bg-[#1877F2] hover:bg-[#1060d0] text-white rounded-2xl
                                 text-base font-bold transition-colors"
                    >
                      {t('results:cta.chat.facebook')}
                    </button>
                    <p className="text-xs text-gray-400 text-center mt-1">
                      {t('results:cta.chat.hint')}
                    </p>
                    {chatSummary && (
                      <div className="mt-3 bg-gray-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">
                          {t('results:cta.chat.summaryLabel')}
                        </p>
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans select-all cursor-text leading-relaxed">
                          {chatSummary}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {region === 'us' && (
                <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
                  {hasAddons && (
                    <p className="text-xs text-gray-400 text-center mb-3">
                      Cart includes Lecka products only — add-on products are sourced separately.
                    </p>
                  )}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500">
                      {t('results:cta.packs', { count: totalPacks })}
                    </span>
                    <span className="text-xl font-bold text-[#1B1B1B]">
                      {formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}
                    </span>
                  </div>
                  <a
                    href={cartURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full min-h-[52px]
                               bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl
                               text-base font-bold transition-colors"
                  >
                    {t('results:cta.buyPlan')}
                  </a>
                  <p className="text-xs font-semibold text-[#48C4B0] text-center mt-2">
                    {t('results:cta.discount')}
                  </p>
                  <p className="text-xs text-gray-400 text-center mt-1">
                    {t('results:cta.shipping.us')}
                  </p>
                  {hasAddons && (
                    <p className="text-xs text-gray-400 text-center mt-1">
                      Cart includes Lecka products only. Purchase add-ons separately.
                    </p>
                  )}
                  {vpCartURL && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <a
                        href={vpCartURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-full min-h-[48px]
                                   border-2 border-[#48C4B0] text-[#48C4B0] rounded-2xl
                                   text-sm font-semibold hover:bg-[#48C4B0] hover:text-white transition-colors"
                      >
                        {t('results:cta.varietyPack')}
                      </a>
                      <p className="text-xs text-gray-400 text-center mt-1.5">
                        {t('results:cta.varietyPack.hint')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {STORE_LINKS[region] && (
                <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
                  <a
                    href={STORE_LINKS[region].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full min-h-[52px]
                               bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl
                               text-base font-bold transition-colors"
                  >
                    Shop Lecka — {STORE_LINKS[region].label}
                  </a>
                  <p className="text-xs text-gray-400 text-center mt-2">
                    Use the product list from your plan when ordering.
                  </p>
                </div>
              )}

              {!STORE_LINKS[region] && region !== 'vn' && region !== 'us' && (
                <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
                  <a
                    href="https://www.getlecka.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full min-h-[52px]
                               bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl
                               text-base font-bold transition-colors"
                  >
                    Shop Lecka
                  </a>
                  <p className="text-xs text-gray-400 text-center mt-2">
                    Visit getlecka.com to find your nearest store.
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Act 2: What you'll have left for training ─────────────────────── */}
        {trainingInfo.hasOverage && (
          <section className="border-2 border-[#48C4B0]/30 rounded-2xl p-5 bg-[#48C4B0]/5">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#48C4B0] mb-2">
              What you&apos;ll have left for training
            </p>
            <p className="text-sm text-[#1B1B1B] mb-4">
              {trainingInfo.gelOverage > 0 && (
                <>
                  <Trans
                    t={t}
                    i18nKey="results:training.gelOverage"
                    count={trainingInfo.gelRaceUnits}
                    values={{ race: trainingInfo.gelRaceUnits, cart: trainingInfo.gelCartUnits, extra: trainingInfo.gelOverage }}
                    components={{ bold: <strong /> }}
                  />
                  {trainingInfo.barOverage > 0 ? ' ' : ''}
                </>
              )}
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
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
              {t('results:training.prepTitle')}
            </p>
            <ul className="space-y-2">
              {[
                t('results:training.tip1'),
                t('results:training.tip2'),
                t('results:training.tip3'),
                t('results:training.tip4'),
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#1B1B1B]">
                  <span className="text-[#48C4B0] font-bold flex-shrink-0 mt-0.5">→</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Act 2: Add-ons reminder ───────────────────────────────────────── */}
        {hasAddons && (
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <p className="text-xs font-semibold uppercase tracking-widest
                          text-gray-400 mb-2">
              Don&apos;t forget your add-ons
            </p>
            <p className="text-sm text-gray-500 mb-3">
              These products are part of your plan but sold separately
              from Lecka. Pick them up from your usual sports nutrition supplier.
            </p>
            <div className="space-y-1">
              {resolvedAddonItems.map(item => (
                <p key={item.product.id} className="text-sm text-[#1B1B1B]">
                  ×{item.quantity} {item.product.display_name}
                  <span className="text-gray-400 ml-1">
                    — {item.product.carbs_per_unit * item.quantity}g carbs
                  </span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="pb-12 space-y-6 border-t border-gray-100 pt-8">

          <div className="text-center">
            {isPublicView ? (
              <a
                href="/planner"
                className="text-sm font-semibold text-[#48C4B0] hover:underline transition-colors"
              >
                Build your own plan →
              </a>
            ) : (
              <button
                type="button"
                onClick={onBack}
                className="text-sm text-gray-400 hover:text-[#48C4B0] transition-colors"
              >
                {t('common:nav.startOver')}
              </button>
            )}
          </div>

          <div className="text-center space-y-1">
            <p className="text-xs text-gray-400">
              Provided by{' '}
              <a
                href="https://www.getlecka.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#48C4B0] hover:underline"
              >
                www.getlecka.com
              </a>
            </p>
            <p className="text-xs text-gray-400">
              <a
                href="mailto:info@getlecka.com"
                className="text-[#48C4B0] hover:underline"
              >
                info@getlecka.com
              </a>
              {' '}·{' '}
              <a
                href="https://www.instagram.com/leckanutrition"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#48C4B0] hover:underline"
              >
                @leckanutrition
              </a>
            </p>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-400 mb-2">Find Lecka near you</p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              {[
                { label: 'US',          href: 'https://www.getlecka.com' },
                { label: 'Vietnam',     href: 'https://www.getlecka.vn' },
                { label: 'Germany',     href: 'https://www.getlecka.de' },
                { label: 'Denmark',     href: 'https://www.getlecka.dk' },
                { label: 'Switzerland', href: 'https://www.getlecka.ch' },
                { label: 'Singapore',   href: 'https://www.rdrc.sg/collections/lecka' },
                { label: 'Hong Kong',   href: 'https://foodisdom.is/collections/lecka' },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-[#48C4B0] transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
