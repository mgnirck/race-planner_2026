/**
 * StepForm.jsx
 *
 * 3-step input form for the Lecka Race Nutrition Planner.
 *
 * Props
 * -----
 * onComplete({ targets, selection, form }) — called on final submit after
 *   running calculateTargets() + selectProducts()
 */

import React, { useState } from 'react'
import { calculateTargets } from '../engine/nutrition-engine'
import { selectProducts }   from '../engine/product-selector'

// ── Constants ─────────────────────────────────────────────────────────────────

const RACE_PRESETS = [
  { label: 'Road half marathon', key: 'half_marathon' },
  { label: 'Road marathon',      key: 'marathon'      },
  { label: 'Trail 21–42km',      key: 'half_marathon' },
  { label: 'Trail 50km+',        key: 'ultra_50k'     },
]

const CONDITIONS = [
  { label: 'Cool',  sublabel: 'under 18°C / 64°F', key: 'cool' },
  { label: 'Warm',  sublabel: '18–25°C / 64–77°F', key: 'warm' },
  { label: 'Hot',   sublabel: 'over 25°C / 77°F',  key: 'hot'  },
]

const EFFORT_OPTIONS = [
  {
    label: 'Easy / long day',
    desc:  'Comfortable, conversational pace',
    key:   'easy',
  },
  {
    label: 'Race pace',
    desc:  'Goal pace — controlled but working',
    key:   'race_pace',
  },
  {
    label: 'All-out effort',
    desc:  'Threshold or beyond — it hurts',
    key:   'hard',
  },
]

const STEP_TITLES = ['Your race', 'Your body & conditions', 'Your preferences']

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "h:mm" or "hh:mm" → total minutes, or null if invalid */
function parseGoalTime(str) {
  const match = str.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = parseInt(match[1], 10)
  const mins  = parseInt(match[2], 10)
  if (mins > 59) return null
  const total = hours * 60 + mins
  return total > 0 ? total : null
}

/** Map an entered distance (km) to the nearest engine race_type key */
function distanceToRaceType(km) {
  if (km <  10) return '5k'
  if (km <  20) return '10k'
  if (km <  31) return 'half_marathon'
  if (km <  51) return 'marathon'
  if (km <  81) return 'ultra_50k'
  return 'ultra_100k'
}

/** User-facing label for a race_type key when entered via custom distance */
const RACE_TYPE_LABELS = {
  '5k':           '5 km',
  '10k':          '10 km',
  'half_marathon':'Half marathon',
  'marathon':     'Marathon',
  'ultra_50k':    'Ultra 50 km',
  'ultra_100k':   'Ultra 100 km',
}

/** Convert weight value + unit → kg, or null if out of range / invalid */
function toKg(value, unit) {
  const n = parseFloat(value)
  if (!isFinite(n) || n <= 0) return null
  const kg = unit === 'lb' ? n / 2.20462 : n
  return kg >= 40 && kg <= 140 ? kg : null
}

// ── Primitive UI components ───────────────────────────────────────────────────

/**
 * Round pill button — used for single-select options without long descriptions.
 */
function Pill({ label, sublabel, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'min-h-[44px] px-4 py-2.5 rounded-full border-2 text-sm font-medium',
        'text-left leading-tight transition-colors',
        selected
          ? 'border-[#2D6A4F] bg-[#2D6A4F] text-white'
          : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#74C69D]',
      ].join(' ')}
    >
      <span className="block">{label}</span>
      {sublabel && (
        <span className={`block text-xs mt-0.5 ${selected ? 'text-white/75' : 'text-gray-400'}`}>
          {sublabel}
        </span>
      )}
    </button>
  )
}

/**
 * Full-width card button — used for options that need a one-line description.
 */
function OptionCard({ label, desc, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full min-h-[64px] px-4 py-3 rounded-xl border-2 text-left transition-colors',
        selected
          ? 'border-[#2D6A4F] bg-[#2D6A4F]/5'
          : 'border-gray-200 bg-white hover:border-[#74C69D]',
      ].join(' ')}
    >
      <div className={`text-sm font-semibold ${selected ? 'text-[#2D6A4F]' : 'text-[#1B1B1B]'}`}>
        {label}
      </div>
      <div className="text-xs text-gray-400 mt-0.5 font-normal">{desc}</div>
    </button>
  )
}

/** Section label above a group of inputs */
function FieldLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

// ── Step 1: Race ──────────────────────────────────────────────────────────────

function StepOne({ form, setForm }) {
  const goalMinutes = parseGoalTime(form.goal_time)
  const timeIsInvalid = form.goal_time.length > 0 && goalMinutes === null

  return (
    <div className="space-y-7">
      {/* Race type */}
      <div>
        <FieldLabel>Race type</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {RACE_PRESETS.map(opt => (
            <Pill
              key={opt.label}
              label={opt.label}
              selected={form.race_label === opt.label}
              onClick={() =>
                setForm(f => ({
                  ...f,
                  race_label: opt.label,
                  race_type:  opt.key,
                  custom_km:  '',
                }))
              }
            />
          ))}
          <Pill
            label="Other distance"
            selected={form.race_label === 'other'}
            onClick={() =>
              setForm(f => ({ ...f, race_label: 'other', race_type: '', custom_km: '' }))
            }
          />
        </div>

        {form.race_label === 'other' && (
          <div className="mt-4">
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="250"
                placeholder="Distance"
                value={form.custom_km}
                onChange={e => {
                  const raw = e.target.value
                  const km  = parseFloat(raw)
                  setForm(f => ({
                    ...f,
                    custom_km:  raw,
                    race_type:  isFinite(km) && km > 0 ? distanceToRaceType(km) : '',
                  }))
                }}
                className={[
                  'w-36 border-2 rounded-lg px-3 py-2.5 text-sm',
                  'focus:outline-none focus:border-[#2D6A4F]',
                  form.custom_km && !form.race_type
                    ? 'border-red-300'
                    : 'border-gray-200',
                ].join(' ')}
              />
              <span className="text-sm text-gray-500">km</span>
            </div>
            {form.race_type && (
              <p className="text-xs text-[#2D6A4F] mt-1.5">
                Using {RACE_TYPE_LABELS[form.race_type]} nutrition plan
              </p>
            )}
          </div>
        )}
      </div>

      {/* Goal finish time */}
      <div>
        <FieldLabel>Goal finish time</FieldLabel>
        <input
          type="text"
          inputMode="numeric"
          placeholder="h:mm"
          value={form.goal_time}
          onChange={e => setForm(f => ({ ...f, goal_time: e.target.value }))}
          className={[
            'w-28 border-2 rounded-lg px-3 py-2.5 text-sm font-mono tracking-wide',
            'focus:outline-none',
            goalMinutes !== null
              ? 'border-[#2D6A4F]'
              : timeIsInvalid
              ? 'border-red-300'
              : 'border-gray-200 focus:border-[#2D6A4F]',
          ].join(' ')}
        />
        {goalMinutes !== null && (
          <p className="text-xs text-[#2D6A4F] mt-1.5">
            {Math.floor(goalMinutes / 60)}h {goalMinutes % 60}min
          </p>
        )}
        {timeIsInvalid && (
          <p className="text-xs text-red-400 mt-1.5">Enter time as h:mm, e.g. 2:15</p>
        )}
        {!timeIsInvalid && goalMinutes === null && (
          <p className="text-xs text-gray-400 mt-1.5">e.g. 2:15 for 2 hours 15 minutes</p>
        )}
      </div>
    </div>
  )
}

// ── Step 2: Body & conditions ─────────────────────────────────────────────────

function StepTwo({ form, setForm }) {
  const weightOk = toKg(form.weight_value, form.weight_unit) !== null
  const weightTouched = form.weight_value !== ''

  function switchUnit(newUnit) {
    if (form.weight_unit === newUnit) return
    const n = parseFloat(form.weight_value)
    if (isFinite(n) && n > 0) {
      const converted =
        newUnit === 'lb'
          ? Math.round(n * 2.20462)
          : Math.round(n / 2.20462)
      setForm(f => ({ ...f, weight_unit: newUnit, weight_value: String(converted) }))
    } else {
      setForm(f => ({ ...f, weight_unit: newUnit }))
    }
  }

  const weightMin = form.weight_unit === 'kg' ? 40  : 88
  const weightMax = form.weight_unit === 'kg' ? 140 : 309

  return (
    <div className="space-y-7">
      {/* Weight */}
      <div>
        <FieldLabel>Body weight</FieldLabel>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={weightMin}
            max={weightMax}
            value={form.weight_value}
            onChange={e => setForm(f => ({ ...f, weight_value: e.target.value }))}
            className={[
              'w-24 border-2 rounded-lg px-3 py-2.5 text-sm',
              'focus:outline-none focus:border-[#2D6A4F]',
              weightTouched && !weightOk ? 'border-red-300' : 'border-gray-200',
            ].join(' ')}
          />
          {/* kg / lb toggle */}
          <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden text-sm font-medium">
            {['kg', 'lb'].map(unit => (
              <button
                key={unit}
                type="button"
                onClick={() => switchUnit(unit)}
                className={[
                  'px-3 py-2 min-h-[38px] transition-colors',
                  form.weight_unit === unit
                    ? 'bg-[#2D6A4F] text-white'
                    : 'bg-white text-[#1B1B1B] hover:bg-gray-50',
                ].join(' ')}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
        {weightTouched && !weightOk && (
          <p className="text-xs text-red-400 mt-1.5">
            Enter a weight between {weightMin}–{weightMax} {form.weight_unit}
          </p>
        )}
      </div>

      {/* Gender */}
      <div>
        <FieldLabel>Gender</FieldLabel>
        <div className="flex gap-2">
          {[
            { label: 'Female', key: 'female' },
            { label: 'Male',   key: 'male'   },
          ].map(g => (
            <Pill
              key={g.key}
              label={g.label}
              selected={form.gender === g.key}
              onClick={() => setForm(f => ({ ...f, gender: g.key }))}
            />
          ))}
        </div>
      </div>

      {/* Race conditions */}
      <div>
        <FieldLabel>Race conditions</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map(c => (
            <Pill
              key={c.key}
              label={c.label}
              sublabel={c.sublabel}
              selected={form.conditions === c.key}
              onClick={() => setForm(f => ({ ...f, conditions: c.key }))}
            />
          ))}
        </div>
      </div>

      {/* Effort level */}
      <div>
        <FieldLabel>Effort level</FieldLabel>
        <div className="space-y-2">
          {EFFORT_OPTIONS.map(e => (
            <OptionCard
              key={e.key}
              label={e.label}
              desc={e.desc}
              selected={form.effort === e.key}
              onClick={() => setForm(f => ({ ...f, effort: e.key }))}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Preferences ───────────────────────────────────────────────────────

function StepThree({ form, setForm }) {
  return (
    <div className="space-y-7">
      {/* Caffeine */}
      <div>
        <FieldLabel>Caffeine products</FieldLabel>
        <div className="flex gap-2">
          <Pill
            label="Yes, include caffeine"
            selected={form.caffeine_ok === true}
            onClick={() => setForm(f => ({ ...f, caffeine_ok: true }))}
          />
          <Pill
            label="No caffeine"
            selected={form.caffeine_ok === false}
            onClick={() => setForm(f => ({ ...f, caffeine_ok: false }))}
          />
        </div>
      </div>

      {/* Training mode */}
      <div>
        <FieldLabel>Planning for</FieldLabel>
        <div className="space-y-2">
          <OptionCard
            label="Race day only"
            desc="Full-dose plan optimised for your goal race"
            selected={form.training_mode === false}
            onClick={() => setForm(f => ({ ...f, training_mode: false }))}
          />
          <OptionCard
            label="I train with nutrition too"
            desc="Includes training notes — reduced doses to condition your gut"
            selected={form.training_mode === true}
            onClick={() => setForm(f => ({ ...f, training_mode: true }))}
          />
        </div>
      </div>
    </div>
  )
}

// ── Step validation ───────────────────────────────────────────────────────────

function isStep1Valid(form) {
  const raceOk =
    (form.race_label !== '' && form.race_label !== 'other' && form.race_type !== '') ||
    (form.race_label === 'other' && form.race_type !== '' && form.custom_km !== '')
  const timeOk = parseGoalTime(form.goal_time) !== null
  return raceOk && timeOk
}

function isStep2Valid(form) {
  return (
    toKg(form.weight_value, form.weight_unit) !== null &&
    form.gender     !== '' &&
    form.conditions !== '' &&
    form.effort     !== ''
  )
}

function isStep3Valid(form) {
  return form.caffeine_ok !== null
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StepForm({ onComplete }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    // Step 1
    race_label: '',
    race_type:  '',
    custom_km:  '',
    goal_time:  '',
    // Step 2
    weight_value: '70',
    weight_unit:  'kg',
    gender:       '',
    conditions:   '',
    effort:       '',
    // Step 3
    caffeine_ok:   null,
    training_mode: false,
  })

  const stepValid = { 1: isStep1Valid(form), 2: isStep2Valid(form), 3: isStep3Valid(form) }
  const canAdvance = stepValid[step]

  function handleNext() {
    if (step < 3) {
      setStep(s => s + 1)
      return
    }
    // Final step — run the engine and hand off to results
    const weight_kg    = toKg(form.weight_value, form.weight_unit)
    const goal_minutes = parseGoalTime(form.goal_time)

    const targets   = calculateTargets({
      race_type:     form.race_type,
      goal_minutes,
      weight_kg,
      gender:        form.gender,
      conditions:    form.conditions,
      effort:        form.effort,
      caffeine_ok:   form.caffeine_ok,
      training_mode: form.training_mode,
    })
    const selection = selectProducts(targets)

    onComplete({ targets, selection, form })
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Progress bar ── */}
      <div className="w-full h-1 bg-gray-100" aria-hidden="true">
        <div
          className="h-1 bg-[#2D6A4F] transition-all duration-500 ease-in-out"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      {/* ── Step header ── */}
      <div className="max-w-md mx-auto w-full px-5 pt-8 pb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Step {step} of 3
        </p>
        <h1 className="text-2xl font-bold text-[#1B1B1B] mt-1">
          {STEP_TITLES[step - 1]}
        </h1>
      </div>

      {/* ── Step content ── */}
      <div className="flex-1 max-w-md mx-auto w-full px-5 pb-4">
        {step === 1 && <StepOne form={form} setForm={setForm} />}
        {step === 2 && <StepTwo form={form} setForm={setForm} />}
        {step === 3 && <StepThree form={form} setForm={setForm} />}
      </div>

      {/* ── Navigation ── */}
      <div className="max-w-md mx-auto w-full px-5 py-6 flex items-center gap-3 border-t border-gray-100">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            className={[
              'min-h-[48px] px-5 rounded-xl border-2 border-gray-200',
              'text-sm font-medium text-[#1B1B1B]',
              'hover:border-[#2D6A4F] transition-colors',
            ].join(' ')}
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance}
          className={[
            'flex-1 min-h-[48px] rounded-xl text-sm font-semibold transition-colors',
            canAdvance
              ? 'bg-[#2D6A4F] text-white hover:bg-[#235a3e] active:bg-[#1e4d36]'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed',
          ].join(' ')}
        >
          {step === 3 ? 'Build my plan' : 'Next'}
        </button>
      </div>
    </div>
  )
}
