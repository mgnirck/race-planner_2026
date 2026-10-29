#!/usr/bin/env node
/**
 * scripts/test-race-quiz.mjs — check the Shopify race quiz against the planner.
 *
 * Usage:  node scripts/test-race-quiz.mjs
 *
 * For both store files (shopify/race-fuel-quiz.liquid for getlecka.vn and
 * shopify/race-fuel-quiz-com.liquid for getlecka.com):
 *   - they are identical apart from the store block, the language lines, the
 *     header comment and the settings defaults
 * Then extracts the pure logic between "calc:start" and "calc:end" of each and
 * checks, for every race, distance, climbing,
 * goal, finish time and sweat answer the quiz can produce:
 *   - the quiz's numbers equal what the full planner shows for the same answers:
 *     the quiz's own planner link → prefillFromParams() → the engine inputs
 *     StepForm builds (with the planner's defaults: 70 kg, gender male, age
 *     not given) → calculateTargets()
 *   - every kit covers the race carbs and the hour plan adds up to the kit
 *   - the cheapest pack mix is picked
 *
 * Exits with code 1 on any failure. No dependencies.
 */
import { readFileSync } from 'node:fs'
import { calculateTargets } from '../src/engine/nutrition-engine.js'
import { prefillFromParams } from '../src/utils/url-prefill.js'

const FILES = ['race-fuel-quiz.liquid', 'race-fuel-quiz-com.liquid']
const sources = FILES.map(f => readFileSync(new URL(`../../shopify/${f}`, import.meta.url), 'utf8'))

let failures = 0, cases = 0
function check(ok, msg) {
  if (!ok) { failures++; if (failures < 40) console.log('FAIL', msg) }
}

// Everything but the store-specific parts must match between the two files
function shared(src) {
  return src
    .replace(/^\{% comment %\}[\s\S]*?\{% endcomment %\}/, '')
    .replace(/\{%- liquid[\s\S]*?-%\}/, '')
    .replace(/\/\* store:start[\s\S]*?\/\* store:end \*\//, '')
    .replace(/\{% schema %\}[\s\S]*?\{% endschema %\}/, '')
}
check(shared(sources[0]) === shared(sources[1]), `${FILES[0]} and ${FILES[1]} differ outside the store-specific parts`)

// StepForm: DEFAULT_FORM + prefill, then the calculateTargets() call in handleSubmit
const DEFAULT_FORM = { weight_value: '70', weight_unit: 'kg', gender: 'male', temperature: '', humidity: 'dry',
  elevation_gain_m: 0, custom_km: '', training_mode: false, age_bracket: null, sweat_profile: '', athlete_profile: '' }
function deriveConditions(f) {
  if (f.temperature === 'cool') return 'cool'
  if (f.temperature === 'mild') return f.humidity === 'humid' ? 'warm' : 'mild'
  if (f.temperature === 'warm') return f.humidity === 'humid' ? 'humid' : 'warm'
  if (f.temperature === 'hot') return 'hot'
  return 'mild'
}
function plannerTargets(params, minutes) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  const f = { ...DEFAULT_FORM, ...prefillFromParams(qs) }
  // Triathlon: the planner asks for splits; assume they add up to the quiz time
  const goal = f.goal_time_h != null ? Number(f.goal_time_h) * 60 + Number(f.goal_time_m) : minutes
  return calculateTargets({
    race_type: f.race_type, goal_minutes: goal, weight_kg: Number(f.weight_value), gender: f.gender,
    conditions: deriveConditions(f), effort: f.effort, athlete_profile: f.athlete_profile,
    elevation_gain_m: f.elevation_gain_m, distance_km: parseFloat(f.custom_km) || 0,
    training_mode: f.training_mode, age_bracket: f.age_bracket, sweat_profile: f.sweat_profile || 'average',
  })
}

const live = () => null // fallback prices, everything in stock

for (const [fi, src] of sources.entries()) {
const block = src.split('/* calc:start')[1]?.split('/* calc:end */')[0]
if (!block) throw new Error(`calc block not found in ${FILES[fi]}`)
const CALC = new Function(block.replace(/^[^\n]*\n/, '') + '\nreturn CALC')()
console.log(`\n${FILES[fi]} (climate ${CALC.CLIMATE})`)
const DISTANCES = {
  '10k': [10], half_marathon: [21.1], marathon: [42.2], triathlon_70_3: [113],
  custom: [1, 5, 15, 30.5, 50, 65, 100, 170, 500], cycling: [20, 60, 100, 160, 300],
}
const CLIMBS = [0, 150, 600, 1500, 3500, 9000]
const SWEATS = ['light', 'average', 'salty', 'unsure']

for (const kind of CALC.KINDS) {
  for (const km of DISTANCES[kind]) {
    for (const elev of kind === 'triathlon_70_3' ? [0] : CLIMBS) {
      CALC.GOALS.forEach((goal, gi) => {
        const est = CALC.estimateMinutes(kind, km, elev, gi)
        for (const minutes of [est, Math.max(5, est - 25), est + 40]) {
          for (const sweat of SWEATS) {
            cases++
            const race = CALC.raceType(kind, km)
            const q = CALC.targets(race, goal, minutes, sweat === 'unsure' ? 'average' : sweat, km, elev)
            const e = plannerTargets(CALC.plannerParams(kind, km, elev > 0, elev, minutes, goal, sweat), minutes)
            const tag = `${kind} ${km}km +${elev}m ${goal} ${minutes}min ${sweat}`
            check(q.carbH === e.carb_per_hour, `${tag}: carbs ${q.carbH} vs planner ${e.carb_per_hour}`)
            check(q.naH === e.sodium_per_hour, `${tag}: sodium ${q.naH} vs planner ${e.sodium_per_hour}`)
            check(q.fluidH === e.fluid_ml_per_hour, `${tag}: fluid ${q.fluidH} vs planner ${e.fluid_ml_per_hour}`)
          }
        }

        const tg = CALC.targets(CALC.raceType(kind, km), goal, est, 'average', km, elev)
        const units = CALC.raceUnits(CALC.raceType(kind, km), tg, est)
        const n = units.gel + units.ultra + units.bar
        const carbsInKit = units.gel * CALC.AVG_CARBS.gel + units.ultra * CALC.AVG_CARBS.ultra + units.bar * CALC.AVG_CARBS.bar
        check(carbsInKit >= tg.carbs, `${kind} ${km}km ${goal}: kit carbs ${carbsInKit} < ${tg.carbs}`)
        const rows = CALC.schedule(units, tg.hours)
        const inRows = rows.reduce((s, r) => s + r.gel + r.ultra + r.bar, 0)
        check(inRows === n, `${kind} ${km}km ${goal}: hour plan has ${inRows} of ${n} products`)
        for (const mult of [1, 3]) {
          const kit = CALC.buildKit(units, mult, est, live)
          check(kit.units >= n * mult, `${kind} ${km}km ${goal} ×${mult}: ${kit.units} units < ${n * mult}`)
          check(kit.total > 0, `${kind} ${km}km ${goal} ×${mult}: empty kit`)
        }
      })
    }
  }
}

// A few plans to eyeball
for (const [kind, km, elev, gi] of [['10k', 10, 0, 1], ['marathon', 42.2, 0, 1], ['custom', 50, 2000, 1],
  ['custom', 100, 4000, 0], ['triathlon_70_3', 113, 0, 1], ['cycling', 100, 1200, 1]]) {
  const goal = CALC.GOALS[gi], est = CALC.estimateMinutes(kind, km, elev, gi), race = CALC.raceType(kind, km)
  const tg = CALC.targets(race, goal, est, 'average', km, elev)
  const units = CALC.raceUnits(race, tg, est)
  const kit = CALC.buildKit(units, 1, est, live)
  const rows = CALC.schedule(units, tg.hours).map(r => `${r.gel}g/${r.ultra}u/${r.bar}b`).join(' ')
  console.log(`${kind.padEnd(14)} ${String(km).padStart(5)} km +${String(elev).padEnd(4)} m ${goal.padEnd(9)} ` +
    `${Math.floor(est / 60)}:${String(est % 60).padStart(2, '0')}  ${tg.carbH} g/h  hours: ${rows}\n    kit ${kit.total}: ` +
    kit.lines.map(l => `${l.qty}× ${l.name}`).join(', '))
}

// Cheapest pack mix: 11 gels as singles (572k) loses to one variety pack (550k)
const c = CALC.cheapest(11, [{ units: 1, price: 52000 }, { units: 12, price: 550000 }])
check(c[0] === 0 && c[1] === 1, `cheapest(11 gels) = ${c}`)
}

// Planner link → prefill
const p = prefillFromParams(new URLSearchParams('race=ultra_50k&km=65&surface=trail&elev=2400&time=480&effort=hard&sweat=salty&climate=humid&profile=intermediate'))
check(p.race_type === 'ultra_50k' && p.custom_km === '65' && p.surface_type === 'trail' && p.elevation_gain_m === 2400, 'prefill trail ultra')
check(p.goal_time_h === '8' && p.goal_time_m === '0' && p.athlete_profile === 'intermediate', 'prefill time and profile')
check(p.effort === 'hard' && p.sweat_profile === 'salty' && p.temperature === 'warm' && p.humidity === 'humid', 'prefill prefs')
const tri = prefillFromParams(new URLSearchParams('race=triathlon_70_3&time=390'))
check(tri.sport === 'triathlon' && tri.triathlon_type === 'triathlon_70_3' && !tri.goal_time_h, 'prefill triathlon')
const bike = prefillFromParams(new URLSearchParams('race=cycling&km=100&time=225&elev=1200'))
check(bike.sport === 'cycling' && bike.custom_km === '100' && bike.goal_time_m === '45' && bike.elevation_gain_m === 1200, 'prefill cycling')
check(prefillFromParams(new URLSearchParams('race=nope')) === null, 'prefill rejects unknown race')
check(prefillFromParams(new URLSearchParams('lang=vi')) === null, 'prefill ignores links without race')

console.log(failures ? `\n${failures} failure(s) in ${cases} cases` : `\nAll checks passed (${cases} quiz answers compared with the planner)`)
process.exit(failures ? 1 : 0)
