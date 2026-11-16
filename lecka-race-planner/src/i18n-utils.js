/**
 * Shared i18n helpers used across StepForm, ResultsPage, AdminPage, and send-plan.js.
 * Eliminates the per-file RACE_LABELS / EFFORT_LABELS / CONDITION_LABELS duplication.
 */

export function getRaceLabel(t, raceType) {
  return t(`common:racetype.${raceType}`, { defaultValue: raceType })
}

export function getEffortLabel(t, effort) {
  return t(`common:effort.${effort}.label`, { defaultValue: effort })
}

export function getConditionLabel(t, condition) {
  return t(`common:conditions.${condition}`, { defaultValue: condition })
}

/**
 * Translate a product timing note produced by the engine (product-selector.js).
 * The engine emits English strings; this maps the known patterns onto
 * results:note.* keys. Unknown notes are returned unchanged.
 */
const ULTRA_NOTE_PREFIX = 'Eat over 10–15 min, not all at once'

export function translateNote(t, note) {
  if (!note) return note
  const minShort = s => s.replace(/(\d+)min\b/g, (_, n) => t('results:note.minShort', { n, defaultValue: `${n}min` }))
  let m
  if (note === 'Consume 15–60 min before the start') return t('results:note.before', { defaultValue: note })
  if (note === 'Consume within 60 min of finishing') return t('results:note.after', { defaultValue: note })
  if (note === 'Join the waitlist — launching soon') return t('results:note.waitlist', { defaultValue: note })
  if (note === 'Eat ~90 min before start — well before your swim') return t('results:note.beforeSwim', { defaultValue: note })
  if (note === 'Best in the first half — peanut butter slows absorption') return t('results:note.peanutButter', { defaultValue: note })
  if ((m = note.match(/^First intake at ~(\d+) min, then every (\d+) min(?: — caffeine boost(?: at (.+))?)?$/))) {
    const base = t('results:note.during', { first: m[1], interval: m[2], defaultValue: note })
    if (m[3]) return `${base} — ${t('results:note.caffeineBoostAt', { times: minShort(m[3]), defaultValue: `caffeine boost at ${m[3]}` })}`
    if (note.endsWith('— caffeine boost')) return `${base} — ${t('results:note.caffeineBoost', { defaultValue: 'caffeine boost' })}`
    return base
  }
  if (note.startsWith(ULTRA_NOTE_PREFIX) && (m = note.match(/ — first at ~(\d+) min, then every (\d+) min$/))) {
    return t('results:note.ultra', { first: m[1], interval: m[2], defaultValue: note })
  }
  return note
}
