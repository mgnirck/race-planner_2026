/**
 * nutrition-engine.js
 *
 * Pure JS module — no DOM, no React imports.
 * Single export: calculateTargets(inputs) → targets object.
 *
 * Inputs
 * ------
 * race_type        : string  — key matching formula-config carb_rates table
 * goal_minutes     : number  — athlete's goal finish time in minutes
 * weight_kg        : number  — body weight
 * gender           : string  — 'male' | 'female' | 'other'
 * conditions       : string  — 'cool' | 'mild' | 'warm' | 'hot' | 'humid'
 * effort           : string  — 'easy' | 'race_pace' | 'hard'
 * caffeine_ok      : boolean — athlete consents to caffeine products
 * training_mode    : boolean — gut-training session (lower carb dose)
 *
 * Returns
 * -------
 * {
 *   carb_per_hour         : number   g/h
 *   sodium_per_hour       : number   mg/h
 *   fluid_ml_per_hour     : number   ml/h
 *   total_duration_minutes: number
 *   total_carbs           : number   g  (whole race)
 *   total_sodium          : number   mg (whole race)
 *   caffeine_ok           : boolean
 *   race_type             : string
 *   effort                : string
 *   conditions            : string
 * }
 */

import formulaConfig from '../config/formula-config.json'

export function calculateTargets(inputs) {
  const {
    race_type,
    goal_minutes,
    weight_kg,
    gender = 'male',
    conditions = 'mild',
    effort = 'race_pace',
    caffeine_ok = false,
    training_mode = false,
  } = inputs

  // ── 1. Validate required inputs ──────────────────────────────────────────
  if (!race_type) throw new Error('race_type is required')
  if (!goal_minutes || goal_minutes <= 0) throw new Error('goal_minutes must be > 0')
  if (!weight_kg || weight_kg <= 0) throw new Error('weight_kg must be > 0')

  const carbRates = formulaConfig.carb_rates_g_per_hour
  if (!carbRates[race_type]) {
    throw new Error(`Unknown race_type "${race_type}". Valid options: ${Object.keys(carbRates).join(', ')}`)
  }

  // ── 2. Base carb rate ─────────────────────────────────────────────────────
  let carb_per_hour = carbRates[race_type][effort]
  if (carb_per_hour === undefined) {
    throw new Error(`Unknown effort "${effort}". Valid options: easy, race_pace, hard`)
  }

  // Effort modifier — secondary fine-tuning on top of the effort-indexed base rate.
  // e.g. easy ×0.85 (more fat oxidation), hard ×1.15 (higher glycogen turnover).
  const effortMod = formulaConfig.effort_modifiers[effort] ?? 1.0
  carb_per_hour *= effortMod

  // Training-mode gut reduction applied after effort adjustment
  if (training_mode) {
    carb_per_hour *= formulaConfig.training_mode.carb_rate_multiplier
  }

  carb_per_hour = Math.round(carb_per_hour)

  // ── 3. Sodium rate ────────────────────────────────────────────────────────
  const sodiumConfig = formulaConfig.sodium_targets_mg_per_hour
  const genderMod = formulaConfig.gender_modifiers[gender] ?? 1.0
  const condMod = formulaConfig.condition_modifiers[conditions]
  if (!condMod) {
    throw new Error(`Unknown conditions "${conditions}". Valid options: cool, mild, warm, hot, humid`)
  }

  let sodium_per_hour = weight_kg * sodiumConfig.base_per_kg * genderMod * condMod.sodium_multiplier
  sodium_per_hour = Math.round(
    Math.min(Math.max(sodium_per_hour, sodiumConfig.minimum), sodiumConfig.maximum)
  )

  // ── 4. Fluid rate ─────────────────────────────────────────────────────────
  const fluidConfig = formulaConfig.fluid_targets_ml_per_hour
  let fluid_ml_per_hour = weight_kg * fluidConfig.base_per_kg * genderMod * condMod.fluid_multiplier
  fluid_ml_per_hour = Math.round(
    Math.min(Math.max(fluid_ml_per_hour, fluidConfig.minimum), fluidConfig.maximum)
  )

  // ── 5. Race totals ────────────────────────────────────────────────────────
  const duration_hours = goal_minutes / 60
  const total_carbs = Math.round(carb_per_hour * duration_hours)
  const total_sodium = Math.round(sodium_per_hour * duration_hours)

  return {
    carb_per_hour,
    sodium_per_hour,
    fluid_ml_per_hour,
    total_duration_minutes: goal_minutes,
    total_carbs,
    total_sodium,
    caffeine_ok,
    race_type,
    effort,
    conditions,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dev smoke-test — only runs in Vite dev mode, never in production builds
// Sample: 70 kg runner, half marathon road, 2h15 goal, warm, race pace, caffeine yes
// ─────────────────────────────────────────────────────────────────────────────
if (import.meta.env?.DEV) {
const sample = calculateTargets({
  race_type:    'half_marathon',
  goal_minutes: 135,          // 2h 15m
  weight_kg:    70,
  gender:       'male',
  conditions:   'warm',
  effort:       'race_pace',
  caffeine_ok:  true,
  training_mode: false,
})

console.log('=== Lecka Nutrition Engine — sample output ===')
console.log(`Race:              Half Marathon`)
console.log(`Goal time:         2h 15m (${sample.total_duration_minutes} min)`)
console.log(`Weight:            70 kg`)
console.log(`Conditions:        ${sample.conditions}`)
console.log(`Effort:            ${sample.effort}`)
console.log(`Caffeine allowed:  ${sample.caffeine_ok}`)
console.log('---')
console.log(`Carb target:       ${sample.carb_per_hour} g/h  →  ${sample.total_carbs} g total`)
console.log(`Sodium target:     ${sample.sodium_per_hour} mg/h  →  ${sample.total_sodium} mg total`)
console.log(`Fluid target:      ${sample.fluid_ml_per_hour} ml/h`)
console.log('==============================================')
} // end DEV smoke-test
