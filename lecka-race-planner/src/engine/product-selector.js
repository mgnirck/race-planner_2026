/**
 * product-selector.js
 *
 * Selects products for a given set of nutrition targets, respecting user
 * product-flavour preferences and rotating variety on longer races.
 *
 * Export: selectProducts(targets, preferredProductIds?, region?, options?) → Array<{product, quantity, timing_minutes, note}>
 *
 * preferredProductIds (optional) — array of product IDs the athlete prefers.
 *   If omitted / empty, sensible defaults are used.
 *   For races with ≥ 5 gel slots the selector cycles through the chosen
 *   non-caffeine flavours so the athlete gets variety.
 *
 * region (optional) — filters products to those available in that region.
 *   Falls back to 'us' if not specified.
 *
 * options.fuelling_style — affects bar placement:
 *   'gels_only' | 'flexible' | undefined  → bars before + after only
 *   'gels_and_bars'                        → bars before + during (≥3h) + after
 *   'drink_mix_base'                       → bars before + after + powder placeholder
 */

import products      from '../config/products.json'
import formulaConfig from '../config/formula-config.json'
import { isAvailableInRegion } from './region-utils.js'

export function selectProducts(targets, preferredProductIds = [], region = 'us', options = {}) {
  const { total_duration_minutes, caffeine_ok, total_carbs } = targets
  const { timing_rules: timingRules, caffeine_rules: caffeineRules } = formulaConfig

  // ── Filter the full catalogue to products available in this region ────────
  // Exclude variety packs — they are used at the cart-optimisation layer, not here.

  const availableProducts = products.filter(p =>
    isAvailableInRegion(p, region) && p.type !== 'variety_pack'
  )

  // ── Resolve product pools ─────────────────────────────────────────────────
  // Start from explicit user picks; fall back to curated defaults per type when
  // the user made no selection (or their picks are all unavailable in this region).
  // Gel defaults: passion-fruit + coffee-cacao (caffeine OK) else passion-fruit +
  // banana. Bar default: mango-coconut. Each default is checked through
  // isAvailableInRegion(); if it is absent the first available product of that
  // type in the catalogue is used as last resort. Gels and bars fall back
  // independently — explicit picks for one type are never discarded.

  const preferred     = availableProducts.filter(p => preferredProductIds.includes(p.id))
  const preferredGels = preferred.filter(p => p.type === 'gel')
  const preferredBars = preferred.filter(p => p.type === 'bar')

  const selectedGels = preferredGels.length > 0
    ? preferredGels
    : resolveDefaultGels(availableProducts, caffeine_ok)

  const bars = preferredBars.length > 0
    ? preferredBars
    : resolveDefaultBars(availableProducts)

  // For plain slots: prefer non-caffeine gels; fall back to any selected gel
  // (handles the case where user picked only caffeine gels).
  const plainGelPool = selectedGels.filter(p => !p.caffeine)
  const plainGels    = plainGelPool.length > 0 ? plainGelPool : selectedGels

  const cafGels = selectedGels.filter(p => p.caffeine)

  // ── Build gel timing slots (target-driven) ───────────────────────────────
  // Quantity is derived from total_carbs ÷ avg carbs per selected gel, then
  // slots are spread evenly across the race with a minimum spacing floor.

  const gelSlots = buildGelSlots(total_carbs, selectedGels, total_duration_minutes, timingRules)

  // Use flavour variety when the race is long enough to warrant it
  const useVariety = gelSlots.length >= 5

  // ── Assign caffeine vs plain to each slot ────────────────────────────────
  //
  // First caffeine dose targets the second half of the race when glycogen
  // depletion and mental fatigue set in.  The threshold is the larger of the
  // absolute minimum floor (first_dose_offset_min, default 45 min) and a
  // fraction of the total race duration (first_dose_race_fraction, default 0.4).
  //
  // Expected first-eligible caffeine slot by race duration:
  //   60 min  → max(45,  24) = 45 min  (floor dominates short races)
  //  120 min  → max(45,  48) = 48 min
  //  240 min  → max(45,  96) = 96 min  (1 h 36)
  //  360 min  → max(45, 144) = 144 min (2 h 24)

  const firstCaffeineMin = Math.max(
    caffeineRules.first_dose_offset_min,
    total_duration_minutes * (caffeineRules.first_dose_race_fraction ?? 0.4),
  )

  const plainGelSlots = []
  const cafGelSlots   = []
  let lastCaffeineDoseAt = -Infinity

  for (const slot of gelSlots) {
    const minutesSinceLast = slot - lastCaffeineDoseAt
    const isCaffeineEligible =
      caffeine_ok &&
      slot >= firstCaffeineMin &&
      minutesSinceLast >= 60

    if (isCaffeineEligible) {
      cafGelSlots.push(slot)
      lastCaffeineDoseAt = slot
    } else {
      plainGelSlots.push(slot)
    }
  }

  const selected = []

  // ── Plain gels — with optional variety rotation ───────────────────────────

  if (plainGelSlots.length > 0 && plainGels.length > 0) {
    if (useVariety && plainGels.length > 1) {
      // Cycle flavours across slots, then group by product
      const byProduct = {}
      plainGelSlots.forEach((slot, i) => {
        const p = plainGels[i % plainGels.length]
        if (!byProduct[p.id]) byProduct[p.id] = { product: p, slots: [] }
        byProduct[p.id].slots.push(slot)
      })
      for (const { product, slots } of Object.values(byProduct)) {
        selected.push({
          product,
          quantity:       slots.length,
          timing_minutes: slots,
          note:           timingRules.during.note,
        })
      }
    } else {
      selected.push({
        product:        plainGels[0],
        quantity:       plainGelSlots.length,
        timing_minutes: plainGelSlots,
        note:           timingRules.during.note,
      })
    }
  }

  // ── Caffeine gels ─────────────────────────────────────────────────────────

  if (cafGelSlots.length > 0 && cafGels.length > 0) {
    if (cafGels.length > 1) {
      const byProduct = {}
      cafGelSlots.forEach((slot, i) => {
        const p = cafGels[i % cafGels.length]
        if (!byProduct[p.id]) byProduct[p.id] = { product: p, slots: [] }
        byProduct[p.id].slots.push(slot)
      })
      for (const { product, slots } of Object.values(byProduct)) {
        selected.push({
          product,
          quantity:       slots.length,
          timing_minutes: slots,
          note:           `${timingRules.during.note} — caffeine boost`,
        })
      }
    } else {
      selected.push({
        product:        cafGels[0],
        quantity:       cafGelSlots.length,
        timing_minutes: cafGelSlots,
        note: `${timingRules.during.note} — caffeine boost at ${cafGelSlots.map(m => formatMin(m)).join(', ')}`,
      })
    }
  }

  // ── Bars: placement depends on fuelling_style ────────────────────────────

  const fuelling_style = options.fuelling_style

  if (bars.length > 0) {
    // Rotate through bar flavours across all positions
    let barIndex = 0
    const nextBar = () => {
      const b = bars[barIndex % bars.length]
      barIndex++
      return b
    }

    if (fuelling_style === 'gels_and_bars') {
      // Before
      if (total_duration_minutes >= 60) {
        selected.push({
          product:        nextBar(),
          quantity:       1,
          timing_minutes: [-30],
          note:           timingRules.before.note,
        })
      }
      // During — one bar at ~40% for races ≥ 3h, a second at ~65% for races ≥ 6h
      if (total_duration_minutes >= 180) {
        selected.push({
          product:        nextBar(),
          quantity:       1,
          timing_minutes: [Math.round(total_duration_minutes * 0.4)],
          note:           timingRules.during.note,
        })
      }
      if (total_duration_minutes >= 360) {
        selected.push({
          product:        nextBar(),
          quantity:       1,
          timing_minutes: [Math.round(total_duration_minutes * 0.65)],
          note:           timingRules.during.note,
        })
      }
      // After
      selected.push({
        product:        nextBar(),
        quantity:       1,
        timing_minutes: [total_duration_minutes + 15],
        note:           timingRules.after.note,
      })
    } else {
      // Default: gels_only, flexible, drink_mix_base, or undefined — bars before + after only
      if (total_duration_minutes >= 60) {
        selected.push({
          product:        nextBar(),
          quantity:       1,
          timing_minutes: [-30],
          note:           timingRules.before.note,
        })
      }
      selected.push({
        product:        nextBar(),
        quantity:       1,
        timing_minutes: [total_duration_minutes + 15],
        note:           timingRules.after.note,
      })
    }
  }

  // ── Drink mix placeholder (drink_mix_base only) ───────────────────────────

  if (fuelling_style === 'drink_mix_base') {
    selected.push({
      product: {
        id:   'lecka-powder-coming-soon',
        name: 'Lecka Carb + Hydration Powder (coming soon)',
        type: 'powder_placeholder',
      },
      quantity:       0,
      timing_minutes: [],
      note:           'Join the waitlist — launching soon',
    })
  }

  return selected
}

// ── Default-selection helpers ─────────────────────────────────────────────────

const GEL_DEFAULTS_CAFFEINE    = ['gel-passion-fruit', 'gel-coffee-cacao']
const GEL_DEFAULTS_NO_CAFFEINE = ['gel-passion-fruit', 'gel-banana']
const BAR_DEFAULT_ID           = 'bar-mango-coconut'

function resolveDefaultGels(availableProducts, caffeine_ok) {
  const ids = caffeine_ok ? GEL_DEFAULTS_CAFFEINE : GEL_DEFAULTS_NO_CAFFEINE
  const defaults = ids.map(id => availableProducts.find(p => p.id === id)).filter(Boolean)
  if (defaults.length > 0) return defaults
  const fallback = availableProducts.find(p => p.type === 'gel')
  return fallback ? [fallback] : []
}

function resolveDefaultBars(availableProducts) {
  const bar = availableProducts.find(p => p.id === BAR_DEFAULT_ID)
  if (bar) return [bar]
  const fallback = availableProducts.find(p => p.type === 'bar')
  return fallback ? [fallback] : []
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Builds an array of gel timing slots whose combined carbs meet total_carbs.
 *
 * Quantity = ceil(total_carbs / avg_carbs_per_selected_gel).
 * Slots are spread evenly from first_intake_min to (total_duration_minutes - 1),
 * capped so no two consecutive slots are closer than min_interval_min apart.
 */
function buildGelSlots(totalCarbs, selectedGels, totalDurationMinutes, timingRules) {
  const firstIntake = timingRules.during.first_intake_min
  const minInterval = timingRules.during.min_interval_min

  if (selectedGels.length === 0 || totalCarbs <= 0 || firstIntake >= totalDurationMinutes) {
    return []
  }

  // Average carbs per slot — gels are rotated round-robin so this is correct.
  const avgCarbsPerSlot = selectedGels.reduce((sum, g) => sum + g.carbs_per_unit, 0) / selectedGels.length

  const slotsNeeded = Math.ceil(totalCarbs / avgCarbsPerSlot)

  // How many slots physically fit at min spacing within the race window.
  const maxSlots = Math.floor((totalDurationMinutes - 1 - firstIntake) / minInterval) + 1

  const n = Math.max(1, Math.min(slotsNeeded, maxSlots))

  if (n === 1) return [firstIntake]

  const lastSlot = totalDurationMinutes - 1
  return Array.from({ length: n }, (_, i) =>
    Math.round(firstIntake + (i * (lastSlot - firstIntake)) / (n - 1))
  )
}

function formatMin(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}
