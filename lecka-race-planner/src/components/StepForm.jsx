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

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { calculateTargets } from '../engine/nutrition-engine'
import { needsDualTransporter, computeAddonCoverage, computeFoundationTargets } from '../engine/kit-calculator.js'
import { selectProducts }   from '../engine/product-selector'
import products             from '../config/products.json'
import competitorProductsData from '../config/competitor-products.json'
import { parseGPX, estimateElevationImpact } from '../utils/gpx-parser.js'
import { detectRegion }     from '../embed.js'
import { isAvailableInRegion } from '../engine/region-utils.js'
import LanguageSwitcher     from './LanguageSwitcher.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function goalMinutesFromFields(h, m) {
  const hours = parseInt(h, 10)
  const mins  = parseInt(m, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  if (hours < 0 || hours > 200) return null
  if (mins < 0 || mins > 59) return null
  const total = hours * 60 + mins
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

const TRIATHLON_OPTIONS = [
  { key: 'triathlon_sprint',  label: 'Sprint',  sublabel: '750m swim · 20km bike · 5km run',    km: 51    },
  { key: 'triathlon_olympic', label: 'Olympic', sublabel: '1.5km swim · 40km bike · 10km run',  km: 51.5  },
  { key: 'triathlon_70_3',    label: '70.3',    sublabel: '1.9km swim · 90km bike · 21km run',  km: 113   },
  { key: 'triathlon_140_6',   label: 'Ironman', sublabel: '3.8km swim · 180km bike · 42km run', km: 226   },
]

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

// ── Session draft persistence ─────────────────────────────────────────────────

const DRAFT_KEY = 'lecka_form_draft'

const DEFAULT_FORM = {
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
  sport:             'running',
  triathlon_type:    '',
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
  fuelling_style: 'gels_only',
  // Step 4
  want_addons: false,
  addon_items: [],
}

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw)
    // Discard drafts where the user hadn't entered any race info yet
    if (!draft.race_type && !draft.custom_km && !draft.triathlon_type) return null
    // Merge onto defaults so newly added fields always have a safe value
    return { ...DEFAULT_FORM, ...draft }
  } catch {
    return null
  }
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

function ProductPreferenceCard({ product, selected, onToggle, t }) {
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
            <span className="text-xs text-gray-400">{t('form:product.carbs', { value: product.carbs_per_unit })}</span>
            <span className="text-xs text-gray-400">{t('form:product.sodium', { value: product.sodium_per_unit })}</span>
            {product.caffeine && (
              <span className="text-xs font-medium text-[#48C4B0]">{t('form:product.caffeine', { value: product.caffeine_mg })}</span>
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
  const { t } = useTranslation(['form', 'common'])
  const [gpxError, setGpxError] = useState(false)

  const goalMinutes   = goalMinutesFromFields(form.goal_time_h, form.goal_time_m)
  const hTouched      = form.goal_time_h !== ''
  const mTouched      = form.goal_time_m !== ''
  const timeIsInvalid = (hTouched || mTouched) && goalMinutes === null

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
        <FieldLabel>{t('form:field.raceName')}</FieldLabel>
        <input
          type="text"
          placeholder={t('form:field.raceName.placeholder')}
          value={form.race_name}
          onChange={e => setForm(f => ({ ...f, race_name: e.target.value }))}
          className="w-full border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200
                     focus:outline-none focus:border-[#48C4B0]"
        />
        <p className="text-xs text-gray-400 mt-1.5">{t('form:field.raceName.hint')}</p>
      </div>

      {/* Sport selector */}
      <div>
        <FieldLabel>{t('form:field.sport')}</FieldLabel>
        <div className="flex gap-2">
          <Pill
            label={t('form:field.sport.running')}
            selected={form.sport === 'running'}
            onClick={() => setForm(f => ({
              ...f,
              sport:          'running',
              triathlon_type: '',
              race_type:      f.custom_km ? distanceToRaceType(parseFloat(f.custom_km)) : '',
            }))}
          />
          <Pill
            label={t('form:field.sport.triathlon')}
            selected={form.sport === 'triathlon'}
            onClick={() => setForm(f => ({
              ...f,
              sport:          'triathlon',
              triathlon_type: '',
              race_type:      '',
              surface_type:   'road',
            }))}
          />
        </div>
      </div>

      {/* Running-specific: GPX upload, distance, elevation, surface */}
      {form.sport === 'running' && (
        <>
          {/* GPX upload */}
          <div>
            <FieldLabel>{t('form:field.gpx')}</FieldLabel>
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
                {t('form:field.gpx.drop')}
              </p>
              <p className="text-xs text-gray-400 text-center">
                {t('form:field.gpx.hint')}
              </p>
            </label>
            {form.gpx_parsed && !gpxError && (
              <p className="text-xs text-[#48C4B0] mt-1.5">
                {t('form:field.gpx.loaded', { km: form.custom_km, elevation: form.elevation_gain_m, label: gpxSummaryLabel })}
              </p>
            )}
            {gpxError && (
              <p className="text-xs text-red-400 mt-1.5">
                {t('form:field.gpx.error')}
              </p>
            )}
          </div>

          {/* Distance */}
          <div>
            <FieldLabel>{t('form:field.distance')}</FieldLabel>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                maxLength={5}
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
                {t('form:field.distance.hint', { value: form.custom_km_display, unit: form.dist_unit })}
              </p>
            )}
          </div>

          {/* Elevation gain */}
          <div>
            <FieldLabel>{t('form:field.elevation')}</FieldLabel>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={5}
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
              <p className="text-xs text-[#48C4B0] mt-1.5">{t('form:field.elevation.hintGpx', { label: gpxSummaryLabel })}</p>
            ) : (
              <p className="text-xs text-gray-400 mt-1.5">
                {t('form:field.elevation.hintDefault')}
              </p>
            )}
          </div>

          {/* Surface */}
          <div>
            <FieldLabel>{t('form:field.surface')}</FieldLabel>
            <div className="flex gap-2">
              {[
                { label: t('common:surface.road'),  key: 'road'  },
                { label: t('common:surface.trail'), key: 'trail' },
              ].map(s => (
                <Pill
                  key={s.key}
                  label={s.label}
                  selected={form.surface_type === s.key}
                  onClick={() => setForm(f => ({ ...f, surface_type: s.key }))}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Triathlon discipline selector */}
      {form.sport === 'triathlon' && (
        <div>
          <FieldLabel>{t('form:field.triathlonType')}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {TRIATHLON_OPTIONS.map(opt => (
              <Pill
                key={opt.key}
                label={opt.label}
                sublabel={opt.sublabel}
                selected={form.triathlon_type === opt.key}
                onClick={() => setForm(f => ({
                  ...f,
                  triathlon_type: opt.key,
                  race_type:      opt.key,
                  custom_km:      String(opt.km),
                  surface_type:   'road',
                }))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Goal finish time */}
      <div>
        <FieldLabel>{t('form:field.goalTime')}</FieldLabel>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              placeholder="0"
              value={form.goal_time_h}
              onChange={e => setForm(f => ({ ...f, goal_time_h: e.target.value }))}
              className={[
                'w-16 border-2 rounded-lg px-3 py-2.5 text-sm text-center font-mono',
                'focus:outline-none',
                goalMinutes !== null
                  ? 'border-[#48C4B0]'
                  : timeIsInvalid
                  ? 'border-red-300'
                  : 'border-gray-200 focus:border-[#48C4B0]',
              ].join(' ')}
            />
            <span className="text-xs text-gray-400">{t('form:field.goalTime.hours')}</span>
          </div>
          <span className="text-lg font-semibold text-gray-300 pb-4">:</span>
          <div className="flex flex-col items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              placeholder="00"
              value={form.goal_time_m}
              onChange={e => setForm(f => ({ ...f, goal_time_m: e.target.value }))}
              className={[
                'w-16 border-2 rounded-lg px-3 py-2.5 text-sm text-center font-mono',
                'focus:outline-none',
                goalMinutes !== null
                  ? 'border-[#48C4B0]'
                  : timeIsInvalid
                  ? 'border-red-300'
                  : 'border-gray-200 focus:border-[#48C4B0]',
              ].join(' ')}
            />
            <span className="text-xs text-gray-400">{t('form:field.goalTime.minutes')}</span>
          </div>
        </div>
        {goalMinutes !== null && (
          <p className="text-xs text-[#48C4B0] mt-1.5">
            {t('form:field.goalTime.parsed', { hours: Math.floor(goalMinutes / 60), mins: goalMinutes % 60 })}
          </p>
        )}
        {timeIsInvalid && (
          <p className="text-xs text-red-400 mt-1.5">{t('form:field.goalTime.error')}</p>
        )}
        {!timeIsInvalid && goalMinutes === null && (
          <p className="text-xs text-gray-400 mt-1.5">{t('form:field.goalTime.hint')}</p>
        )}
      </div>

    </div>
  )
}

// ── Step 2: Body, conditions & preferences ────────────────────────────────────

function StepTwo({ form, setForm, showPrefillBadge = false, onDismissPrefill }) {
  const { t } = useTranslation(['form', 'common'])
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

      {/* Pre-fill badge */}
      {showPrefillBadge && (
        <div className="flex items-center justify-between gap-2 bg-[#48C4B0]/10 border border-[#48C4B0]/30 rounded-full px-4 py-2">
          <span className="text-xs font-medium text-[#48C4B0]">Pre-filled from your profile</span>
          <button
            type="button"
            onClick={onDismissPrefill}
            aria-label="Dismiss"
            className="text-[#48C4B0]/60 hover:text-[#48C4B0] text-sm leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* Weight */}
      <div>
        <FieldLabel>{t('form:field.weight')}</FieldLabel>
        <div className="flex items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            maxLength={5}
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
            {t('form:field.weight.error', { min: weightMin, max: weightMax, unit: form.weight_unit })}
          </p>
        )}
      </div>

      {/* Gender */}
      <div>
        <FieldLabel>{t('form:field.gender')}</FieldLabel>
        <div className="flex gap-2">
          {[
            { label: t('common:gender.female'), key: 'female' },
            { label: t('common:gender.male'),   key: 'male'   },
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
        <FieldLabel>{t('form:field.conditions')}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {[
            { label: t('common:conditions.cool'), sublabel: t('form:field.conditions.cool.sub'), key: 'cool' },
            { label: t('common:conditions.mild'), sublabel: t('form:field.conditions.mild.sub'), key: 'mild' },
            { label: t('common:conditions.warm'), sublabel: t('form:field.conditions.warm.sub'), key: 'warm' },
            { label: t('common:conditions.hot'),  sublabel: t('form:field.conditions.hot.sub'),  key: 'hot'  },
          ].map(c => (
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
        <FieldLabel>{t('form:field.effort')}</FieldLabel>
        <div className="space-y-2">
          {[
            { label: t('common:effort.easy'),      desc: t('form:field.effort.easy.desc'),      key: 'easy'      },
            { label: t('common:effort.race_pace'), desc: t('form:field.effort.race_pace.desc'), key: 'race_pace' },
            { label: t('common:effort.hard'),      desc: t('form:field.effort.hard.desc'),      key: 'hard'      },
          ].map(e => (
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
        <FieldLabel>{t('form:field.training')}</FieldLabel>
        <div className="space-y-2">
          <OptionCard
            label={t('form:field.training.untrained')}
            desc={t('form:field.training.untrained.desc')}
            selected={form.athlete_profile === 'untrained'}
            onClick={() => setForm(f => ({ ...f, athlete_profile: 'untrained' }))}
          />
          <OptionCard
            label={t('form:field.training.intermediate')}
            desc={t('form:field.training.intermediate.desc')}
            selected={form.athlete_profile === 'intermediate'}
            onClick={() => setForm(f => ({ ...f, athlete_profile: 'intermediate' }))}
          />
          <OptionCard
            label={t('form:field.training.trained')}
            desc={t('form:field.training.trained.desc')}
            selected={form.athlete_profile === 'trained'}
            onClick={() => setForm(f => ({ ...f, athlete_profile: 'trained' }))}
          />
          <OptionCard
            label={t('form:field.training.elite')}
            desc={t('form:field.training.elite.desc')}
            selected={form.athlete_profile === 'elite'}
            onClick={() => setForm(f => ({ ...f, athlete_profile: 'elite' }))}
          />
        </div>
      </div>

      {/* Caffeine */}
      <div>
        <FieldLabel>{t('form:field.caffeine')}</FieldLabel>
        <div className="flex gap-2">
          <Pill
            label={t('form:field.caffeine.yes')}
            selected={form.caffeine_ok === true}
            onClick={() => setForm(f => ({ ...f, caffeine_ok: true }))}
          />
          <Pill
            label={t('form:field.caffeine.no')}
            selected={form.caffeine_ok === false}
            onClick={() => setForm(f => ({ ...f, caffeine_ok: false }))}
          />
        </div>
      </div>

    </div>
  )
}

// ── Step 3: Fuelling style + product preferences ──────────────────────────────

function StepThree({ form, setForm }) {
  const { t } = useTranslation(['form', 'common'])
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

  const style = form.fuelling_style

  const barLabel = style === 'gels_and_bars'
    ? 'Energy bars (during + around your race)'
    : style === 'drink_mix_base'
    ? 'Energy bars (optional, for variety)'
    : 'Energy bars (for before and after your race)'

  const barSublabel = style === 'drink_mix_base'
    ? 'With a drink mix base, bars are supplementary'
    : style === 'gels_and_bars'
    ? null
    : 'Bars are used pre-race and for recovery — not during'

  return (
    <div className="space-y-7">

      {/* Fuelling style */}
      <div>
        <FieldLabel>Fuelling style</FieldLabel>
        <div className="space-y-2">
          <OptionCard
            label="Gels only"
            desc="Simple and fast — gels are your primary fuel source throughout"
            selected={style === 'gels_only'}
            onClick={() => setForm(f => ({ ...f, fuelling_style: 'gels_only' }))}
          />
          <OptionCard
            label="Gels + bars"
            desc="Real food variety — bars for steady energy, gels when you need a boost"
            selected={style === 'gels_and_bars'}
            onClick={() => setForm(f => ({ ...f, fuelling_style: 'gels_and_bars' }))}
          />
          <OptionCard
            label="Drink mix + gels"
            desc="Continuous carbs from your bottle, gels for intensity spikes"
            selected={style === 'drink_mix_base'}
            onClick={() => setForm(f => ({ ...f, fuelling_style: 'drink_mix_base' }))}
          />
          <OptionCard
            label="Whatever works"
            desc="No strong preference — give me a solid starting plan I can adjust"
            selected={style === 'flexible'}
            onClick={() => setForm(f => ({ ...f, fuelling_style: 'flexible' }))}
          />
        </div>
        {style === 'drink_mix_base' && (
          <p className="text-xs text-[#48C4B0] mt-3">
            Lecka's carb + hydration powder is coming soon.{' '}
            <a
              href="mailto:info@getlecka.com?subject=Carb powder waitlist"
              className="underline"
            >
              Join the waitlist to be first →
            </a>
          </p>
        )}
      </div>

      {/* Product preferences */}
      <p className="text-sm text-gray-500">
        {t('form:field.products.intro')}
      </p>

      {/* Gels */}
      <div>
        <FieldLabel>{t('form:field.gels')}</FieldLabel>
        <div className="space-y-2">
          {gels.map(gel => (
            <ProductPreferenceCard
              key={gel.id}
              product={gel}
              selected={form.preferred_product_ids.includes(gel.id)}
              onToggle={() => toggleProduct(gel.id)}
              t={t}
            />
          ))}
        </div>
      </div>

      {/* Bars */}
      <div>
        <FieldLabel>{barLabel}</FieldLabel>
        {barSublabel && (
          <p className="text-xs text-gray-400 -mt-2 mb-3">{barSublabel}</p>
        )}
        <div className="space-y-2">
          {bars.map(bar => (
            <ProductPreferenceCard
              key={bar.id}
              product={bar}
              selected={form.preferred_product_ids.includes(bar.id)}
              onToggle={() => toggleProduct(bar.id)}
              t={t}
            />
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Step 4: Dual-transporter add-ons ─────────────────────────────────────────

const competitorProducts = competitorProductsData.products

const POPULAR_IDS = new Set(['maurten-gel-160', 'sis-beta-fuel-gel'])

function AddonProductRow({ product, quantity, onChangeQty }) {
  const isSelected = quantity > 0
  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors',
        isSelected ? 'border-[#48C4B0] border-l-4' : 'border-gray-200',
      ].join(' ')}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">{product.brand}</span>
          {POPULAR_IDS.has(product.id) && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#48C4B0]/10 text-[#48C4B0]">
              Popular
            </span>
          )}
        </div>
        <p className={`text-sm font-semibold leading-tight mt-0.5 ${isSelected ? 'text-[#48C4B0]' : 'text-[#1B1B1B]'}`}>
          {product.name}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {product.carbs_per_unit > 0 && (
            <span className="text-xs text-gray-400">{product.carbs_per_unit}g carbs</span>
          )}
          {product.sodium_per_unit > 0 && (
            <span className="text-xs text-gray-400">{product.sodium_per_unit}mg sodium</span>
          )}
          {product.caffeine && (
            <span className="text-xs font-medium text-[#48C4B0]">{product.caffeine_mg}mg caffeine</span>
          )}
          {product.dual_transporter && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[#48C4B0]/10 text-[#48C4B0]">
              Dual transport
            </span>
          )}
        </div>
      </div>
      {/* Quantity stepper */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => onChangeQty(Math.max(0, quantity - 1))}
          disabled={quantity === 0}
          className={[
            'w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors',
            quantity === 0
              ? 'border-gray-200 text-gray-300 cursor-not-allowed'
              : 'border-[#48C4B0] text-[#48C4B0] hover:bg-[#48C4B0]/10',
          ].join(' ')}
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-semibold text-[#1B1B1B]">
          {quantity}
        </span>
        <button
          type="button"
          onClick={() => onChangeQty(Math.min(12, quantity + 1))}
          disabled={quantity === 12}
          className={[
            'w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors',
            quantity === 12
              ? 'border-gray-200 text-gray-300 cursor-not-allowed'
              : 'border-[#48C4B0] text-[#48C4B0] hover:bg-[#48C4B0]/10',
          ].join(' ')}
        >
          +
        </button>
      </div>
    </div>
  )
}

function StepFour({ form, setForm, previewTargets }) {
  const [showElectrolytes, setShowElectrolytes] = useState(false)

  const highCarbGels = competitorProducts.filter(p => p.category === 'high_carb_gel')
  const electrolytes = competitorProducts.filter(p => p.category === 'electrolyte')
  const realFood     = competitorProducts.filter(p => p.category === 'real_food_extra')

  const isHotConditions = form.conditions === 'hot' || form.conditions === 'humid'
  const extraCarbs = previewTargets
    ? Math.max(0, previewTargets.carb_per_hour - 65)
    : 0

  function getQty(id) {
    return form.addon_items.find(i => i.id === id)?.quantity ?? 0
  }

  function setQty(id, qty) {
    setForm(f => {
      const existing = f.addon_items.filter(i => i.id !== id)
      return {
        ...f,
        addon_items: qty > 0 ? [...existing, { id, quantity: qty }] : existing,
      }
    })
  }

  return (
    <div className="space-y-7">

      {/* Context box */}
      {previewTargets && (
        <div className="rounded-xl border-2 border-[#48C4B0]/40 bg-[#48C4B0]/5 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-[#1B1B1B]">Your real food foundation</p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Lecka covers up to 65g carbs/hour — the maximum your body can absorb
            from a single carbohydrate source. Your target for this race is{' '}
            <span className="font-semibold text-[#1B1B1B]">{previewTargets.carb_per_hour}g/hour</span>.
          </p>
          {extraCarbs > 0 && (
            <p className="text-sm text-gray-600 leading-relaxed">
              The extra{' '}
              <span className="font-semibold text-[#1B1B1B]">{extraCarbs}g/hour</span>{' '}
              needs a second carbohydrate source. Sports science calls this the
              dual-transporter protocol — combining glucose (from real food like Lecka)
              with fructose (from products below).
            </p>
          )}
        </div>
      )}

      {/* Binary choice */}
      <div>
        <FieldLabel>Want to add performance products?</FieldLabel>
        <div className="space-y-2">
          <OptionCard
            label="Lecka only — I'm good"
            desc="I'll fuel with Lecka and manage the intensity on race day. I can always adjust my plan later."
            selected={!form.want_addons}
            onClick={() => setForm(f => ({ ...f, want_addons: false, addon_items: [] }))}
          />
          <OptionCard
            label="Add performance products"
            desc="I'll add high-carb products to reach my full target. Show me what athletes use."
            selected={form.want_addons}
            onClick={() => setForm(f => ({ ...f, want_addons: true }))}
          />
        </div>
      </div>

      {/* Add-on picker */}
      {form.want_addons && (
        <div className="space-y-7">

          {/* High-carb gels */}
          <div>
            <FieldLabel>High-carb gels</FieldLabel>
            <p className="text-xs text-gray-400 -mt-2 mb-3">
              Dual-transporter carbs to reach 75–90g/hour alongside Lecka
            </p>
            <div className="space-y-2">
              {highCarbGels.map(p => (
                <AddonProductRow
                  key={p.id}
                  product={p}
                  quantity={getQty(p.id)}
                  onChangeQty={qty => setQty(p.id, qty)}
                />
              ))}
            </div>
          </div>

          {/* Electrolyte top-up */}
          <div>
            {isHotConditions ? (
              <>
                <FieldLabel>Electrolyte top-up</FieldLabel>
                <div className="space-y-2">
                  {electrolytes.map(p => (
                    <AddonProductRow
                      key={p.id}
                      product={p}
                      quantity={getQty(p.id)}
                      onChangeQty={qty => setQty(p.id, qty)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                {!showElectrolytes ? (
                  <button
                    type="button"
                    onClick={() => setShowElectrolytes(true)}
                    className="text-sm text-gray-400 hover:text-[#48C4B0] transition-colors"
                  >
                    + Add electrolyte products (optional)
                  </button>
                ) : (
                  <>
                    <FieldLabel>Electrolyte top-up</FieldLabel>
                    <div className="space-y-2">
                      {electrolytes.map(p => (
                        <AddonProductRow
                          key={p.id}
                          product={p}
                          quantity={getQty(p.id)}
                          onChangeQty={qty => setQty(p.id, qty)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Real food extras */}
          <div>
            <FieldLabel>Real food add-ons</FieldLabel>
            <p className="text-xs text-gray-400 -mt-2 mb-3">
              Available at aid stations or easy to carry
            </p>
            <div className="space-y-2">
              {realFood.map(p => (
                <AddonProductRow
                  key={p.id}
                  product={p}
                  quantity={getQty(p.id)}
                  onChangeQty={qty => setQty(p.id, qty)}
                />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              These fit Lecka's real food philosophy — no synthetic additives
            </p>
          </div>

        </div>
      )}

    </div>
  )
}

// ── Step validation ───────────────────────────────────────────────────────────

function isStep1Valid(form) {
  const goalMinutes = goalMinutesFromFields(form.goal_time_h, form.goal_time_m)
  if (form.sport === 'triathlon') {
    return form.triathlon_type !== '' && goalMinutes !== null
  }
  return (
    form.custom_km !== '' &&
    form.race_type !== '' &&
    form.surface_type !== '' &&
    goalMinutes !== null
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
  const { t } = useTranslation(['form', 'common'])
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(() => loadDraft() ?? DEFAULT_FORM)
  const [profilePrefilled, setProfilePrefilled] = useState(false)
  const [prefillDismissed, setPrefillDismissed] = useState(false)
  const [previewTargets, setPreviewTargets] = useState(null)

  const totalSteps = previewTargets && needsDualTransporter(previewTargets) ? 4 : 3

  // Persist form to sessionStorage on every change so a refresh or accidental
  // navigation away doesn't wipe the user's progress.
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch {}
  }, [form])

  // Pre-fill profile fields from /api/auth/me for logged-in users.
  // Only fills fields still at their default value — never overwrites user edits.
  // Silently falls back to defaults on any failure.
  useEffect(() => {
    const userId = localStorage.getItem('lecka_user_id')
    if (!userId) return
    const controller = new AbortController()
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${userId}` },
      signal: controller.signal,
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(profile => {
        setForm(f => {
          const patch = {}
          if (profile.weight_kg != null && f.weight_value === DEFAULT_FORM.weight_value && f.weight_unit === DEFAULT_FORM.weight_unit) {
            const unit = profile.weight_unit === 'lb' ? 'lb' : 'kg'
            const displayVal = unit === 'lb'
              ? String(Math.round(profile.weight_kg * 2.20462))
              : String(Math.round(profile.weight_kg))
            patch.weight_value = displayVal
            patch.weight_unit  = unit
          }
          if (profile.gender         != null && f.gender          === DEFAULT_FORM.gender)          patch.gender          = profile.gender
          if (profile.athlete_profile != null && f.athlete_profile === DEFAULT_FORM.athlete_profile) patch.athlete_profile = profile.athlete_profile
          if (profile.caffeine_ok    != null && f.caffeine_ok     === DEFAULT_FORM.caffeine_ok)     patch.caffeine_ok     = profile.caffeine_ok
          if (profile.dist_unit      != null && f.dist_unit       === DEFAULT_FORM.dist_unit)       patch.dist_unit       = profile.dist_unit
          if (Object.keys(patch).length === 0) return f
          setProfilePrefilled(true)
          return { ...f, ...patch }
        })
      })
      .catch(err => {
        if (err.name !== 'AbortError') console.warn('[StepForm] profile prefill failed:', err)
      })
    return () => controller.abort()
  }, [])

  const stepValid = { 1: isStep1Valid(form), 2: isStep2Valid(form), 3: isStep3Valid(form), 4: true }
  const canAdvance = stepValid[step]

  function handleNext() {
    if (step === 2) {
      // Compute preview targets so we know whether Step 4 is needed
      try {
        const weight_kg    = toKg(form.weight_value, form.weight_unit)
        const goal_minutes = goalMinutesFromFields(form.goal_time_h, form.goal_time_m)
        const preview = calculateTargets({
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
        setPreviewTargets(preview)
      } catch {
        setPreviewTargets(null)
      }
      setStep(s => s + 1)
      return
    }

    if (step < totalSteps) {
      setStep(s => s + 1)
      return
    }

    // Final step — build the plan
    const weight_kg    = toKg(form.weight_value, form.weight_unit)
    const goal_minutes = goalMinutesFromFields(form.goal_time_h, form.goal_time_m)
    const h = Math.floor(goal_minutes / 60)
    const m = goal_minutes % 60
    const goal_time = `${h}:${String(m).padStart(2, '0')}`

    const targets = calculateTargets({
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

    const resolvedAddonItems = form.addon_items
      .filter(i => i.quantity > 0)
      .map(i => ({
        product:  competitorProducts.find(p => p.id === i.id),
        quantity: i.quantity,
      }))
      .filter(i => i.product !== undefined)

    const addonCoverage      = computeAddonCoverage(resolvedAddonItems, goal_minutes)
    const foundationTargets  = computeFoundationTargets(targets, addonCoverage)
    const selection          = selectProducts(foundationTargets, form.preferred_product_ids, detectRegion)

    try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
    onComplete({
      targets,
      foundationTargets,
      selection,
      addonCoverage,
      resolvedAddonItems,
      form: { ...form, goal_time },
    })
  }

  return (
    <div className="bg-white">

      {/* ── Progress bar ── */}
      <div className="w-full h-1 bg-gray-100" aria-hidden="true">
        <div
          className="h-1 bg-[#48C4B0] transition-all duration-500 ease-in-out"
          style={{ width: `${(step / totalSteps) * 100}%` }}
        />
      </div>

      {/* ── Logo + Step header ── */}
      <div className="max-w-md mx-auto w-full px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-5">
          <img src="/logo.svg" alt="Lecka" className="h-7" />
          <LanguageSwitcher region={detectRegion} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {t('common:step.ofTotal', { step, total: totalSteps })}
        </p>
        <h1 className="text-2xl font-bold text-[#1B1B1B] mt-1">
          {[
            t('form:steps.race'),
            t('form:steps.body'),
            t('form:steps.products'),
            'Performance add-ons',
          ][step - 1]}
        </h1>
      </div>

      {/* ── Step content ── */}
      <div className="max-w-md mx-auto w-full px-5 pb-4">
        {step === 1 && <StepOne form={form} setForm={setForm} />}
        {step === 2 && (
          <StepTwo
            form={form}
            setForm={setForm}
            showPrefillBadge={profilePrefilled && !prefillDismissed}
            onDismissPrefill={() => setPrefillDismissed(true)}
          />
        )}
        {step === 3 && <StepThree form={form} setForm={setForm} />}
        {step === 4 && (
          <StepFour form={form} setForm={setForm} previewTargets={previewTargets} />
        )}
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
            {t('common:step.back')}
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
          {step === totalSteps ? t('common:step.buildMyPlan') : t('common:step.next')}
        </button>
      </div>

    </div>
  )
}
