import React, { useState, useEffect } from 'react'
import Nav from './Nav.jsx'
import { calculateTargets } from '../engine/nutrition-engine'
import { selectProducts }   from '../engine/product-selector'
import { goalMinutesFromFields } from '../utils/form-helpers.js'
import WeightInput, { toKg } from './shared/WeightInput.jsx'
import FALLBACK_PRODUCTS from '../config/products.json'
import { useProducts }   from '../hooks/useProducts.js'

const RACE_OPTIONS = [
  { key: '5k',              label: '5 km' },
  { key: '10k',             label: '10 km' },
  { key: 'half_marathon',   label: 'Half marathon' },
  { key: 'marathon',        label: 'Marathon' },
  { key: 'ultra_50k',       label: 'Ultra 50 km' },
  { key: 'ultra_100k',      label: 'Ultra 100 km+' },
  { key: 'triathlon_70_3',  label: '70.3 Triathlon' },
  { key: 'triathlon_140_6', label: 'Ironman 140.6' },
]

const CONDITION_OPTIONS = [
  { key: 'cool',  emoji: '❄️',  label: 'Cool' },
  { key: 'mild',  emoji: '🌤',  label: 'Mild' },
  { key: 'warm',  emoji: '☀️',  label: 'Warm' },
  { key: 'hot',   emoji: '🔥',  label: 'Hot' },
  { key: 'humid', emoji: '💧', label: 'Humid' },
]

const SIMPLE_DEFAULTS = {
  weight_kg:        70,
  gender:           'other',
  athlete_profile:  'intermediate',
  caffeine_ok:      true,
  elevation_gain_m: 0,
  distance_km:      0,
  effort:           'race_pace',
  training_mode:    false,
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

function Pill({ label, selected, onClick }) {
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
      {label}
    </button>
  )
}

const DEFAULT_FORM = {
  race_name:    '',
  race_date:    '',
  race_type:    '',
  goal_time_h:  '',
  goal_time_m:  '',
  conditions:   'mild',
  gender:       '',
  weight_value: '',
  weight_unit:  'kg',
  email:        '',
}

export default function SimpleForm({ onComplete }) {
  const [form,       setForm]       = useState(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)

  const { products: liveProducts } = useProducts()
  const catalog = liveProducts ?? FALLBACK_PRODUCTS

  useEffect(() => {
    const userId = localStorage.getItem('lecka_user_id')
    if (!userId) return
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${userId}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setForm(f => {
          const patch = {}

          if (data.weight_kg != null && f.weight_value === '') {
            const unit       = data.weight_unit === 'lb' ? 'lb' : 'kg'
            const displayVal = unit === 'lb'
              ? String(Math.round(data.weight_kg * 2.20462))
              : String(Math.round(data.weight_kg))
            patch.weight_value = displayVal
            patch.weight_unit  = unit
          }
          if (data.gender && f.gender === '') {
            patch.gender = data.gender
          }

          return { ...f, ...patch }
        })
      })
      .catch(() => {})
  }, [])

  const goalMinutes = goalMinutesFromFields(form.goal_time_h, form.goal_time_m)
  const goalValid   = goalMinutes !== null
  const canSubmit   = form.race_type !== '' && goalValid && !submitting

  function buildGoalLabel() {
    if (!goalValid) return null
    const h = Math.floor(goalMinutes / 60)
    const m = goalMinutes % 60
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)

    const h = Math.floor(goalMinutes / 60)
    const m = goalMinutes % 60
    const goalTimeFormatted = h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `0:${String(m).padStart(2, '0')}`

    const weight_kg = toKg(form.weight_value, form.weight_unit) ?? SIMPLE_DEFAULTS.weight_kg
    const gender    = form.gender !== '' ? form.gender : SIMPLE_DEFAULTS.gender

    const engineInputs = {
      race_type:        form.race_type,
      goal_minutes:     goalMinutes,
      weight_kg,
      gender,
      conditions:       form.conditions,
      effort:           SIMPLE_DEFAULTS.effort,
      caffeine_ok:      SIMPLE_DEFAULTS.caffeine_ok,
      elevation_gain_m: SIMPLE_DEFAULTS.elevation_gain_m,
      distance_km:      SIMPLE_DEFAULTS.distance_km,
      athlete_profile:  SIMPLE_DEFAULTS.athlete_profile,
      training_mode:    SIMPLE_DEFAULTS.training_mode,
    }

    const targets   = calculateTargets(engineInputs)
    const selection = selectProducts(targets, catalog, {
      fuelling_style:        'gels_only',
      preferred_product_ids: [],
      want_addons:           false,
      addon_items:           [],
    })

    const outForm = {
      race_name:        form.race_name.trim(),
      race_date:        form.race_date,
      race_type:        form.race_type,
      goal_time:        goalTimeFormatted,
      goal_time_h:      form.goal_time_h,
      goal_time_m:      form.goal_time_m,
      conditions:       form.conditions,
      gender:           gender,
      weight_value:     form.weight_value || '70',
      weight_unit:      form.weight_unit,
      email:            form.email,
      athlete_profile:  SIMPLE_DEFAULTS.athlete_profile,
      caffeine_ok:      SIMPLE_DEFAULTS.caffeine_ok,
      surface_type:     '',
      elevation_gain_m: 0,
      dist_unit:        'km',
      fuelling_style:   'gels_only',
      addon_items:      [],
    }

    onComplete({
      mode:               'simple',
      targets,
      selection,
      form:               outForm,
      resolvedAddonItems: [],
      addonCoverage:      null,
      foundationTargets:  targets,
    })
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="bg-white min-h-screen">
      <Nav />

      <div className="max-w-lg mx-auto px-6 pt-8 pb-16">
        <form onSubmit={handleSubmit} noValidate>

          {/* 1. Race name */}
          <div className="mb-8">
            <SectionLabel>Race name</SectionLabel>
            <input
              type="text"
              placeholder="e.g. Cape Town Marathon 2026"
              value={form.race_name}
              onChange={e => setForm(f => ({ ...f, race_name: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm
                         focus:outline-none focus:border-[#48C4B0] text-[#1B1B1B]"
            />
            <p className="text-xs text-gray-400 mt-1.5">Optional — shown on your plan</p>
          </div>

          {/* 2. Race date */}
          <div className="mb-8">
            <SectionLabel>Race date</SectionLabel>
            <input
              type="date"
              value={form.race_date}
              min={today}
              onChange={e => setForm(f => ({ ...f, race_date: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm
                         focus:outline-none focus:border-[#48C4B0] text-[#1B1B1B]"
            />
            <p className="text-xs text-gray-400 mt-1.5">Optional — helps track your countdown</p>
          </div>

          {/* 3. Race type */}
          <div className="mb-8">
            <SectionLabel>What are you racing?</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {RACE_OPTIONS.map(opt => (
                <Pill
                  key={opt.key}
                  label={opt.label}
                  selected={form.race_type === opt.key}
                  onClick={() => setForm(f => ({ ...f, race_type: opt.key }))}
                />
              ))}
            </div>
          </div>

          {/* 4. Goal time */}
          <div className="mb-8">
            <SectionLabel>Your goal time</SectionLabel>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="200"
                  placeholder="h"
                  value={form.goal_time_h}
                  onChange={e => setForm(f => ({ ...f, goal_time_h: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center
                             text-lg font-semibold focus:outline-none focus:border-[#48C4B0]
                             text-[#1B1B1B]"
                />
                <p className="text-xs text-center text-gray-400 mt-1">hours</p>
              </div>
              <span className="text-2xl font-bold text-gray-300 mb-4">:</span>
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="mm"
                  value={form.goal_time_m}
                  onChange={e => setForm(f => ({ ...f, goal_time_m: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center
                             text-lg font-semibold focus:outline-none focus:border-[#48C4B0]
                             text-[#1B1B1B]"
                />
                <p className="text-xs text-center text-gray-400 mt-1">minutes</p>
              </div>
            </div>
            {goalValid && (
              <p className="text-sm text-[#48C4B0] font-medium mt-2">
                {buildGoalLabel()} — your plan will be built for this finish time.
              </p>
            )}
          </div>

          {/* 5. Race conditions */}
          <div className="mb-8">
            <SectionLabel>Expected conditions on race day</SectionLabel>
            <div className="flex gap-2">
              {CONDITION_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, conditions: opt.key }))}
                  className={[
                    'flex-1 flex flex-col items-center justify-center gap-1',
                    'min-h-[64px] rounded-xl border-2 transition-colors',
                    form.conditions === opt.key
                      ? 'border-[#48C4B0] bg-[#48C4B0]/10'
                      : 'border-gray-200 bg-white',
                  ].join(' ')}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-xs text-gray-500">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 6. Gender */}
          <div className="mb-8">
            <SectionLabel>You are</SectionLabel>
            <div className="flex gap-2">
              {[
                { key: 'female', label: 'Female' },
                { key: 'male',   label: 'Male'   },
              ].map(g => (
                <Pill
                  key={g.key}
                  label={g.label}
                  selected={form.gender === g.key}
                  onClick={() => setForm(f => ({ ...f, gender: f.gender === g.key ? '' : g.key }))}
                />
              ))}
            </div>
          </div>

          {/* 7. Weight */}
          <div className="mb-8">
            <SectionLabel>Your weight</SectionLabel>
            <WeightInput
              value={form.weight_value}
              unit={form.weight_unit}
              onChange={(value, unit) => setForm(f => ({ ...f, weight_value: value, weight_unit: unit }))}
            />
            <p className="text-xs text-gray-400 mt-1">
              Used to personalise your sodium and fluid targets.
            </p>
          </div>

          {/* 8. Email (optional) */}
          <div className="mb-8">
            <p className="text-xs text-gray-400 mb-2">
              Your email — get your plan as a PDF
            </p>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm
                         focus:outline-none focus:border-[#48C4B0] text-[#1B1B1B]"
            />
            <p className="text-xs text-gray-400 mt-1.5">Optional — plan generates either way.</p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full min-h-[56px] bg-[#F64866] hover:bg-[#e03558] text-white
                       rounded-2xl text-base font-bold transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Building your plan…' : 'Build my plan →'}
          </button>

        </form>
      </div>
    </div>
  )
}
