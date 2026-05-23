import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Nav from './Nav.jsx'
import { calculateTargets } from '../engine/nutrition-engine'
import { selectProducts }   from '../engine/product-selector'
import { goalMinutesFromFields } from '../utils/form-helpers.js'
import WeightInput, { toKg } from './shared/WeightInput.jsx'
import ProductPreferencePicker from './shared/ProductPreferencePicker.jsx'
import FALLBACK_PRODUCTS from '../config/products.json'
import { useProducts }   from '../hooks/useProducts.js'
import { getSavedRegion, saveRegion } from '../embed.js'
import regionsConfig from '../config/regions.json'

const RACE_OPTIONS = [
  { key: '5k',            label: '5 km'          },
  { key: '10k',           label: '10 km'         },
  { key: 'half_marathon', label: 'Half marathon' },
  { key: 'marathon',      label: 'Marathon'      },
  { key: 'ultra_50k',     label: 'Ultra 50 km'   },
  { key: 'ultra_100k',    label: 'Ultra 100 km+' },
  { key: 'cycling',       label: 'Cycling'       },
  { key: 'triathlon',     label: 'Triathlon'     },
  { key: 'custom',        label: 'Other / Custom'},
]

const TRIATHLON_OPTIONS = [
  { key: 'triathlon_sprint',  label: 'Sprint',  sublabel: '750m swim · 20km bike · 5km run',    km: 51   },
  { key: 'triathlon_olympic', label: 'Olympic', sublabel: '1.5km swim · 40km bike · 10km run',  km: 51.5 },
  { key: 'triathlon_70_3',    label: '70.3',    sublabel: '1.9km swim · 90km bike · 21km run',  km: 113  },
  { key: 'triathlon_140_6',   label: 'Ironman', sublabel: '3.8km swim · 180km bike · 42km run', km: 226  },
]

const TEMPERATURE_OPTIONS = [
  { key: 'cool', emoji: '❄️', label: 'Cool', range: '< 10 °C' },
  { key: 'mild', emoji: '🌤', label: 'Mild', range: '10–20 °C' },
  { key: 'warm', emoji: '☀️', label: 'Warm', range: '20–28 °C' },
  { key: 'hot',  emoji: '🔥', label: 'Hot',  range: '> 28 °C' },
]

const HUMIDITY_OPTIONS = [
  { key: 'dry',   label: 'Dry',   range: '< 60 %' },
  { key: 'humid', label: 'Humid', range: '≥ 60 %' },
]

function deriveConditions(temperature, humidity) {
  if (temperature === 'cool') return 'cool'
  if (temperature === 'mild') return humidity === 'humid' ? 'warm' : 'mild'
  if (temperature === 'warm') return humidity === 'humid' ? 'humid' : 'warm'
  // hot
  return 'hot'
}

function mapCustomDistToRaceType(km) {
  if (km < 7.5)  return '5k'
  if (km < 12.5) return '10k'
  if (km < 22.5) return 'half_marathon'
  if (km < 40)   return 'marathon'
  if (km < 75)   return 'ultra_50k'
  return 'ultra_100k'
}

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
  race_name:              '',
  race_date:              '',
  race_type:              '',
  triathlon_type:         '',
  custom_race_km:         '',
  custom_race_unit:       'km',
  goal_time_h:            '',
  goal_time_m:            '',
  temperature:            'mild',
  humidity:               'dry',
  gender:                 '',
  weight_value:           '',
  weight_unit:            'kg',
  caffeine_ok:            null,
  product_preference_mode: 'suggested',
  preferred_product_ids:  [],
  email:                  '',
}

export default function SimpleForm({ onComplete }) {
  const { t } = useTranslation(['form', 'common'])
  const [form,       setForm]       = useState(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [region,     setRegion]     = useState(() => getSavedRegion() ?? null)

  function handleRegionSelect(key) {
    setRegion(key)
    saveRegion(key)
  }

  const { products: liveProducts } = useProducts()
  const catalog = liveProducts ?? FALLBACK_PRODUCTS

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('lecka_homepage_prefill')
      if (!raw) return
      sessionStorage.removeItem('lecka_homepage_prefill')
      const prefill = JSON.parse(raw)
      const isTriSub = TRIATHLON_OPTIONS.some(o => o.key === prefill.race_type)
      setForm(f => ({
        ...f,
        race_type:      isTriSub ? 'triathlon' : (prefill.race_type ?? f.race_type),
        triathlon_type: isTriSub ? prefill.race_type : (prefill.triathlon_type ?? f.triathlon_type ?? ''),
        goal_time_h:    prefill.goal_time_h ?? f.goal_time_h,
        goal_time_m:    prefill.goal_time_m ?? f.goal_time_m,
      }))
    } catch {
      // malformed sessionStorage — silently ignore
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          if (data.caffeine_ok != null && f.caffeine_ok === null) {
            patch.caffeine_ok = data.caffeine_ok
          }

          return { ...f, ...patch }
        })
      })
      .catch(() => {})
  }, [])

  const goalMinutes = goalMinutesFromFields(form.goal_time_h, form.goal_time_m)
  const goalValid   = goalMinutes !== null
  const conditions  = deriveConditions(form.temperature, form.humidity)

  const customKm = form.race_type === 'custom'
    ? (form.custom_race_unit === 'mi'
        ? parseFloat(form.custom_race_km) * 1.60934
        : parseFloat(form.custom_race_km))
    : null
  const resolvedRaceType =
    form.race_type === 'custom'
      ? (customKm > 0 ? mapCustomDistToRaceType(customKm) : '')
      : form.race_type === 'triathlon'
        ? (form.triathlon_type || '')
        : form.race_type

  const canSubmit = resolvedRaceType !== '' && goalValid && !submitting &&
    (form.race_type !== 'custom' || (parseFloat(form.custom_race_km) > 0))

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

    const weight_kg  = toKg(form.weight_value, form.weight_unit) ?? SIMPLE_DEFAULTS.weight_kg
    const gender     = form.gender !== '' ? form.gender : SIMPLE_DEFAULTS.gender
    const caffeine_ok = form.caffeine_ok !== null ? form.caffeine_ok : true
    const preferred_product_ids = form.product_preference_mode === 'suggested'
      ? []
      : form.preferred_product_ids

    const triathlonKm = form.race_type === 'triathlon'
      ? (TRIATHLON_OPTIONS.find(o => o.key === form.triathlon_type)?.km ?? 0)
      : null

    const engineInputs = {
      race_type:        resolvedRaceType,
      goal_minutes:     goalMinutes,
      weight_kg,
      gender,
      conditions,
      effort:           SIMPLE_DEFAULTS.effort,
      caffeine_ok,
      elevation_gain_m: SIMPLE_DEFAULTS.elevation_gain_m,
      distance_km:      triathlonKm ?? customKm ?? SIMPLE_DEFAULTS.distance_km,
      athlete_profile:  SIMPLE_DEFAULTS.athlete_profile,
      training_mode:    SIMPLE_DEFAULTS.training_mode,
    }

    const targets   = calculateTargets(engineInputs)
    const selection = selectProducts(targets, catalog, {
      fuelling_style:        'gels_only',
      preferred_product_ids,
      want_addons:           false,
      addon_items:           [],
    })

    const outForm = {
      race_name:              form.race_name.trim(),
      race_date:              form.race_date,
      race_type:              resolvedRaceType,
      custom_race_km:         customKm ?? 0,
      goal_time:              goalTimeFormatted,
      goal_time_h:            form.goal_time_h,
      goal_time_m:            form.goal_time_m,
      conditions,
      temperature:            form.temperature,
      humidity:               form.humidity,
      gender,
      weight_value:           form.weight_value || '70',
      weight_unit:            form.weight_unit,
      email:                  form.email,
      athlete_profile:        SIMPLE_DEFAULTS.athlete_profile,
      caffeine_ok,
      preferred_product_ids,
      product_preference_mode: form.product_preference_mode,
      surface_type:           form.race_type === 'triathlon' ? 'road' : '',
      elevation_gain_m:       0,
      dist_unit:              'km',
      fuelling_style:         'gels_only',
      addon_items:            [],
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

          {/* 0. Region */}
          <div className="mb-8">
            <SectionLabel>{t('form:steps.region')}</SectionLabel>
            <p className="text-xs text-gray-400 mb-3">We use this to show you available products and local pricing.</p>

            {/* All non-international countries */}
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(regionsConfig)
                .filter(([, cfg]) => cfg.type !== 'international')
                .map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleRegionSelect(key)}
                    className={[
                      'px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors',
                      region === key
                        ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                        : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#48C4B0]',
                    ].join(' ')}
                  >
                    {cfg.label}
                  </button>
                ))}
            </div>

            {/* International */}
            {Object.entries(regionsConfig).some(([, cfg]) => cfg.type === 'international') && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-2">Other</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(regionsConfig)
                    .filter(([, cfg]) => cfg.type === 'international')
                    .map(([key, cfg]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleRegionSelect(key)}
                        className={[
                          'px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors',
                          region === key
                            ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                            : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#48C4B0]',
                        ].join(' ')}
                      >
                        {cfg.label}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* 1. Race name */}
          <div className="mb-8">
            <SectionLabel>{t('form:simple.raceName')}</SectionLabel>
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
            <SectionLabel>{t('form:simple.raceDate')}</SectionLabel>
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
            <SectionLabel>{t('form:simple.raceType')}</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {RACE_OPTIONS.map(opt => (
                <Pill
                  key={opt.key}
                  label={opt.label}
                  selected={form.race_type === opt.key}
                  onClick={() => setForm(f => ({ ...f, race_type: opt.key, triathlon_type: '' }))}
                />
              ))}
            </div>

            {/* Triathlon sub-options */}
            {form.race_type === 'triathlon' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {TRIATHLON_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, triathlon_type: opt.key }))}
                    className={[
                      'px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-colors',
                      form.triathlon_type === opt.key
                        ? 'bg-[#48C4B0] border-[#48C4B0] text-white'
                        : 'bg-white border-gray-200 text-gray-600',
                    ].join(' ')}
                  >
                    {opt.label}
                    <span className="font-normal opacity-60 ml-1">{opt.sublabel}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Custom distance input */}
            {form.race_type === 'custom' && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="500"
                  placeholder="Distance"
                  value={form.custom_race_km}
                  onChange={e => setForm(f => ({ ...f, custom_race_km: e.target.value }))}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 text-center
                             text-lg font-semibold focus:outline-none focus:border-[#48C4B0] text-[#1B1B1B]"
                />
                <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden">
                  {['km', 'mi'].map(u => (
                    <button key={u} type="button"
                      onClick={() => setForm(f => ({ ...f, custom_race_unit: u }))}
                      className={[
                        'px-4 py-3 text-sm font-medium transition-colors',
                        form.custom_race_unit === u
                          ? 'bg-[#48C4B0] text-white'
                          : 'bg-white text-gray-500 hover:bg-gray-50',
                      ].join(' ')}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {form.race_type === 'custom' && parseFloat(form.custom_race_km) > 0 && (
              <p className="text-xs text-[#48C4B0] mt-1.5 font-medium">
                Mapped to {resolvedRaceType.replace(/_/g, ' ')} nutrition targets
              </p>
            )}
          </div>

          {/* 4. Goal time */}
          <div className="mb-8">
            <SectionLabel>{t('form:simple.goalTime')}</SectionLabel>
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
            <SectionLabel>{t('form:simple.conditions')}</SectionLabel>

            {/* Temperature */}
            <p className="text-xs text-gray-400 mb-2">Temperature</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {TEMPERATURE_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, temperature: opt.key }))}
                  className={[
                    'flex flex-col items-center justify-center gap-0.5',
                    'min-h-[64px] rounded-xl border-2 transition-colors px-1',
                    form.temperature === opt.key
                      ? 'border-[#48C4B0] bg-[#48C4B0]/10'
                      : 'border-gray-200 bg-white',
                  ].join(' ')}
                >
                  <span className="text-xl">{opt.emoji}</span>
                  <span className="text-xs font-medium text-gray-700">{opt.label}</span>
                  <span className="text-[10px] text-gray-400">{opt.range}</span>
                </button>
              ))}
            </div>

            {/* Humidity */}
            <p className="text-xs text-gray-400 mb-2">Humidity</p>
            <div className="flex gap-2">
              {HUMIDITY_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, humidity: opt.key }))}
                  className={[
                    'flex-1 flex flex-col items-center justify-center gap-0.5',
                    'min-h-[52px] rounded-xl border-2 transition-colors',
                    form.humidity === opt.key
                      ? 'border-[#48C4B0] bg-[#48C4B0]/10'
                      : 'border-gray-200 bg-white',
                  ].join(' ')}
                >
                  <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                  <span className="text-[10px] text-gray-400">{opt.range}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 6. Gender */}
          <div className="mb-8">
            <SectionLabel>{t('form:simple.gender')}</SectionLabel>
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
            <SectionLabel>{t('form:simple.weight')}</SectionLabel>
            <WeightInput
              value={form.weight_value}
              unit={form.weight_unit}
              onChange={(value, unit) => setForm(f => ({ ...f, weight_value: value, weight_unit: unit }))}
            />
            <p className="text-xs text-gray-400 mt-1">
              Used to personalise your sodium and fluid targets.
            </p>
          </div>

          {/* 8. Caffeine */}
          <div className="mb-8">
            <SectionLabel>{t('form:simple.caffeine')}</SectionLabel>
            <div className="flex gap-2">
              <div className="flex-1">
                <Pill
                  label="Yes please"
                  selected={form.caffeine_ok === true}
                  onClick={() => setForm(f => ({ ...f, caffeine_ok: f.caffeine_ok === true ? null : true }))}
                />
              </div>
              <div className="flex-1">
                <Pill
                  label="No caffeine"
                  selected={form.caffeine_ok === false}
                  onClick={() => setForm(f => ({ ...f, caffeine_ok: f.caffeine_ok === false ? null : false }))}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Affects which gel flavours appear in your plan.</p>
          </div>

          {/* 9. Lecka flavour preference */}
          <div className="mb-8">
            <SectionLabel>{t('form:simple.flavour')}</SectionLabel>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, product_preference_mode: 'suggested' }))}
                className={[
                  'w-full px-4 py-3 rounded-xl border-2 text-left transition-colors',
                  form.product_preference_mode === 'suggested'
                    ? 'border-[#48C4B0] bg-[#48C4B0]/5'
                    : 'border-gray-200 bg-white hover:border-[#48C4B0]/50',
                ].join(' ')}
              >
                <p className={`text-sm font-semibold ${form.product_preference_mode === 'suggested' ? 'text-[#48C4B0]' : 'text-[#1B1B1B]'}`}>
                  {t('form:simple.suggestForMe')}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{t('form:simple.suggestForMe.desc')}</p>
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, product_preference_mode: 'pick' }))}
                className={[
                  'w-full px-4 py-3 rounded-xl border-2 text-left transition-colors',
                  form.product_preference_mode === 'pick'
                    ? 'border-[#48C4B0] bg-[#48C4B0]/5'
                    : 'border-gray-200 bg-white hover:border-[#48C4B0]/50',
                ].join(' ')}
              >
                <p className={`text-sm font-semibold ${form.product_preference_mode === 'pick' ? 'text-[#48C4B0]' : 'text-[#1B1B1B]'}`}>
                  {t('form:simple.pickFavourites')}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{t('form:simple.pickFavourites.desc')}</p>
              </button>
            </div>
            {form.product_preference_mode === 'pick' && (
              <div className="mt-4">
                <ProductPreferencePicker
                  preferredProductIds={form.preferred_product_ids}
                  onToggle={(id) =>
                    setForm(f => ({
                      ...f,
                      preferred_product_ids: f.preferred_product_ids.includes(id)
                        ? f.preferred_product_ids.filter(x => x !== id)
                        : [...f.preferred_product_ids, id],
                    }))
                  }
                  region={region ?? 'us'}
                  caffeineOk={form.caffeine_ok !== false}
                />
              </div>
            )}
          </div>

          {/* 10. Email (optional) */}
          <div className="mb-8">
            <p className="text-xs text-gray-400 mb-2">
              {t('form:simple.email')}
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
            {submitting ? t('form:simple.buildingPlan') : t('form:simple.buildPlan')}
          </button>

        </form>
      </div>
    </div>
  )
}
