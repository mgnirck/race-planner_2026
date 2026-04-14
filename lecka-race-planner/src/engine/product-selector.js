/**
 * product-selector.js
 *
 * Reads products.json and formula-config.json, selects the right products
 * for a given set of nutrition targets, and schedules each intake.
 *
 * Export: selectProducts(targets) → Array<{product, quantity, timing_minutes, note}>
 *
 * Inputs
 * ------
 * targets — object returned by calculateTargets()
 *
 * Returns
 * -------
 * Ordered array of intake recommendations:
 *   product       : full product object from products.json
 *   quantity      : number of individual units
 *   timing_minutes: number[] — minutes relative to race start (negative = before)
 *   note          : string   — human-readable instruction
 */

import products from '../config/products.json'
import formulaConfig from '../config/formula-config.json'

export function selectProducts(targets) {
  const { total_duration_minutes, caffeine_ok } = targets
  const { timing_rules: timingRules, caffeine_rules: caffeineRules } = formulaConfig

  const selected = []

  // ── Gel slots (during) ────────────────────────────────────────────────────
  // Build the full list of during-intake time points
  const gelSlots = []
  let t = timingRules.during.first_intake_min        // first gel at 20 min
  while (t < total_duration_minutes) {
    gelSlots.push(t)
    t += timingRules.during.interval_min              // every 30 min after that
  }

  // Assign caffeine vs plain gel for each slot
  const gelPlan = []
  let lastCaffeineDoseAt = -Infinity

  for (const slot of gelSlots) {
    const minutesSinceLast = slot - lastCaffeineDoseAt
    const isCaffeineEligible =
      caffeine_ok &&
      slot >= caffeineRules.first_dose_offset_min &&   // not before 45 min
      minutesSinceLast >= 60                            // max one caffeine dose per hour

    if (isCaffeineEligible) {
      gelPlan.push({ slot, caffeinated: true })
      lastCaffeineDoseAt = slot
    } else {
      gelPlan.push({ slot, caffeinated: false })
    }
  }

  const plainGelSlots = gelPlan.filter(g => !g.caffeinated).map(g => g.slot)
  const cafGelSlots   = gelPlan.filter(g =>  g.caffeinated).map(g => g.slot)

  const plainGel = products.find(p => p.id === 'gel-passion-fruit')
  const cafGel   = products.find(p => p.id === 'gel-coffee-cacao')
  const bar      = products.find(p => p.id === 'bar-mango-coconut')

  if (plainGelSlots.length > 0) {
    selected.push({
      product: plainGel,
      quantity: plainGelSlots.length,
      timing_minutes: plainGelSlots,
      note: timingRules.during.note,
    })
  }

  if (cafGelSlots.length > 0) {
    selected.push({
      product: cafGel,
      quantity: cafGelSlots.length,
      timing_minutes: cafGelSlots,
      note: `${timingRules.during.note} — caffeine boost at ${cafGelSlots.map(m => formatMin(m)).join(', ')}`,
    })
  }

  // ── Bar before ────────────────────────────────────────────────────────────
  // Only recommend a pre-race bar for races 60 min or longer
  if (total_duration_minutes >= 60) {
    selected.push({
      product: bar,
      quantity: 1,
      timing_minutes: [-30],                  // 30 min before gun
      note: timingRules.before.note,
    })
  }

  // ── Bar after ─────────────────────────────────────────────────────────────
  selected.push({
    product: bar,
    quantity: 1,
    timing_minutes: [total_duration_minutes + 15],   // 15 min post-finish
    note: timingRules.after.note,
  })

  return selected
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function formatMin(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}
