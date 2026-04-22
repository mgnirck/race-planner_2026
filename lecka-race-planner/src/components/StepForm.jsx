/**
 * StepForm.jsx — 3-step input form for the Lecka Race Nutrition Planner.
 *
 * Step 1  Your race       — name, distance (km/mi), surface, goal time
 * Step 2  Body & prefs   — weight, gender, conditions, effort, training status, caffeine, mode
 * Step 3  Product prefs  — pick favourite gel & bar flavours
 *
 * Props
 * -----
 * onComplete({ targets, selection, form }) — called on final submit
 */

import React, { useState, useRef } from 'react'
import { calculateTargets } from '../engine/nutrition-engine'
import { selectProducts }   from '../engine/product-selector'
import products             from '../config/products.json'
import { parseGPX, estimateElevationImpact } from '../utils/gpx-parser.js'
import { detectRegion }     from '../embed.js'
import { isAvailableInRegion } from '../engine/region-utils.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const SURFACE_TYPES = [
  { label: 'Road',  key: 'road'  },
  { label: 'Trail', key: 'trail' },
]

const CONDITIONS = [
  { label: 'Cool',  sublabel: 'under 15°C / 59°F',  key: 'cool' },
  { label: 'Mild',  sublabel: '15–20°C / 59–68°F',  key: 'mild' },
  { label: 'Warm',  sublabel: '20–26°C / 68–79°F',  key: 'warm' },
  { label: 'Hot',   sublabel: 'over 26°C / 79°F',   key: 'hot'  },
]

const EFFORT_OPTIONS = [
  { label: 'Easy / long day',  desc: 'Comfortable, conversational pace',     key: 'easy'      },
  { label: 'Race pace',        desc: 'Goal pace — controlled but working',    key: 'race_pace' },
  { label: 'All-out effort',   desc: 'Threshold or beyond — it hurts',        key: 'hard'      },
]

const STEP_TITLES = ['Your race', 'Your body & preferences', 'Product preferences']

// ── Helpers ───────────────────────────────────────────────────────────────────

function goalMinutesFromParts(hStr, mStr) {
  if (hStr === '' || mStr === '') return null
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || m < 0 || m > 59) return null
  const total = h * 60 + m
  return total > 0 ? total : null
}

function distanceToRaceType(km) {
  if (km <  10) return '5k'
  if (km <  20) return '10k'
  if (km <  31) return 'half_marathon'
  if (km <  51) return 'marathon'
  if (km <  81) return 'ultra_50k'
  return 'ultra_100k'
}

const RACE_TYPE_LABELS = {
  '5k':            '5 km',
  '10k':           '10 km',
  'half_marathon': 'Half marathon',
  'marathon':      'Marathon',
  'ultra_50k':     'Ultra 50 km',
  'ultra_100k':    'Ultra 100 km+',
}

function toKg(value, unit) {
  const n = parseFloat(value)
  if (!isFinite(n) || n <= 0) return null
  const kg = unit === 'lb' ? n / 2.20462 : n
  return kg >= 40 && kg <= 140 ? kg : null
}

function displayToKm(displayVal, unit) {
  const n = parseFloat(displayVal)
  if (!isFinite(n) || n <= 0) return null
  return unit === 'mi' ? n * 1.60934 : n
}

// ── Primitive UI components ───────────────────────────────────────────────────

function Pill({ label, sublabel, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'min-h-[44px] px-4 py-2.5 rounded-full border-2 text-sm font-medium',
        'text-left leading-tight transition-colors',
        selected
          ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
          : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#48C4B0]',
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

function OptionCard({ label, desc, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full min-h-[64px] px-4 py-3 rounded-xl border-2 text-left transition-colors',
        selected
          ? 'border-[#48C4B0] bg-[#48C4B0]/5'
          : 'border-gray-200 bg-white hover:border-[#48C4B0]',
      ].join(' ')}
    >
      <div className={`text-sm font-semibold ${selected ? 'text-[#48C4B0]' : 'text-[#1B1B1B]'}`}>
        {label}
      </div>
      <div className="text-xs text-gray-400 mt-0.5 font-normal">{desc}</div>
    </button>
  )
}

function FieldLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

function ProductPreferenceCard({ product, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'w-full px-4 py-3 rounded-xl border-2 text-left transition-colors',
        selected
          ? 'border-[#48C4B0] bg-[#48C4B0]/5'
          : 'border-gray-200 bg-white hover:border-[#48C4B0]/50',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-tight ${selected ? 'text-[#48C4B0]' : 'text-[#1B1B1B]'}`}>
            {product.name}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            <span className="text-xs text-gray-400">{product.carbs_per_unit}g carbs</span>
            <span className="text-xs text-gray-400">{product.sodium_per_unit}mg sodium</span>
            {product.caffeine && (
              <span className="text-xs font-medium text-[#48C4B0]">{product.caffeine_mg}mg caffeine</span>
            )}
          </div>
        </div>
        <div
          className={[
            'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
            selected ? 'bg-[#48C4B0] border-[#48C4B0]' : 'border-gray-300',
          ].join(' ')}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Step 1: Race ──────────────────────────────────────────────────────────────

function StepOne({ form, setForm }) {
  const [gpxError, setGpxError] = useState(false)
  const minutesRef = useRef(null)

  const goalMinutes    = goalMinutesFromParts(form.goal_time_h, form.goal_time_m)
  const minutesInvalid = form.goal_time_m !== '' &&
    (isNaN(parseInt(form.goal_time_m, 10)) || parseInt(form.goal_time_m, 10) > 59)

  function handleDistChange(rawValue) {
    setForm(f => {
      const kmVal = displayToKm(rawValue, f.dist_unit)
      return {
        ...f,
        custom_km_display: rawValue,
        custom_km:  kmVal !== null ? String(Math.round(kmVal * 10) / 10) : '',
        race_type:  kmVal ? distanceToRaceType(kmVal) : '',
      }
    })
  }

  function switchDistUnit(newUnit) {
    setForm(f => {
      if (f.dist_unit === newUnit) return f
      const n = parseFloat(f.custom_km_display)
      let newDisplay = f.custom_km_display
      if (isFinite(n) && n > 0) {
        newDisplay = newUnit === 'mi'
          ? String(Math.round((n / 1.60934) * 10) / 10)
          : String(Math.round((n * 1.60934) * 10) / 10)
      }
      return { ...f, dist_unit: newUnit, custom_km_display: newDisplay }
    })
  }

  function handleElevChange(rawValue) {
    setForm(f => {
      const n = parseFloat(rawValue)
      const elevM = isFinite(n) && n >= 0
        ? Math.round(f.elev_unit === 'ft' ? n / 3.28084 : n)
        : 0
      return { ...f, elev_display: rawValue, elevation_gain_m: elevM }
    })
  }

  function switchElevUnit(newUnit) {
    setForm(f => {
      if (f.elev_unit === newUnit) return f
      const n = parseFloat(f.elev_display)
      let newDisplay = f.elev_display
      if (isFinite(n) && n > 0) {
        newDisplay = newUnit === 'ft'
          ? String(Math.round(n * 3.28084))
          : String(Math.round(n / 3.28084))
      }
      return { ...f, elev_unit: newUnit, elev_display: newDisplay }
    })
  }

  function handleGpxFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const parsed = parseGPX(evt.target.result)
        const { label } = estimateElevationImpact(parsed.elevation_gain_m, parsed.distance_km)
        const roundedKm = Math.round(parsed.distance_km * 10) / 10
        setGpxError(false)
        setForm(f => {
          const displayElev = f.elev_unit === 'ft'
            ? String(Math.round(parsed.elevation_gain_m * 3.28084))
            : String(Math.round(parsed.elevation_gain_m))
          return {
            ...f,
            custom_km:         String(roundedKm),
            custom_km_display: String(roundedKm),
            elevation_gain_m:  parsed.elevation_gain_m,
            elev_display:      displayElev,
            gpx_parsed:        true,
            race_type:         distanceToRaceType(parsed.distance_km),
            ...(parsed.avg_grade_pct > 2 ? { surface_type: 'trail' } : {}),
          }
        })
      } catch {
        setGpxError(true)
        setForm(f => ({ ...f, gpx_parsed: false }))
      }
    }
    reader.onerror = () => {
      setGpxError(true)
      setForm(f => ({ ...f, gpx_parsed: false }))
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-selected after an error
    e.target.value = ''
  }

  const gpxSummaryLabel = form.gpx_parsed
    ? estimateElevationImpact(form.elevation_gain_m, parseFloat(form.custom_km) || 0).label
    : ''

  return (
    <div className="space-y-6">

      {/* Race / run name */}
      <div>
        <FieldLabel>Race or run name</FieldLabel>
        <input
          type="text"
          placeholder="e.g. Boston Marathon 2026"
          value={form.race_name}
          onChange={e => setForm(f => ({ ...f, race_name: e.target.value }))}
          className="w-full border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200
                     focus:outline-none focus:border-[#48C4B0]"
        />
        <p className="text-xs text-gray-400 mt-1.5">Optional — shown on your plan</p>
      </div>

      {/* GPX upload */}
      <div>
        <FieldLabel>Upload GPX file (optional)</FieldLabel>
        <label
          className="flex flex-col items-center justify-center gap-1.5 w-full
                     border-2 border-dashed border-gray-200 rounded-xl bg-gray-50
                     py-6 px-4 cursor-pointer hover:border-[#48C4B0] transition-colors"
        >
          <input
            type="file"
            accept=".gpx"
            className="sr-only"
            onChange={handleGpxFile}
          />
          <svg
            className="w-6 h-6 text-gray-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 16V4m0 0L8 8m4-4 4 4"/>
            <path d="M4 20h16"/>
          </svg>
          <p className="text-sm text-gray-500 text-center">
            Drop your race GPX file here, or click to browse
          </p>
          <p className="text-xs text-gray-400 text-center">
            Auto-fills distance, elevation &amp; surface
          </p>
        </label>
        {form.gpx_parsed && !gpxError && (
          <p className="text-xs text-[#48C4B0] mt-1.5">
            GPX loaded: {form.custom_km} km · {form.elevation_gain_m} m elevation gain · {gpxSummaryLabel}
          </p>
        )}
        {gpxError && (
          <p className="text-xs text-red-400 mt-1.5">
            Could not read GPX file — please try another
          </p>
        )}
      </div>

      {/* Distance */}
      <div>
        <FieldLabel>Race distance</FieldLabel>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1"
            max="500"
            placeholder="e.g. 42"
            value={form.custom_km_display}
            onChange={e => handleDistChange(e.target.value)}
            className="w-32 border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200
                       focus:outline-none focus:border-[#48C4B0]"
          />
          {/* km / mi toggle */}
          <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden text-sm font-medium">
            {['km', 'mi'].map(unit => (
              <button
                key={unit}
                type="button"
                onClick={() => switchDistUnit(unit)}
                className={[
                  'px-3 py-2 min-h-[38px] transition-colors',
                  form.dist_unit === unit
                    ? 'bg-[#48C4B0] text-white'
                    : 'bg-white text-[#1B1B1B] hover:bg-gray-50',
                ].join(' ')}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
        {form.custom_km_display && (
          <p className="text-xs text-[#48C4B0] mt-1.5">
            {form.custom_km_display} {form.dist_unit} — personalised nutrition plan
          </p>
        )}
      </div>

      {/* Elevation gain */}
      <div>
        <FieldLabel>Elevation gain</FieldLabel>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0"
            max="10000"
            placeholder="0"
            value={form.elev_display}
            onChange={e => handleElevChange(e.target.value)}
            className="w-32 border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200
                       focus:outline-none focus:border-[#48C4B0]"
          />
          {/* m / ft toggle */}
          <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden text-sm font-medium">
            {['m', 'ft'].map(unit => (
              <button
                key={unit}
                type="button"
                onClick={() => switchElevUnit(unit)}
                className={[
                  'px-3 py-2 min-h-[38px] transition-colors',
                  form.elev_unit === unit
                    ? 'bg-[#48C4B0] text-white'
                    : 'bg-white text-[#1B1B1B] hover:bg-gray-50',
                ].join(' ')}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
        {form.gpx_parsed && form.elevation_gain_m > 0 ? (
          <p className="text-xs text-[#48C4B0] mt-1.5">Auto-filled from GPX · {gpxSummaryLabel}</p>
        ) : (
          <p className="text-xs text-gray-400 mt-1.5">
            Optional — improves calculation for hilly courses. Default is 0 (flat).
          </p>
        )}
      </div>

      {/* Surface */}
      <div>
        <FieldLabel>Surface</FieldLabel>
        <div className="flex gap-2">
          {SURFACE_TYPES.map(s => (
            <Pill
              key={s.key}
              label={s.label}
              selected={form.surface_type === s.key}
              onClick={() => setForm(f => ({ ...f, surface_type: s.key }))}
            />
          ))}
        </div>
      </div>

      {/* Goal finish time */}
      <div>
        <FieldLabel>Goal finish time</FieldLabel>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="hh"
            value={form.goal_time_h}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 2)
              setForm(f => ({ ...f, goal_time_h: val }))
              if (val.length === 2) minutesRef.current?.focus()
            }}
            className={[
              'w-16 border-2 rounded-lg px-3 py-2.5 text-sm font-mono text-center',
              'focus:outline-none',
              goalMinutes !== null
                ? 'border-[#48C4B0]'
                : 'border-gray-200 focus:border-[#48C4B0]',
            ].join(' ')}
          />
          <span className="text-xl font-bold text-gray-300 select-none">:</span>
          <input
            ref={minutesRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="mm"
            value={form.goal_time_m}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 2)
              setForm(f => ({ ...f, goal_time_m: val }))
            }}
            className={[
              'w-16 border-2 rounded-lg px-3 py-2.5 text-sm font-mono text-center',
              'focus:outline-none',
              minutesInvalid
                ? 'border-red-300'
                : goalMinutes !== null
                ? 'border-[#48C4B0]'
                : 'border-gray-200 focus:border-[#48C4B0]',
            ].join(' ')}
          />
        </div>
        {goalMinutes !== null && (
          <p className="text-xs text-[#48C4B0] mt-1.5">
            {Math.floor(goalMinutes / 60)}h {goalMinutes % 60}min
          </p>
        )}
        {minutesInvalid && (
          <p className="text-xs text-red-400 mt-1.5">Minutes must be between 0 and 59</p>
        )}
        {!minutesInvalid && goalMinutes === null && (
          <p className="text-xs text-gray-400 mt-1.5">
            Hours and minutes — e.g. 02 : 15, or 50 : 20 for a 50h race
          </p>
        )}
      </div>

    </div>
  )
}

// ── Step 2: Body, conditions & preferences ────────────────────────────────────

function StepTwo({ form, setForm }) {
  const weightOk      = toKg(form.weight_value, form.weight_unit) !== null
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
              'focus:outline-none focus:border-[#48C4B0]',
              weightTouched && !weightOk ? 'border-red-300' : 'border-gray-200',
            ].join(' ')}
          />
          <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden text-sm font-medium">
            {['kg', 'lb'].map(unit => (
              <button
                key={unit}
                type="button"
                onClick={() => switchUnit(unit)}
                className={[
                  'px-3 py-2 min-h-[38px] transition-colors',
                  form.weight_unit === unit
                    ? 'bg-[#48C4B0] text-white'
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

      {/* Training status */}
      <div>
        <FieldLabel>Your training status</FieldLabel>
        <div className="space-y-2">
          <OptionCard
            label="Untrained"
            desc="New to endurance sports, lower sweat rate"
            selected={form.athlete_profile === 'untrained'}
            onClick={() => setForm(f => ({ ...f, athlete_profile: 'untrained' }))}
          />
          <OptionCard
            label="Intermediate"
            desc="Moderate endurance training (recommended for most)"
            selected={form.athlete_profile === 'intermediate'}
            onClick={() => setForm(f => ({ ...f, athlete_profile: 'intermediate' }))}
          />
          <OptionCard
            label="Trained"
            desc="Regular endurance athlete, higher sweat rate"
            selected={form.athlete_profile === 'trained'}
            onClick={() => setForm(f => ({ ...f, athlete_profile: 'trained' }))}
          />
          <OptionCard
            label="Elite"
            desc="Professional or competitive athlete"
            selected={form.athlete_profile === 'elite'}
            onClick={() => setForm(f => ({ ...f, athlete_profile: 'elite' }))}
          />
        </div>
      </div>

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

    </div>
  )
}

// ── Step 3: Product preferences ───────────────────────────────────────────────

function StepThree({ form, setForm }) {
  const gels = products.filter(p => p.type === 'gel' && isAvailableInRegion(p, detectRegion))
  const bars = products.filter(p => p.type === 'bar' && isAvailableInRegion(p, detectRegion))

  function toggleProduct(id) {
    setForm(f => {
      const current = f.preferred_product_ids
      return current.includes(id)
        ? { ...f, preferred_product_ids: current.filter(x => x !== id) }
        : { ...f, preferred_product_ids: [...current, id] }
    })
  }

  return (
    <div className="space-y-7">
      <p className="text-sm text-gray-500 -mt-2">
        Pick your favourite flavours — your plan uses these. For longer races we'll mix them up for
        variety. No preference? We'll choose a balanced mix for you.
      </p>

      {/* Gels */}
      <div>
        <FieldLabel>Energy gels</FieldLabel>
        <div className="space-y-2">
          {gels.map(gel => (
            <ProductPreferenceCard
              key={gel.id}
              product={gel}
              selected={form.preferred_product_ids.includes(gel.id)}
              onToggle={() => toggleProduct(gel.id)}
            />
          ))}
        </div>
      </div>

      {/* Bars */}
      <div>
        <FieldLabel>Energy bars</FieldLabel>
        <div className="space-y-2">
          {bars.map(bar => (
            <ProductPreferenceCard
              key={bar.id}
              product={bar}
              selected={form.preferred_product_ids.includes(bar.id)}
              onToggle={() => toggleProduct(bar.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Step validation ───────────────────────────────────────────────────────────

function isStep1Valid(form) {
  return (
    form.custom_km !== '' &&
    form.race_type !== '' &&
    form.surface_type !== '' &&
    goalMinutesFromParts(form.goal_time_h, form.goal_time_m) !== null
  )
}

function isStep2Valid(form) {
  return (
    toKg(form.weight_value, form.weight_unit) !== null &&
    form.gender          !== '' &&
    form.conditions      !== '' &&
    form.effort          !== '' &&
    form.athlete_profile !== '' &&
    form.caffeine_ok     !== null
  )
}

function isStep3Valid(_form) {
  return true // preferences are always optional — defaults used if nothing selected
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StepForm({ onComplete }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    // Step 1
    race_name:         '',
    custom_km:         '',
    custom_km_display: '',
    dist_unit:         'km',
    surface_type:      '',
    race_type:         '',
    goal_time_h:       '',
    goal_time_m:       '',
    elevation_gain_m:  0,
    elev_display:      '',
    elev_unit:         'm',
    gpx_parsed:        false,
    // Step 2
    weight_value:    '70',
    weight_unit:     'kg',
    gender:          '',
    conditions:      '',
    effort:          '',
    athlete_profile: '',
    caffeine_ok:     null,
    // Step 3
    preferred_product_ids: [],
  })

  const stepValid = { 1: isStep1Valid(form), 2: isStep2Valid(form), 3: isStep3Valid(form) }
  const canAdvance = stepValid[step]

  function handleNext() {
    if (step < 3) {
      setStep(s => s + 1)
      return
    }
    const weight_kg    = toKg(form.weight_value, form.weight_unit)
    const goal_minutes = goalMinutesFromParts(form.goal_time_h, form.goal_time_m)

    const targets   = calculateTargets({
      race_type:        form.race_type,
      goal_minutes,
      weight_kg,
      gender:           form.gender,
      conditions:       form.conditions,
      effort:           form.effort,
      caffeine_ok:      form.caffeine_ok,
      athlete_profile:  form.athlete_profile,
      elevation_gain_m: form.elevation_gain_m,
      distance_km:      parseFloat(form.custom_km) || 0,
    })
    const selection = selectProducts(targets, form.preferred_product_ids, detectRegion)

    // Reconstruct goal_time string for the send-plan API and plan recording
    const h = parseInt(form.goal_time_h, 10)
    const m = parseInt(form.goal_time_m, 10)
    const formOut = { ...form, goal_time: `${h}:${String(m).padStart(2, '0')}` }

    onComplete({ targets, selection, form: formOut })
  }

  return (
    <div className="bg-white">

      {/* ── Progress bar ── */}
      <div className="w-full h-1 bg-gray-100" aria-hidden="true">
        <div
          className="h-1 bg-[#48C4B0] transition-all duration-500 ease-in-out"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      {/* ── Logo + Step header ── */}
      <div className="max-w-md mx-auto w-full px-5 pt-6 pb-4">
        <img src="/logo.svg" alt="Lecka" className="h-7 mb-5" />
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Step {step} of 3
        </p>
        <h1 className="text-2xl font-bold text-[#1B1B1B] mt-1">
          {STEP_TITLES[step - 1]}
        </h1>
      </div>

      {/* ── Step content ── */}
      <div className="max-w-md mx-auto w-full px-5 pb-4">
        {step === 1 && <StepOne form={form} setForm={setForm} />}
        {step === 2 && <StepTwo form={form} setForm={setForm} />}
        {step === 3 && <StepThree form={form} setForm={setForm} />}
      </div>

      {/* ── Navigation — follows content naturally, no flex-1 stretch ── */}
      <div className="max-w-md mx-auto w-full px-5 py-5 flex items-center gap-3 border-t border-gray-100">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            className="min-h-[48px] px-5 rounded-xl border-2 border-gray-200
                       text-sm font-medium text-[#1B1B1B]
                       hover:border-[#48C4B0] transition-colors"
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
              ? 'bg-[#F64866] text-white hover:bg-[#e03558] active:bg-[#cc2e4e]'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed',
          ].join(' ')}
        >
          {step === 3 ? 'Build my plan' : 'Next'}
        </button>
      </div>

    </div>
  )
}
