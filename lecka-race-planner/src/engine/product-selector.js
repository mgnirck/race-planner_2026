/**
 * product-selector.js
 *
 * Selects products for a given set of nutrition targets, respecting user
 * product-flavour preferences and rotating variety on longer races.
 *
 * Export: selectProducts(targets, preferredProductIds?) → Array<{product, quantity, timing_minutes, note}>
 *
 * preferredProductIds (optional) — array of product IDs the athlete prefers.
 *   If omitted / empty, sensible defaults are used.
 *   For races with ≥ 5 gel slots the selector cycles through the chosen
 *   non-caffeine flavours so the athlete gets variety.
 */

import products      from '../config/products.json'
import formulaConfig from '../config/formula-config.json'

export function selectProducts(targets, preferredProductIds = [], region = 'us') {
  const { total_duration_minutes, caffeine_ok } = targets
  const { timing_rules: timingRules, caffeine_rules: caffeineRules } = formulaConfig

  // ── Resolve product pools ─────────────────────────────────────────────────

  const preferred = preferredProductIds.length > 0
    ? products.filter(p => preferredProductIds.includes(p.id))
    : []

  // Non-caffeine gels — fall back to passion fruit if none preferred
  const plainGelPool = preferred.filter(p => p.type === 'gel' && !p.caffeine)
  const defaultPlainGel = products.find(p => p.id === 'gel-passion-fruit')
  const plainGels = plainGelPool.length > 0 ? plainGelPool : [defaultPlainGel]

  // Caffeine gels — fall back to coffee cacao if none preferred
  const cafGelPool = preferred.filter(p => p.type === 'gel' && p.caffeine)
  const defaultCafGel = products.find(p => p.id === 'gel-coffee-cacao')
  const cafGels = cafGelPool.length > 0 ? cafGelPool : [defaultCafGel]

  // Bars — fall back to mango coconut if none preferred
  const barPool = preferred.filter(p => p.type === 'bar')
  const defaultBar = products.find(p => p.id === 'bar-mango-coconut')
  const bars = barPool.length > 0 ? barPool : [defaultBar]

  // ── Build gel timing slots ────────────────────────────────────────────────

  const gelSlots = []
  let t = timingRules.during.first_intake_min
  while (t < total_duration_minutes) {
    gelSlots.push(t)
    t += timingRules.during.interval_min
  }

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

  if (plainGelSlots.length > 0) {
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

  if (cafGelSlots.length > 0) {
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

  return selected
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function formatMin(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}
