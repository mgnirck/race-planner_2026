#!/usr/bin/env node
/**
 * scripts/test-race-quiz.mjs — check the Shopify race quiz against the planner.
 *
 * Usage:  node scripts/test-race-quiz.mjs
 *
 * Extracts the pure logic between "calc:start" and "calc:end" in
 * shopify/race-fuel-quiz.liquid and checks that:
 *   - carbs, sodium and fluid per hour equal calculateTargets() from the engine
 *     for the quiz defaults (70 kg, intermediate, humid) on every race × goal × sweat
 *   - every kit covers the race carbs and is the cheapest pack mix
 *   - the planner link params map onto a valid lecka_pro_prefill
 *
 * Exits with code 1 on any failure. No dependencies.
 */
import { readFileSync } from 'node:fs'
import { calculateTargets } from '../src/engine/nutrition-engine.js'
import { prefillFromParams } from '../src/utils/url-prefill.js'

const liquid = readFileSync(new URL('../../shopify/race-fuel-quiz.liquid', import.meta.url), 'utf8')
const block = liquid.split('/* calc:start')[1]?.split('/* calc:end */')[0]
if (!block) throw new Error('calc block not found')
const CALC = new Function(block.replace(/^[^\n]*\n/, '') + '\nreturn CALC')()

let failures = 0
function check(ok, msg) {
  if (!ok) { failures++; console.log('FAIL', msg) }
}

const SWEATS = ['light', 'average', 'salty']
const live = () => null // fallback prices, everything in stock

for (const race of Object.keys(CALC.RACES)) {
  CALC.GOALS.forEach((goal, i) => {
    const base = CALC.RACES[race].min[i]
    for (const minutes of [base - 30, base, base + 45]) {
      for (const sweat of SWEATS) {
        const q = CALC.targets(race, goal, minutes, sweat)
        const e = calculateTargets({
          race_type: race, goal_minutes: minutes, weight_kg: 70, conditions: 'humid',
          effort: goal, sweat_profile: sweat, athlete_profile: 'intermediate',
        })
        const tag = `${race} ${goal} ${minutes}min ${sweat}`
        check(q.carbH === e.carb_per_hour, `${tag}: carbs ${q.carbH} vs engine ${e.carb_per_hour}`)
        check(q.naH === e.sodium_per_hour, `${tag}: sodium ${q.naH} vs engine ${e.sodium_per_hour}`)
        check(q.fluidH === e.fluid_ml_per_hour, `${tag}: fluid ${q.fluidH} vs engine ${e.fluid_ml_per_hour}`)
      }
    }

    const tg = CALC.targets(race, goal, base, 'average')
    const units = CALC.raceUnits(race, tg)
    const carbsInKit = units.gel * 25.4 + units.ultra * 62.5 + units.bar * 23.5
    check(carbsInKit >= tg.carbs, `${race} ${goal}: kit carbs ${carbsInKit} < ${tg.carbs}`)
    for (const mult of [1, 3]) {
      const kit = CALC.buildKit(race, units, mult, base, live)
      const got = kit.lines.reduce((s, l) => s + l.units, 0)
      const need = (units.gel + units.ultra + units.bar) * mult
      check(got >= need, `${race} ${goal} ×${mult}: ${got} units < ${need}`)
      check(kit.total > 0, `${race} ${goal} ×${mult}: empty kit`)
      if (mult === 1) {
        const lines = kit.lines.map(l => `${l.qty}× ${l.name}`).join(', ')
        console.log(`${race.padEnd(15)} ${goal.padEnd(9)} ${String(base).padStart(3)}min  ` +
          `${tg.carbH} g/h ${tg.naH} mg/h  covered ${CALC.sodiumCovered(units)}/${tg.sodium} mg  ` +
          `${kit.total.toLocaleString('vi-VN')} ₫  ${lines}`)
      }
    }
  })
}

// Cheapest pack mix: 11 gels as singles (572k) loses to one variety pack (550k)
const c = CALC.cheapest(11, [{ units: 1, price: 52000 }, { units: 12, price: 550000 }])
check(c[0] === 0 && c[1] === 1, `cheapest(11 gels) = ${c}`)

// Planner link → prefill
const p = prefillFromParams(new URLSearchParams('race=marathon&time=270&effort=hard&sweat=salty&climate=humid'))
check(p.race_type === 'marathon' && p.custom_km === '42.2' && p.goal_time_h === '4' && p.goal_time_m === '30', 'prefill marathon')
check(p.effort === 'hard' && p.sweat_profile === 'salty' && p.temperature === 'warm' && p.humidity === 'humid', 'prefill prefs')
const tri = prefillFromParams(new URLSearchParams('race=triathlon_70_3&time=390'))
check(tri.sport === 'triathlon' && tri.triathlon_type === 'triathlon_70_3' && !tri.goal_time_h, 'prefill triathlon')
const bike = prefillFromParams(new URLSearchParams('race=cycling&km=100&time=225'))
check(bike.sport === 'cycling' && bike.custom_km === '100' && bike.goal_time_m === '45', 'prefill cycling')
check(prefillFromParams(new URLSearchParams('race=nope')) === null, 'prefill rejects unknown race')
check(prefillFromParams(new URLSearchParams('lang=vi')) === null, 'prefill ignores links without race')

console.log(failures ? `\n${failures} failure(s)` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
