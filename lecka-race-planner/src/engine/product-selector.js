/**
 * product-selector.js
 *
 * Selects products for a given set of nutrition targets, respecting user
 * product-flavour preferences and rotating variety on longer races.
 *
 * Export: selectProducts(targets, preferredProductIds?, region?) → Array<{product, quantity, timing_minutes, note}>
 *
 * preferredProductIds (optional) — array of product IDs the athlete prefers.
 *   If omitted / empty, sensible defaults are used.
 *   For races with ≥ 5 gel slots the selector cycles through the chosen
 *   non-caffeine flavours so the athlete gets variety.
 *
 * region (optional) — filters products to those available in that region.
 *   Falls back to 'us' if not specified.
 */

import products      from '../config/products.json'
import formulaConfig from '../config/formula-config.json'
import { isAvailableInRegion } from './region-utils.js'

export function selectProducts(targets, preferredProductIds = [], region = 'us') {
  const { total_duration_minutes, caffeine_ok, total_carbs } = targets
  const { timing_rules: timingRules, caffeine_rules: caffeineRules } = formulaConfig

  // ── Filter the full catalogue to products available in this region ────────
  // Exclude variety packs — they are used at the cart-optimisation layer, not here.

  const availableProducts = products.filter(p =>
    isAvailableInRegion(p, region) && p.type !== 'variety_pack'
  )

  // ── Resolve product pools ─────────────────────────────────────────────────
  // Only products the user explicitly selected in step 3 are used.
  // No defaults — if user selected no bars, no bars are added.

  const preferred    = availableProducts.filter(p => preferredProductIds.includes(p.id))
  const selectedGels = preferred.filter(p => p.type === 'gel')

  // For plain slots: prefer non-caffeine gels; fall back to any selected gel
  // (handles the case where user picked only caffeine gels).
  const plainGelPool = preferred.filter(p => p.type === 'gel' && !p.caffeine)
  const plainGels    = plainGelPool.length > 0 ? plainGelPool : selectedGels

  const cafGels = preferred.filter(p => p.type === 'gel' && p.caffeine)
  const bars    = preferred.filter(p => p.type === 'bar')

  // ── Build gel timing slots (target-driven) ───────────────────────────────
  // Quantity is derived from total_carbs ÷ avg carbs per selected gel, then
  // slots are spread evenly across the race with a minimum spacing floor.

  const gelSlots = buildGelSlots(total_carbs, selectedGels, total_duration_minutes, timingRules)

  // Use flavour variety when the race is long enough to warrant it
  const useVariety = gelSlots.length >= 5

  // ── Assign caffeine vs plain to each slot ────────────────────────────────

  const plainGelSlots = []
  const cafGelSlots   = []
  let lastCaffeineDoseAt = -Infinity

  for (const slot of gelSlots) {
    const minutesSinceLast = slot - lastCaffeineDoseAt
    const isCaffeineEligible =
      caffeine_ok &&
      slot >= caffeineRules.first_dose_offset_min &&
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

  // ── Bars: use different flavour before vs after if two options available ──

  if (bars.length > 0) {
    const barBefore = bars[0]
    const barAfter  = bars.length > 1 ? bars[1] : bars[0]

    if (total_duration_minutes >= 60) {
      selected.push({
        product:        barBefore,
        quantity:       1,
        timing_minutes: [-30],
        note:           timingRules.before.note,
      })
    }

    selected.push({
      product:        barAfter,
      quantity:       1,
      timing_minutes: [total_duration_minutes + 15],
      note:           timingRules.after.note,
    })
  }

  return selected
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
