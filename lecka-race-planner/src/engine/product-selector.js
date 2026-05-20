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
 *
 * Ultra Gel logic:
 *   Ultra gels (type 'ultra_gel') are 65g carbs / 102g per unit. They are gated
 *   to qualifying long races and timed at 50-min intervals (not 30 min). When the
 *   user selects both ultra gels and regular gels, ultra gels anchor the plan
 *   (~70% of carbs) and regular gels fill the gaps between them.
 */

import staticProducts from '../config/products.json'
import formulaConfig   from '../config/formula-config.json'
import { isAvailableInRegion } from './region-utils.js'

// Races where ultra gels are appropriate in the default plan
const QUALIFYING_RACES_FOR_ULTRA = new Set(['ultra_50k', 'ultra_100k', 'triathlon_140_6'])
const MARATHON_ULTRA_MIN_MINUTES = 240  // marathons with goal time > 4h

export function selectProducts(targets, preferredProductIds = [], region = 'us', options = {}, allProducts = null) {
  const products = allProducts ?? staticProducts
  const { total_duration_minutes, caffeine_ok, total_carbs, race_type } = targets
  const { timing_rules: timingRules, caffeine_rules: caffeineRules } = formulaConfig
  const ultraGelRules = timingRules.ultra_gel

  // ── Filter the full catalogue to products available in this region ────────
  const availableProducts = products.filter(p =>
    isAvailableInRegion(p, region) && p.type !== 'variety_pack'
  )

  // ── Qualify race for ultra gel defaults ───────────────────────────────────
  const isUltraGelRace = QUALIFYING_RACES_FOR_ULTRA.has(race_type) ||
    (race_type === 'marathon' && total_duration_minutes >= MARATHON_ULTRA_MIN_MINUTES)

  // ── Resolve product pools ─────────────────────────────────────────────────
  const preferred     = availableProducts.filter(p => preferredProductIds.includes(p.id))
  const preferredGels = preferred.filter(p => p.type === 'gel' || p.type === 'ultra_gel')
  const preferredBars = preferred.filter(p => p.type === 'bar')

  const selectedGels = preferredGels.length > 0
    ? preferredGels
    : resolveDefaultGels(availableProducts, caffeine_ok, isUltraGelRace)

  const bars = preferredBars.length > 0
    ? preferredBars
    : resolveDefaultBars(availableProducts)

  // ── Split gels by type ────────────────────────────────────────────────────
  const ultraGels   = selectedGels.filter(g => g.type === 'ultra_gel')
  const regularGels = selectedGels.filter(g => g.type === 'gel')

  const selected = []

  // ── Build gel items based on what types are present ───────────────────────
  if (ultraGels.length === 0) {
    // Regular gels only — existing logic unchanged
    buildRegularGelSection(
      selected, total_carbs, regularGels, total_duration_minutes,
      timingRules, caffeineRules, caffeine_ok
    )
  } else if (regularGels.length === 0) {
    // Ultra gels only
    buildUltraGelSection(
      selected, total_carbs, ultraGels, total_duration_minutes, ultraGelRules
    )
  } else {
    // Mixed: ultra gels anchor the plan, regular gels fill the gaps
    buildMixedGelSection(
      selected, total_carbs, ultraGels, regularGels, total_duration_minutes,
      timingRules, caffeineRules, ultraGelRules, caffeine_ok
    )
  }

  // ── Bars: placement depends on fuelling_style ────────────────────────────
  const fuelling_style = options.fuelling_style

  if (bars.length > 0) {
    let barIndex = 0
    const nextBar = () => {
      const b = bars[barIndex % bars.length]
      barIndex++
      return b
    }

    if (fuelling_style === 'gels_and_bars') {
      if (total_duration_minutes >= 60) {
        selected.push({
          product:        nextBar(),
          quantity:       1,
          timing_minutes: [-30],
          note:           timingRules.before.note,
        })
      }
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
      selected.push({
        product:        nextBar(),
        quantity:       1,
        timing_minutes: [total_duration_minutes + 15],
        note:           timingRules.after.note,
      })
    } else {
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

  // ── Drink mix placeholder ─────────────────────────────────────────────────
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

  // ── High-fat timing constraint ────────────────────────────────────────────
  const earlyThreshold = Math.round(total_duration_minutes * 0.75)
  for (const item of selected) {
    if (!item.product.high_fat) continue
    const filtered = item.timing_minutes.filter(m => m >= 0 && m <= earlyThreshold)
    if (filtered.length < item.timing_minutes.length) {
      item.timing_minutes = filtered
      item.quantity = filtered.length
      item.note = 'Best in the first half — peanut butter slows absorption'
    }
  }

  return selected.filter(item =>
    item.product.type === 'powder_placeholder' || item.quantity > 0
  )
}

// ── Gel section builders ──────────────────────────────────────────────────────

function buildRegularGelSection(selected, totalCarbs, regularGels, totalDurationMinutes, timingRules, caffeineRules, caffeine_ok) {
  const gelSlots  = buildGelSlots(totalCarbs, regularGels, totalDurationMinutes, timingRules)
  const duringNote = `First intake at ~${getFirstIntakeMin(totalDurationMinutes)} min, then every 30 min`
  const useVariety = gelSlots.length >= 5

  const plainGelPool = regularGels.filter(p => !p.caffeine)
  const plainGels    = plainGelPool.length > 0 ? plainGelPool : regularGels
  const cafGels      = regularGels.filter(p => p.caffeine)

  const { plainSlots, cafSlots } = assignCaffeineSlots(
    gelSlots, caffeine_ok, totalDurationMinutes, caffeineRules
  )

  addPlainGelItems(selected, plainGels, plainSlots, duringNote, useVariety)
  addCafGelItems(selected, cafGels, cafSlots, duringNote)
}

function buildUltraGelSection(selected, totalCarbs, ultraGels, totalDurationMinutes, ultraGelRules) {
  const firstIntake = getFirstIntakeMin(totalDurationMinutes)
  const ultraSlots  = buildUltraGelSlots(totalCarbs, ultraGels, totalDurationMinutes, ultraGelRules)
  if (!ultraSlots.length) return

  const note = `${ultraGelRules.note} — first at ~${firstIntake} min, then every ${ultraGelRules.interval_min} min`

  if (ultraGels.length > 1) {
    const byProduct = {}
    ultraSlots.forEach((slot, i) => {
      const p = ultraGels[i % ultraGels.length]
      if (!byProduct[p.id]) byProduct[p.id] = { product: p, slots: [] }
      byProduct[p.id].slots.push(slot)
    })
    for (const { product, slots } of Object.values(byProduct)) {
      selected.push({ product, quantity: slots.length, timing_minutes: slots, note })
    }
  } else {
    selected.push({ product: ultraGels[0], quantity: ultraSlots.length, timing_minutes: ultraSlots, note })
  }
}

function buildMixedGelSection(selected, totalCarbs, ultraGels, regularGels, totalDurationMinutes, timingRules, caffeineRules, ultraGelRules, caffeine_ok) {
  const { ultraSlots, regSlots } = buildMixedGelSlots(
    totalCarbs, ultraGels, regularGels, totalDurationMinutes, timingRules, ultraGelRules
  )

  // Ultra gel items
  if (ultraSlots.length > 0) {
    const firstIntake = getFirstIntakeMin(totalDurationMinutes)
    const ultraNote = `${ultraGelRules.note} — first at ~${firstIntake} min, then every ${ultraGelRules.interval_min} min`
    selected.push({ product: ultraGels[0], quantity: ultraSlots.length, timing_minutes: ultraSlots, note: ultraNote })
  }

  // Regular gel items (with caffeine logic)
  if (regSlots.length > 0) {
    const regNote = `First at ~${regSlots[0]} min, then every 30 min`
    const plainGelPool = regularGels.filter(p => !p.caffeine)
    const plainGels    = plainGelPool.length > 0 ? plainGelPool : regularGels
    const cafGels      = regularGels.filter(p => p.caffeine)

    const { plainSlots, cafSlots } = assignCaffeineSlots(
      regSlots, caffeine_ok, totalDurationMinutes, caffeineRules
    )

    addPlainGelItems(selected, plainGels, plainSlots, regNote, regSlots.length >= 5)
    addCafGelItems(selected, cafGels, cafSlots, regNote)
  }
}

// ── Gel item helpers ──────────────────────────────────────────────────────────

function addPlainGelItems(selected, plainGels, plainSlots, duringNote, useVariety) {
  if (!plainSlots.length || !plainGels.length) return

  if (useVariety && plainGels.length > 1) {
    const byProduct = {}
    plainSlots.forEach((slot, i) => {
      const p = plainGels[i % plainGels.length]
      if (!byProduct[p.id]) byProduct[p.id] = { product: p, slots: [] }
      byProduct[p.id].slots.push(slot)
    })
    for (const { product, slots } of Object.values(byProduct)) {
      selected.push({ product, quantity: slots.length, timing_minutes: slots, note: duringNote })
    }
  } else {
    selected.push({ product: plainGels[0], quantity: plainSlots.length, timing_minutes: plainSlots, note: duringNote })
  }
}

function addCafGelItems(selected, cafGels, cafSlots, duringNote) {
  if (!cafSlots.length || !cafGels.length) return

  if (cafGels.length > 1) {
    const byProduct = {}
    cafSlots.forEach((slot, i) => {
      const p = cafGels[i % cafGels.length]
      if (!byProduct[p.id]) byProduct[p.id] = { product: p, slots: [] }
      byProduct[p.id].slots.push(slot)
    })
    for (const { product, slots } of Object.values(byProduct)) {
      selected.push({ product, quantity: slots.length, timing_minutes: slots, note: `${duringNote} — caffeine boost` })
    }
  } else {
    selected.push({
      product:        cafGels[0],
      quantity:       cafSlots.length,
      timing_minutes: cafSlots,
      note:           `${duringNote} — caffeine boost at ${cafSlots.map(m => formatMin(m)).join(', ')}`,
    })
  }
}

// ── Caffeine slot assignment ───────────────────────────────────────────────────

function assignCaffeineSlots(gelSlots, caffeine_ok, totalDurationMinutes, caffeineRules) {
  const firstCaffeineMin = Math.max(
    caffeineRules.first_dose_offset_min,
    totalDurationMinutes * (caffeineRules.first_dose_race_fraction ?? 0.4),
  )

  const plainSlots = []
  const cafSlots   = []
  let lastCaffeineDoseAt = -Infinity

  for (const slot of gelSlots) {
    const minutesSinceLast = slot - lastCaffeineDoseAt
    const isCaffeineEligible =
      caffeine_ok &&
      slot >= firstCaffeineMin &&
      minutesSinceLast >= 60 &&
      (totalDurationMinutes - slot) >= 30

    if (isCaffeineEligible) {
      cafSlots.push(slot)
      lastCaffeineDoseAt = slot
    } else {
      plainSlots.push(slot)
    }
  }

  return { plainSlots, cafSlots }
}

// ── Default-selection helpers ─────────────────────────────────────────────────

const GEL_DEFAULTS_CAFFEINE    = ['gel-passion-fruit', 'gel-coffee-cacao']
const GEL_DEFAULTS_NO_CAFFEINE = ['gel-passion-fruit', 'gel-banana']
const BAR_DEFAULT_ID           = 'bar-mango-coconut'
const ULTRA_GEL_DEFAULT_ID     = 'ultra-gel-passion-fruit-mango'

function resolveDefaultGels(availableProducts, caffeine_ok, isUltraGelRace) {
  if (isUltraGelRace) {
    const ultraGel = availableProducts.find(p => p.id === ULTRA_GEL_DEFAULT_ID)
    if (ultraGel) return [ultraGel]
  }

  const ids = caffeine_ok ? GEL_DEFAULTS_CAFFEINE : GEL_DEFAULTS_NO_CAFFEINE
  const defaults = ids.map(id => availableProducts.find(p => p.id === id)).filter(Boolean)
  if (defaults.length > 0) return defaults
  const fallback = availableProducts.find(p => p.type === 'gel' || p.type === 'ultra_gel')
  return fallback ? [fallback] : []
}

function resolveDefaultBars(availableProducts) {
  const bar = availableProducts.find(p => p.id === BAR_DEFAULT_ID)
  if (bar) return [bar]
  const fallback = availableProducts.find(p => p.type === 'bar')
  return fallback ? [fallback] : []
}

// ── Slot-building helpers ─────────────────────────────────────────────────────

function getFirstIntakeMin(totalDurationMinutes) {
  if (totalDurationMinutes < 60)  return 15
  if (totalDurationMinutes < 120) return 30
  if (totalDurationMinutes < 240) return 25
  return 20
}

/**
 * Builds ultra gel slots at ultraGelRules.interval_min spacing.
 * Count = ceil(totalCarbs / avgCarbsPerUltraGel), capped by race window.
 */
function buildUltraGelSlots(totalCarbs, ultraGels, totalDurationMinutes, ultraGelRules) {
  const firstIntake = getFirstIntakeMin(totalDurationMinutes)
  const interval    = ultraGelRules.interval_min

  if (ultraGels.length === 0 || totalCarbs <= 0 || firstIntake >= totalDurationMinutes) return []

  const avgCarbs    = ultraGels.reduce((s, g) => s + g.carbs_per_unit, 0) / ultraGels.length
  const slotsNeeded = Math.ceil(totalCarbs / avgCarbs)
  const maxSlots    = Math.floor((totalDurationMinutes - 1 - firstIntake) / interval) + 1
  const n           = Math.max(1, Math.min(slotsNeeded, maxSlots))

  if (n === 1) return [firstIntake]
  const lastSlot = totalDurationMinutes - 1
  return Array.from({ length: n }, (_, i) =>
    Math.round(firstIntake + (i * (lastSlot - firstIntake)) / (n - 1))
  )
}

/**
 * Builds an array of regular gel timing slots.
 * Quantity = ceil(totalCarbs / avg carbs per gel).
 * Slots spread evenly from first_intake to race end at min_interval spacing.
 */
function buildGelSlots(totalCarbs, selectedGels, totalDurationMinutes, timingRules) {
  const firstIntake = getFirstIntakeMin(totalDurationMinutes)
  const minInterval = timingRules.during.min_interval_min

  if (selectedGels.length === 0 || totalCarbs <= 0 || firstIntake >= totalDurationMinutes) return []

  const avgCarbsPerSlot = selectedGels.reduce((sum, g) => sum + g.carbs_per_unit, 0) / selectedGels.length
  const slotsNeeded     = Math.ceil(totalCarbs / avgCarbsPerSlot)
  const maxSlots        = Math.floor((totalDurationMinutes - 1 - firstIntake) / minInterval) + 1
  const n               = Math.max(1, Math.min(slotsNeeded, maxSlots))

  if (n === 1) return [firstIntake]
  const lastSlot = totalDurationMinutes - 1
  return Array.from({ length: n }, (_, i) =>
    Math.round(firstIntake + (i * (lastSlot - firstIntake)) / (n - 1))
  )
}

/**
 * Builds interleaved slots for a mixed ultra gel + regular gel plan.
 *
 * Strategy: ultra gels anchor ~70% of carb target at 50-min intervals;
 * regular gels fill the remainder by slotting into the midpoints between
 * consecutive ultra gel slots, then continuing after the last ultra gel.
 *
 * Returns { ultraSlots, regSlots } — both as arrays of minute values.
 */
function buildMixedGelSlots(totalCarbs, ultraGels, regularGels, totalDurationMinutes, timingRules, ultraGelRules) {
  const firstIntake   = getFirstIntakeMin(totalDurationMinutes)
  const ultraInterval = ultraGelRules.interval_min          // 50 min
  const minGap        = timingRules.during.min_interval_min // 20 min
  const regInterval   = timingRules.during.interval_min     // 30 min

  const avgUltraCarbs = ultraGels.reduce((s, g) => s + g.carbs_per_unit, 0) / ultraGels.length
  const avgRegCarbs   = regularGels.reduce((s, g) => s + g.carbs_per_unit, 0) / regularGels.length

  // Ultra gels cover ~70% of total carbs
  const ultraTarget   = totalCarbs * 0.70
  const maxUltraSlots = Math.floor((totalDurationMinutes - 1 - firstIntake) / ultraInterval) + 1
  const ultraCount    = Math.max(1, Math.min(Math.ceil(ultraTarget / avgUltraCarbs), maxUltraSlots))

  const ultraSlots = Array.from({ length: ultraCount }, (_, i) =>
    Math.round(firstIntake + i * ultraInterval)
  ).filter(t => t < totalDurationMinutes)

  // Remaining carbs go to regular gels
  const ultraCarbs      = ultraSlots.length * avgUltraCarbs
  let remainingCarbs    = Math.max(0, totalCarbs - ultraCarbs)
  const regSlots        = []

  // First: fill midpoints between consecutive ultra slots
  for (let i = 0; i < ultraSlots.length - 1 && remainingCarbs > 0; i++) {
    const mid = Math.round((ultraSlots[i] + ultraSlots[i + 1]) / 2)
    if (mid - ultraSlots[i] >= minGap && ultraSlots[i + 1] - mid >= minGap) {
      regSlots.push(mid)
      remainingCarbs -= avgRegCarbs
    }
  }

  // Then: continue after the last ultra slot at regInterval spacing
  if (remainingCarbs > 0) {
    const lastUltra = ultraSlots.length > 0 ? ultraSlots[ultraSlots.length - 1] : firstIntake - regInterval
    let regT = lastUltra + regInterval
    while (regT < totalDurationMinutes && remainingCarbs > 0) {
      regSlots.push(regT)
      remainingCarbs -= avgRegCarbs
      regT += regInterval
    }
  }

  return { ultraSlots, regSlots }
}

function formatMin(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}
