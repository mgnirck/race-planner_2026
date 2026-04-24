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
