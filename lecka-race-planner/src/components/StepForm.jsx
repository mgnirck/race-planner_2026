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
import i18n from '../i18n.js'
import Nav from './Nav.jsx'
import { calculateTargets } from '../engine/nutrition-engine'
import { needsDualTransporter, computeAddonCoverage, computeFoundationTargets } from '../engine/kit-calculator.js'
import { selectProducts }   from '../engine/product-selector'
import FALLBACK_PRODUCTS    from '../config/products.json'
import competitorProductsData from '../config/competitor-products.json'
import { useProducts }      from '../hooks/useProducts.js'
import { parseGPX, estimateElevationImpact } from '../utils/gpx-parser.js'
import { getSavedRegion, saveRegion } from '../embed.js'
import { isAvailableInRegion } from '../engine/region-utils.js'
import WeightInput, { toKg } from './shared/WeightInput.jsx'
import ProductPreferencePicker from './shared/ProductPreferencePicker.jsx'
import regionsConfig from '../config/regions.json'

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveGoalMinutes(form) {
  if (form.sport === 'triathlon') {
    const swim = parseInt(form.swim_minutes, 10)
    const bike = goalMinutesFromFields(form.bike_time_h, form.bike_time_m) ?? 0
    const run  = goalMinutesFromFields(form.run_time_h,  form.run_time_m)  ?? 0
    const total = (Number.isFinite(swim) ? swim : 0) + bike + run
    return total > 0 ? total : null
  }
  return goalMinutesFromFields(form.goal_time_h, form.goal_time_m)
}

function goalMinutesFromFields(h, m) {
  const hours = parseInt(h, 10)
  const mins  = parseInt(m, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  if (hours < 0 || hours > 200) return null
  if (mins < 0 || mins > 59) return null
  const total = hours * 60 + mins
  return total > 0 ? total : null
}

const PACE_BOUNDS = {
  '5k':                { min: 12,  max: 120  },
  '10k':               { min: 27,  max: 180  },
  'half_marathon':     { min: 58,  max: 360  },
  'marathon':          { min: 120, max: 720  },
  'ultra_50k':         { min: 210, max: 1200 },
  'ultra_100k':        { min: 480, max: 2400 },
}

const TRIATHLON_SPLIT_BOUNDS = {
  triathlon_sprint:  { swim: [8,  40],  bike: [20,  120], run: [10,  90]  },
  triathlon_olympic: { swim: [15, 70],  bike: [45,  200], run: [25,  150] },
  triathlon_70_3:    { swim: [25, 90],  bike: [120, 420], run: [60,  300] },
  triathlon_140_6:   { swim: [45, 160], bike: [240, 900], run: [120, 600] },
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
  { key: 'triathlon_sprint',  label: 'Sprint',  sublabel: '750m swim · 20km bike · 5km run',    km: 51,   hint: 'Typical finish times: 45 min – 2h'   },
  { key: 'triathlon_olympic', label: 'Olympic', sublabel: '1.5km swim · 40km bike · 10km run',  km: 51.5, hint: 'Typical finish times: 1h45 – 4h'     },
  { key: 'triathlon_70_3',    label: '70.3',    sublabel: '1.9km swim · 90km bike · 21km run',  km: 113,  hint: 'Typical finish times: 3h30 – 8h'     },
  { key: 'triathlon_140_6',   label: 'Ironman', sublabel: '3.8km swim · 180km bike · 42km run', km: 226,  hint: 'Typical finish times: 8h – 17h'      },
]

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
  race_date:         '',
  race_city:         '',
  race_start_time:   '',
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
  swim_minutes:      '',
  bike_time_h:       '',
  bike_time_m:       '',
  run_time_h:        '',
  run_time_m:        '',
  // Step 2
  weight_value:    '70',
  weight_unit:     'kg',
  gender:          '',
  age_bracket:     null,
  temperature:     '',
  humidity:        'dry',
  effort:          '',
  athlete_profile: '',
  caffeine_ok:     null,
  training_mode:   false,
  custom_targets_mode: false,
  custom_carb_ph:      '',
  custom_sodium_ph:    '',
  custom_fluid_ph:     '',
  // Step 3
  preferred_product_ids: [],
  fuelling_style: 'gels_only',
  // Step 4
  want_addons:      false,
  addon_items:      [],
  custom_products:  [],
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

// ── Step 0: Region ────────────────────────────────────────────────────────────

function StepRegion({ region, onSelect }) {
  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-400">We use this to show you available products and local pricing.</p>

      {/* All non-international countries */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(regionsConfig)
          .filter(([, cfg]) => cfg.type !== 'international')
          .map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
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
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Other</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(regionsConfig)
              .filter(([, cfg]) => cfg.type === 'international')
              .map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key)}
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

  // Triathlon split state
  const splitBounds   = form.triathlon_type ? TRIATHLON_SPLIT_BOUNDS[form.triathlon_type] : null
  const swimMin       = parseInt(form.swim_minutes, 10)
  const bikeMin       = goalMinutesFromFields(form.bike_time_h, form.bike_time_m)
  const runMin        = goalMinutesFromFields(form.run_time_h,  form.run_time_m)
  const swimTouched   = form.swim_minutes !== ''
  const bikeTouched   = form.bike_time_h !== '' || form.bike_time_m !== ''
  const runTouched    = form.run_time_h  !== '' || form.run_time_m  !== ''
  const swimOk        = splitBounds && Number.isFinite(swimMin) && swimMin >= splitBounds.swim[0] && swimMin <= splitBounds.swim[1]
  const bikeOk        = splitBounds && bikeMin !== null && bikeMin >= splitBounds.bike[0] && bikeMin <= splitBounds.bike[1]
  const runOk         = splitBounds && runMin  !== null && runMin  >= splitBounds.run[0]  && runMin  <= splitBounds.run[1]
  const swimError     = swimTouched && splitBounds && !swimOk
    ? (!Number.isFinite(swimMin) ? 'Enter a number' : swimMin < splitBounds.swim[0] ? `Min ${splitBounds.swim[0]} min` : `Max ${splitBounds.swim[1]} min`)
    : null
  const bikeError     = bikeTouched && splitBounds && !bikeOk
    ? (bikeMin === null ? 'Enter a valid time' : bikeMin < splitBounds.bike[0] ? `Min ${splitBounds.bike[0]} min` : `Max ${splitBounds.bike[1]} min`)
    : null
  const runError      = runTouched && splitBounds && !runOk
    ? (runMin === null ? 'Enter a valid time' : runMin < splitBounds.run[0] ? `Min ${splitBounds.run[0]} min` : `Max ${splitBounds.run[1]} min`)
    : null

  function handleDistChange(rawValue) {
    setForm(f => {
      const kmVal = displayToKm(rawValue, f.dist_unit)
      const MAX_KM = 250
      const overMax = kmVal !== null && kmVal > MAX_KM
      return {
        ...f,
        custom_km_display: rawValue,
        custom_km:     kmVal !== null ? String(Math.round(kmVal * 10) / 10) : '',
        race_type:     kmVal ? distanceToRaceType(kmVal) : '',
        dist_warning:  overMax,
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

      {/* Race date — required for pro plan */}
      <div>
        <FieldLabel>{t('form:field.raceDate')} <span className="text-red-400">*</span></FieldLabel>
        <input
          type="date"
          value={form.race_date}
          onChange={e => setForm(f => ({ ...f, race_date: e.target.value }))}
          min={new Date().toISOString().split('T')[0]}
          required
          className="w-full border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200
                     focus:outline-none focus:border-[#48C4B0]"
        />
      </div>

      {/* Race city / location */}
      <div>
        <FieldLabel>Race city / location</FieldLabel>
        <input
          type="text"
          placeholder="e.g. Berlin, Germany"
          value={form.race_city ?? ''}
          onChange={e => setForm(f => ({ ...f, race_city: e.target.value }))}
          className="w-full border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200 focus:outline-none focus:border-[#48C4B0]"
        />
        <p className="text-xs text-gray-400 mt-1.5">Used to fetch live race-day weather (Pro plans only)</p>
      </div>

      {/* Race start time */}
      <div>
        <FieldLabel>Race start time (optional)</FieldLabel>
        <input
          type="time"
          value={form.race_start_time ?? ''}
          onChange={e => setForm(f => ({ ...f, race_start_time: e.target.value }))}
          className="w-full border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200 focus:outline-none focus:border-[#48C4B0]"
        />
        <p className="text-xs text-gray-400 mt-1.5">Improves hourly forecast accuracy</p>
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
            {form.dist_warning && (
              <p className="text-xs text-amber-600 mt-1.5">
                That&apos;s a very long distance — your plan will be calculated as Ultra 100km+.
                If this looks wrong, check your distance units.
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

      {/* Goal finish time — split fields for triathlon, single field otherwise */}
      {form.sport === 'triathlon' ? (
        <div>
          <FieldLabel>Split times</FieldLabel>
          <div className="space-y-4">

            {/* Swim */}
            <div>
              <span className="text-xs font-medium text-gray-500 mb-1.5 block">Swim</span>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="42"
                    value={form.swim_minutes}
                    onChange={e => setForm(f => ({ ...f, swim_minutes: e.target.value }))}
                    className={[
                      'w-16 border-2 rounded-lg px-3 py-2.5 text-sm text-center font-mono focus:outline-none',
                      swimOk ? 'border-[#48C4B0]' : swimError ? 'border-red-300' : 'border-gray-200 focus:border-[#48C4B0]',
                    ].join(' ')}
                  />
                  <span className="text-xs text-gray-400">min</span>
                </div>
              </div>
              {swimError && <p className="text-xs text-red-400 mt-1">{swimError}</p>}
            </div>

            {/* Bike */}
            <div>
              <span className="text-xs font-medium text-gray-500 mb-1.5 block">Bike</span>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="0"
                    value={form.bike_time_h}
                    onChange={e => setForm(f => ({ ...f, bike_time_h: e.target.value }))}
                    className={[
                      'w-16 border-2 rounded-lg px-3 py-2.5 text-sm text-center font-mono focus:outline-none',
                      bikeOk ? 'border-[#48C4B0]' : bikeError ? 'border-red-300' : 'border-gray-200 focus:border-[#48C4B0]',
                    ].join(' ')}
                  />
                  <span className="text-xs text-gray-400">h</span>
                </div>
                <span className="text-lg font-semibold text-gray-300 pb-4">:</span>
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    placeholder="00"
                    value={form.bike_time_m}
                    onChange={e => setForm(f => ({ ...f, bike_time_m: e.target.value }))}
                    className={[
                      'w-16 border-2 rounded-lg px-3 py-2.5 text-sm text-center font-mono focus:outline-none',
                      bikeOk ? 'border-[#48C4B0]' : bikeError ? 'border-red-300' : 'border-gray-200 focus:border-[#48C4B0]',
                    ].join(' ')}
                  />
                  <span className="text-xs text-gray-400">min</span>
                </div>
              </div>
              {bikeError && <p className="text-xs text-red-400 mt-1">{bikeError}</p>}
            </div>

            {/* Run */}
            <div>
              <span className="text-xs font-medium text-gray-500 mb-1.5 block">Run</span>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="0"
                    value={form.run_time_h}
                    onChange={e => setForm(f => ({ ...f, run_time_h: e.target.value }))}
                    className={[
                      'w-16 border-2 rounded-lg px-3 py-2.5 text-sm text-center font-mono focus:outline-none',
                      runOk ? 'border-[#48C4B0]' : runError ? 'border-red-300' : 'border-gray-200 focus:border-[#48C4B0]',
                    ].join(' ')}
                  />
                  <span className="text-xs text-gray-400">h</span>
                </div>
                <span className="text-lg font-semibold text-gray-300 pb-4">:</span>
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    placeholder="00"
                    value={form.run_time_m}
                    onChange={e => setForm(f => ({ ...f, run_time_m: e.target.value }))}
                    className={[
                      'w-16 border-2 rounded-lg px-3 py-2.5 text-sm text-center font-mono focus:outline-none',
                      runOk ? 'border-[#48C4B0]' : runError ? 'border-red-300' : 'border-gray-200 focus:border-[#48C4B0]',
                    ].join(' ')}
                  />
                  <span className="text-xs text-gray-400">min</span>
                </div>
              </div>
              {runError && <p className="text-xs text-red-400 mt-1">{runError}</p>}
            </div>

          </div>
          {swimOk && bikeOk && runOk && (() => {
            const total = swimMin + bikeMin + runMin
            return (
              <p className="text-xs text-[#48C4B0] mt-2">
                Total: {Math.floor(total / 60)}h {total % 60}min
              </p>
            )
          })()}
        </div>
      ) : (
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
          {!timeIsInvalid && goalMinutes !== null && form.race_type && (() => {
            const bounds = PACE_BOUNDS[form.race_type]
            if (!bounds) return null
            if (goalMinutes < bounds.min) return (
              <p className="text-xs text-amber-600 mt-1.5">
                That&apos;s a very fast target for this distance. Double-check your goal time — your nutrition plan will be calculated from this.
              </p>
            )
            if (goalMinutes > bounds.max) return (
              <p className="text-xs text-amber-600 mt-1.5">
                That&apos;s a very slow target for this distance. Double-check your goal time — your nutrition plan will be calculated from this.
              </p>
            )
            return null
          })()}
        </div>
      )}

    </div>
  )
}

// ── Step 2: Body, conditions & preferences ────────────────────────────────────

function StepTwo({ form, setForm, showPrefillBadge = false, prefillMessage, onDismissPrefill }) {
  const { t } = useTranslation(['form', 'common'])

  return (
    <div className="space-y-7">

      {/* Pre-fill badge */}
      {showPrefillBadge && (
        <div className="flex items-center justify-between gap-2 bg-[#48C4B0]/10 border border-[#48C4B0]/30 rounded-full px-4 py-2">
          <span className="text-xs font-medium text-[#48C4B0]">{prefillMessage ?? 'Pre-filled from your profile'}</span>
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

      {/* Custom targets toggle */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-xl border-2 border-gray-100 bg-gray-50">
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#1B1B1B]">I already know my targets</p>
          <p className="text-xs text-gray-400 mt-0.5">Enter your carb, sodium, and fluid targets directly — we'll map them to products</p>
        </div>
        <button
          type="button"
          onClick={() => setForm(f => ({ ...f, custom_targets_mode: !f.custom_targets_mode }))}
          className={[
            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
            'transition-colors duration-200 ease-in-out focus:outline-none mt-0.5',
            form.custom_targets_mode ? 'bg-[#48C4B0]' : 'bg-gray-200',
          ].join(' ')}
          role="switch"
          aria-checked={form.custom_targets_mode}
        >
          <span
            className={[
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0',
              'transition duration-200 ease-in-out',
              form.custom_targets_mode ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      {/* Weight */}
      <div>
        <FieldLabel>{t('form:field.weight')}</FieldLabel>
        <WeightInput
          value={form.weight_value}
          unit={form.weight_unit}
          onChange={(value, unit) => setForm(f => ({ ...f, weight_value: value, weight_unit: unit }))}
        />
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

      {/* Age bracket (optional) */}
      <div>
        <FieldLabel>Age bracket <span className="text-gray-400 font-normal">(optional)</span></FieldLabel>
        <p className="text-xs text-gray-400 mb-2">
          Masters athletes absorb carbohydrates at a lower rate. Select your age group to adjust your targets.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'under_40', label: 'Under 40' },
            { key: '40_to_50', label: '40–49' },
            { key: '50_to_60', label: '50–59' },
            { key: 'over_60',  label: '60+' },
          ].map(a => (
            <Pill
              key={a.key}
              label={a.label}
              selected={form.age_bracket === a.key}
              onClick={() => setForm(f => ({
                ...f,
                age_bracket: f.age_bracket === a.key ? null : a.key,
              }))}
            />
          ))}
        </div>
      </div>

      {form.custom_targets_mode ? (
        <div className="space-y-6">
          {/* Carbs per hour */}
          <div>
            <FieldLabel>Carbs per hour</FieldLabel>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 60"
                value={form.custom_carb_ph}
                onChange={e => setForm(f => ({ ...f, custom_carb_ph: e.target.value }))}
                className="w-28 border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200 focus:outline-none focus:border-[#48C4B0]"
              />
              <span className="text-sm text-gray-400">g/h</span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Typical range: 30–120 g/h</p>
          </div>
          {/* Sodium per hour */}
          <div>
            <FieldLabel>Sodium per hour</FieldLabel>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 500"
                value={form.custom_sodium_ph}
                onChange={e => setForm(f => ({ ...f, custom_sodium_ph: e.target.value }))}
                className="w-28 border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200 focus:outline-none focus:border-[#48C4B0]"
              />
              <span className="text-sm text-gray-400">mg/h</span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Typical range: 200–1500 mg/h</p>
          </div>
          {/* Fluid per hour */}
          <div>
            <FieldLabel>Fluid per hour</FieldLabel>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 500"
                value={form.custom_fluid_ph}
                onChange={e => setForm(f => ({ ...f, custom_fluid_ph: e.target.value }))}
                className="w-28 border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200 focus:outline-none focus:border-[#48C4B0]"
              />
              <span className="text-sm text-gray-400">ml/h</span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Typical range: 300–1200 ml/h</p>
          </div>
        </div>
      ) : (
        <>
          {/* Race conditions */}
          <div>
            <FieldLabel>{t('form:field.conditions')}</FieldLabel>

            <p className="text-xs text-gray-400 mb-2">Temperature</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { key: 'cool', emoji: '❄️', label: 'Cool', range: '< 10 °C' },
                { key: 'mild', emoji: '🌤', label: 'Mild', range: '10–20 °C' },
                { key: 'warm', emoji: '☀️', label: 'Warm', range: '20–28 °C' },
                { key: 'hot',  emoji: '🔥', label: 'Hot',  range: '> 28 °C' },
              ].map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, temperature: c.key }))}
                  className={[
                    'flex flex-col items-center justify-center gap-0.5',
                    'min-h-[64px] rounded-xl border-2 transition-colors px-1',
                    form.temperature === c.key
                      ? 'border-[#48C4B0] bg-[#48C4B0]/10'
                      : 'border-gray-200 bg-white',
                  ].join(' ')}
                >
                  <span className="text-xl">{c.emoji}</span>
                  <span className="text-xs font-medium text-gray-700">{c.label}</span>
                  <span className="text-[10px] text-gray-400">{c.range}</span>
                </button>
              ))}
            </div>

            <p className="text-xs text-gray-400 mb-2">Humidity</p>
            <div className="flex gap-2">
              {[
                { key: 'dry',   label: 'Dry',   range: '< 60 %' },
                { key: 'humid', label: 'Humid', range: '≥ 60 %' },
              ].map(h => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, humidity: h.key }))}
                  className={[
                    'flex-1 flex flex-col items-center justify-center gap-0.5',
                    'min-h-[52px] rounded-xl border-2 transition-colors',
                    form.humidity === h.key
                      ? 'border-[#48C4B0] bg-[#48C4B0]/10'
                      : 'border-gray-200 bg-white',
                  ].join(' ')}
                >
                  <span className="text-sm font-medium text-gray-700">{h.label}</span>
                  <span className="text-[10px] text-gray-400">{h.range}</span>
                </button>
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
        </>
      )}

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

      {/* Gut training mode */}
      <div>
        <FieldLabel>Gut training mode</FieldLabel>
        <p className="text-xs text-gray-400 mb-2">
          Reduce carb targets by 30% — for training runs before race day, not race day itself.
        </p>
        <div className="flex gap-2">
          <Pill
            label="Yes"
            selected={form.training_mode === true}
            onClick={() => setForm(f => ({ ...f, training_mode: true }))}
          />
          <Pill
            label="No"
            selected={form.training_mode === false}
            onClick={() => setForm(f => ({ ...f, training_mode: false }))}
          />
        </div>
      </div>

    </div>
  )
}

// ── Step 3: Fuelling style + product preferences ──────────────────────────────

function StepThree({ form, setForm }) {
  const { t } = useTranslation(['form', 'common'])

  const style       = form.fuelling_style
  const isTriathlon = form.sport === 'triathlon'

  // Silently lock triathlon to gels_only so downstream logic is consistent
  React.useEffect(() => {
    if (isTriathlon && form.fuelling_style !== 'gels_only') {
      setForm(f => ({ ...f, fuelling_style: 'gels_only' }))
    }
  }, [isTriathlon]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-7">

      {/* Fuelling style — hidden for triathlon */}
      {!isTriathlon && (
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
      )}

      {/* Product preferences */}
      <p className="text-sm text-gray-500">
        {t('form:field.products.intro')}
      </p>

      <ProductPreferencePicker
        preferredProductIds={form.preferred_product_ids}
        onToggle={(id) =>
          setForm(f => {
            const current = f.preferred_product_ids
            return {
              ...f,
              preferred_product_ids: current.includes(id)
                ? current.filter(x => x !== id)
                : [...current, id],
            }
          })
        }
        region={getSavedRegion() ?? 'us'}
        caffeineOk={form.caffeine_ok !== false}
        sport={form.sport}
      />

    </div>
  )
}

// ── Step 4: Dual-transporter add-ons ─────────────────────────────────────────

const competitorProducts = competitorProductsData.products

const POPULAR_IDS = new Set(['maurten-gel-160', 'sis-beta-fuel-gel'])

function AddonProductRow({ product, quantity, onChangeQty, onRemove }) {
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
          {product.is_custom && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              Custom
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
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-8 h-8 ml-1 rounded-full border-2 border-gray-200 flex items-center
                       justify-center text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors"
            aria-label="Remove product"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function StepFour({ form, setForm, previewTargets }) {
  const [showElectrolytes, setShowElectrolytes] = useState(false)
  const [showScienceTooltip, setShowScienceTooltip] = useState(false)
  const [customName,     setCustomName]     = useState('')
  const [customCarbs,    setCustomCarbs]    = useState('')
  const [customSodium,   setCustomSodium]   = useState('')
  const [customCaffeine, setCustomCaffeine] = useState('')
  const [customError,    setCustomError]    = useState('')
  const [addedState,     setAddedState]     = useState(false)

  const highCarbGels = competitorProducts.filter(p => p.category === 'high_carb_gel')
  const electrolytes = competitorProducts.filter(p => p.category === 'electrolyte')
  const realFood     = competitorProducts.filter(p => p.category === 'real_food_extra')

  const isHotConditions = form.temperature === 'hot' || (form.temperature === 'warm' && form.humidity === 'humid')
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

  function removeCustomProduct(id) {
    setForm(f => ({
      ...f,
      addon_items:     f.addon_items.filter(i => i.id !== id),
      custom_products: (f.custom_products ?? []).filter(p => p.id !== id),
    }))
  }

  function handleAddCustomProduct() {
    const trimmedName = customName.trim()
    if (!trimmedName || trimmedName.length > 60) {
      setCustomError('Please enter a product name (max 60 characters).')
      return
    }
    const carbsNum = Number(customCarbs)
    if (customCarbs === '' || !isFinite(carbsNum) || carbsNum < 0 || carbsNum > 150) {
      setCustomError('Carbs must be a number between 0 and 150.')
      return
    }
    const sodiumNum   = customSodium   !== '' ? Number(customSodium)   : 0
    const caffeineNum = customCaffeine !== '' ? Number(customCaffeine) : 0
    if (!isFinite(sodiumNum) || sodiumNum < 0 || sodiumNum > 2000) {
      setCustomError('Sodium must be 0–2000 mg.')
      return
    }
    if (!isFinite(caffeineNum) || caffeineNum < 0 || caffeineNum > 300) {
      setCustomError('Caffeine must be 0–300 mg.')
      return
    }
    setCustomError('')

    const product = {
      id:               `custom-${Date.now()}`,
      brand:            'Custom',
      name:             trimmedName,
      display_name:     trimmedName,
      category:         'custom',
      type:             'custom',
      carbs_per_unit:   carbsNum,
      sodium_per_unit:  sodiumNum,
      caffeine:         caffeineNum > 0,
      caffeine_mg:      caffeineNum,
      dual_transporter: false,
      fructose_ratio:   0,
      notes:            'Custom product added by athlete',
      is_custom:        true,
    }

    setForm(f => ({
      ...f,
      addon_items:     [...f.addon_items, { id: product.id, quantity: 1 }],
      custom_products: [...(f.custom_products ?? []), product],
    }))

    setCustomName('')
    setCustomCarbs('')
    setCustomSodium('')
    setCustomCaffeine('')
    setAddedState(true)
    setTimeout(() => setAddedState(false), 1500)
  }

  return (
    <div className="space-y-7">

      {/* Context box */}
      {previewTargets && (
        <div className="rounded-xl border-2 border-[#48C4B0]/40 bg-[#48C4B0]/5 px-4 py-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#1B1B1B]">
              Your Lecka foundation covers {Math.min(65, previewTargets.carb_per_hour)}g carbs/hour
            </p>
            <button
              type="button"
              onClick={() => setShowScienceTooltip(v => !v)}
              className="text-[#48C4B0] hover:text-[#3db09d] flex-shrink-0"
              aria-label="Show absorption science"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          {extraCarbs > 0 ? (
            <>
              <p className="text-sm text-gray-600 leading-relaxed">
                For races this long, your body can absorb even more if you add a second type of fuel alongside your gels.
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Adding{' '}
                <span className="font-semibold text-[#1B1B1B]">{extraCarbs}g/hour</span>{' '}
                from the products below gets you to your full target.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-600 leading-relaxed">
              Your Lecka gels cover your full target — the options below are optional extras.
            </p>
          )}
          {showScienceTooltip && (
            <div className="mt-2 pt-3 border-t border-[#48C4B0]/30 text-xs text-gray-500 leading-relaxed space-y-1">
              <p className="font-semibold text-gray-600">The science behind the limit</p>
              <p>
                Your gut absorbs glucose (from real food like Lecka) via one transporter (SGLT1),
                which maxes out at around 60–65g carbs/hour. A second transporter (GLUT5) handles
                fructose independently — so combining both types lets you absorb 90g/hour or more.
                Sports scientists call this the dual-transporter protocol.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Binary choice */}
      <div>
        <FieldLabel>Want to add performance products?</FieldLabel>
        <div className="space-y-2">
          <OptionCard
            label="Lecka gels are enough for me"
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

          {/* Custom products already added */}
          {(form.custom_products ?? []).length > 0 && (
            <div>
              <FieldLabel>Your custom products</FieldLabel>
              <div className="space-y-2">
                {(form.custom_products ?? []).map(p => (
                  <AddonProductRow
                    key={p.id}
                    product={p}
                    quantity={getQty(p.id)}
                    onChangeQty={qty => setQty(p.id, qty)}
                    onRemove={() => removeCustomProduct(p.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add your own product */}
          <div>
            <FieldLabel>Add your own product</FieldLabel>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Product name</label>
                <input
                  type="text"
                  placeholder="e.g. Maurten Gel 100"
                  maxLength={60}
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  className="w-full border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200
                             focus:outline-none focus:border-[#48C4B0]"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Carbs per unit (g)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 25"
                    value={customCarbs}
                    onChange={e => setCustomCarbs(e.target.value)}
                    className="w-full border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200
                               focus:outline-none focus:border-[#48C4B0]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Sodium (mg, opt.)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 0"
                    value={customSodium}
                    onChange={e => setCustomSodium(e.target.value)}
                    className="w-full border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200
                               focus:outline-none focus:border-[#48C4B0]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Caffeine (mg, opt.)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 0"
                    value={customCaffeine}
                    onChange={e => setCustomCaffeine(e.target.value)}
                    className="w-full border-2 rounded-lg px-3 py-2.5 text-sm border-gray-200
                               focus:outline-none focus:border-[#48C4B0]"
                  />
                </div>
              </div>
              {customError && (
                <p className="text-xs text-red-500">{customError}</p>
              )}
              <button
                type="button"
                onClick={handleAddCustomProduct}
                className={[
                  'w-full min-h-[44px] rounded-xl border-2 text-sm font-semibold transition-colors',
                  addedState
                    ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                    : 'border-[#48C4B0] text-[#48C4B0] hover:bg-[#48C4B0]/5',
                ].join(' ')}
              >
                {addedState ? 'Added ✓' : 'Add to plan'}
              </button>
            </div>
          </div>

        </div>
      )}

    </div>
  )
}

// ── Step validation ───────────────────────────────────────────────────────────

function isStep1Valid(form) {
  if (form.sport === 'triathlon') {
    if (!form.triathlon_type || form.race_date === '') return false
    const bounds = TRIATHLON_SPLIT_BOUNDS[form.triathlon_type]
    if (!bounds) return false
    const swimMin = parseInt(form.swim_minutes, 10)
    const bikeMin = goalMinutesFromFields(form.bike_time_h, form.bike_time_m)
    const runMin  = goalMinutesFromFields(form.run_time_h,  form.run_time_m)
    return (
      Number.isFinite(swimMin) && swimMin >= bounds.swim[0] && swimMin <= bounds.swim[1] &&
      bikeMin !== null && bikeMin >= bounds.bike[0] && bikeMin <= bounds.bike[1] &&
      runMin  !== null && runMin  >= bounds.run[0]  && runMin  <= bounds.run[1]
    )
  }
  const goalMinutes = goalMinutesFromFields(form.goal_time_h, form.goal_time_m)
  return (
    form.race_date !== '' &&
    form.custom_km !== '' &&
    form.race_type !== '' &&
    form.surface_type !== '' &&
    goalMinutes !== null
  )
}

function deriveConditionsFromForm(form) {
  const temp = form.temperature
  const humid = form.humidity
  if (temp === 'cool') return 'cool'
  if (temp === 'mild') return humid === 'humid' ? 'warm' : 'mild'
  if (temp === 'warm') return humid === 'humid' ? 'humid' : 'warm'
  if (temp === 'hot')  return 'hot'
  return 'mild'
}

function isStep2Valid(form) {
  const baseValid =
    toKg(form.weight_value, form.weight_unit) !== null &&
    form.gender      !== '' &&
    form.caffeine_ok !== null

  if (form.custom_targets_mode) {
    const carb   = parseInt(form.custom_carb_ph,   10)
    const sodium = parseInt(form.custom_sodium_ph,  10)
    const fluid  = parseInt(form.custom_fluid_ph,   10)
    return (
      baseValid &&
      Number.isFinite(carb)   && carb   > 0 &&
      Number.isFinite(sodium) && sodium > 0 &&
      Number.isFinite(fluid)  && fluid  > 0
    )
  }

  return (
    baseValid &&
    form.temperature     !== '' &&
    form.effort          !== '' &&
    form.athlete_profile !== ''
  )
}

function isStep3Valid(_form) {
  return true // preferences are always optional — defaults used if nothing selected
}

// ── Main component ────────────────────────────────────────────────────────────

// Capture whether a homepage prefill was present before the form useState consumes it
let _hadHomepagePrefill = false
try {
  _hadHomepagePrefill = !!sessionStorage.getItem('lecka_pro_prefill')
} catch {}

export default function StepForm({ onComplete }) {
  const { t } = useTranslation(['form', 'common'])
  const { products: liveProducts } = useProducts()
  const allProducts = liveProducts ?? FALLBACK_PRODUCTS
  const [step, setStep] = useState(() => {
    try {
      const hasRegion = !!localStorage.getItem('lecka_region')
      if (_hadHomepagePrefill && hasRegion) return 1
    } catch {}
    return 0
  })
  const [region, setRegion] = useState(() => getSavedRegion() ?? null)
  const [form, setForm] = useState(() => {
    try {
      const raw = sessionStorage.getItem('lecka_pro_prefill')
      if (raw) {
        sessionStorage.removeItem('lecka_pro_prefill')
        return { ...DEFAULT_FORM, ...JSON.parse(raw) }
      }
    } catch {}
    return loadDraft() ?? DEFAULT_FORM
  })
  const [fromSimple, setFromSimple] = useState(() => loadDraft()?._from_simple === true)
  const [fromSimpleDismissed, setFromSimpleDismissed] = useState(false)
  const [profilePrefilled, setProfilePrefilled] = useState(false)
  const [prefillDismissed, setPrefillDismissed] = useState(false)
  const [previewTargets, setPreviewTargets] = useState(null)

  // Step 0 = region, Steps 1-3 (or 1-4 with addons) = existing steps
  const totalSteps = previewTargets && needsDualTransporter(previewTargets) ? 5 : 4

  function handleRegionSelect(key) {
    setRegion(key)
    saveRegion(key)
  }

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

        if (profile.preferred_region) {
          saveRegion(profile.preferred_region)
          setRegion(profile.preferred_region)
        }

        if (profile.preferred_lang && profile.preferred_lang !== i18n.language) {
          i18n.changeLanguage(profile.preferred_lang)
          try { localStorage.setItem('lecka_lang', profile.preferred_lang) } catch {}
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') console.warn('[StepForm] profile prefill failed:', err)
      })
    return () => controller.abort()
  }, [])

  const stepValid = { 0: region != null, 1: isStep1Valid(form), 2: isStep2Valid(form), 3: isStep3Valid(form), 4: true }
  const canAdvance = stepValid[step] ?? true

  function handleNext() {
    if (step === 2) {
      // Compute preview targets so we know whether Step 4 (addons) is needed
      try {
        const weight_kg    = toKg(form.weight_value, form.weight_unit)
        const goal_minutes = effectiveGoalMinutes(form)
        const preview = calculateTargets({
          race_type:        form.race_type,
          goal_minutes,
          weight_kg,
          gender:           form.gender,
          conditions:       deriveConditionsFromForm(form),
          effort:           form.effort,
          caffeine_ok:      form.caffeine_ok,
          athlete_profile:  form.athlete_profile,
          elevation_gain_m: form.elevation_gain_m,
          distance_km:      parseFloat(form.custom_km) || 0,
          age_bracket:      form.age_bracket ?? null,
        })
        setPreviewTargets(preview)
      } catch {
        setPreviewTargets(null)
      }
      setStep(s => s + 1)
      return
    }

    // totalSteps = 4 (no addons: 0→1→2→3 then build) or 5 (addons: 0→1→2→3→4 then build)
    if (step < totalSteps - 1) {
      setStep(s => s + 1)
      return
    }

    // Final step — build the plan
    const weight_kg    = toKg(form.weight_value, form.weight_unit)
    const goal_minutes = effectiveGoalMinutes(form)
    const h = Math.floor(goal_minutes / 60)
    const m = goal_minutes % 60
    const goal_time = `${h}:${String(m).padStart(2, '0')}`
    const swim_minutes = form.sport === 'triathlon' ? (parseInt(form.swim_minutes, 10) || 0) : undefined
    const bike_minutes = form.sport === 'triathlon' ? (goalMinutesFromFields(form.bike_time_h, form.bike_time_m) ?? 0) : undefined
    const run_minutes  = form.sport === 'triathlon' ? (goalMinutesFromFields(form.run_time_h,  form.run_time_m)  ?? 0) : undefined

    const conditions = deriveConditionsFromForm(form)
    const modelTargets = calculateTargets({
      race_type:        form.race_type,
      goal_minutes,
      weight_kg,
      gender:           form.gender,
      conditions,
      effort:           form.effort,
      caffeine_ok:      form.caffeine_ok,
      athlete_profile:  form.athlete_profile,
      elevation_gain_m: form.elevation_gain_m,
      distance_km:      parseFloat(form.custom_km) || 0,
      training_mode:    form.training_mode,
      age_bracket:      form.age_bracket ?? null,
    })

    const useCustomTargets =
      form.custom_targets_mode === true &&
      parseInt(form.custom_carb_ph,   10) > 0 &&
      parseInt(form.custom_sodium_ph, 10) > 0 &&
      parseInt(form.custom_fluid_ph,  10) > 0

    let targets
    if (useCustomTargets) {
      const customCarb    = parseInt(form.custom_carb_ph,   10)
      const customSodium  = parseInt(form.custom_sodium_ph, 10)
      const customFluid   = parseInt(form.custom_fluid_ph,  10)
      const durationHours = goal_minutes / 60
      targets = {
        ...modelTargets,
        carb_per_hour:     customCarb,
        sodium_per_hour:   customSodium,
        fluid_ml_per_hour: customFluid,
        total_carbs:       Math.round(customCarb   * durationHours),
        total_sodium:      Math.round(customSodium * durationHours),
      }
    } else {
      targets = modelTargets
    }

    const allAddonProducts = [
      ...competitorProducts,
      ...(form.custom_products ?? []),
    ]

    const resolvedAddonItems = form.addon_items
      .filter(i => i.quantity > 0)
      .map(i => ({
        product:  allAddonProducts.find(p => p.id === i.id),
        quantity: i.quantity,
      }))
      .filter(i => i.product !== undefined)

    const addonCoverage      = computeAddonCoverage(resolvedAddonItems, goal_minutes)
    const foundationTargets  = computeFoundationTargets(targets, addonCoverage)
    const selection          = selectProducts(foundationTargets, form.preferred_product_ids, getSavedRegion(), {
      fuelling_style: form.fuelling_style,
      swim_minutes,
      bike_minutes,
      run_minutes,
    }, allProducts)

    try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
    onComplete({
      targets,
      foundationTargets,
      selection,
      addonCoverage,
      resolvedAddonItems,
      form: {
        ...form,
        conditions,
        goal_time,
        swim_minutes,
        bike_minutes,
        run_minutes,
        addon_carbs_per_hour:      Math.round(addonCoverage.carbs_per_hour ?? 0),
        foundation_carbs_per_hour: foundationTargets.carb_per_hour,
        custom_products:           form.custom_products ?? [],
        model_targets: useCustomTargets
          ? { carb_per_hour: modelTargets.carb_per_hour, sodium_per_hour: modelTargets.sodium_per_hour, fluid_ml_per_hour: modelTargets.fluid_ml_per_hour }
          : null,
      },
    })
  }

  return (
    <div className="bg-white">

      {/* ── Nav bar ── */}
      <Nav />

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
          <img src="/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" className="h-7" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {t('common:step.ofTotal', { step: step + 1, total: totalSteps })}
        </p>
        <h1 className="text-2xl font-bold text-[#1B1B1B] mt-1">
          {step === 0
            ? t('form:steps.region')
            : [
                t('form:steps.race'),
                t('form:steps.body'),
                t('form:steps.products'),
                t('form:steps.addons'),
              ][step - 1]}
        </h1>
      </div>

      {/* ── Step content ── */}
      <div className="max-w-md mx-auto w-full px-5 pb-4">
        {step === 0 && <StepRegion region={region} onSelect={handleRegionSelect} />}
        {step === 1 && <StepOne form={form} setForm={setForm} />}
        {step === 2 && (
          <StepTwo
            form={form}
            setForm={setForm}
            showPrefillBadge={
              (fromSimple && !fromSimpleDismissed) ||
              (profilePrefilled && !prefillDismissed && !(fromSimple && !fromSimpleDismissed))
            }
            prefillMessage={
              fromSimple && !fromSimpleDismissed
                ? t('form:prefill.fromSimple')
                : t('form:prefill.fromProfile')
            }
            onDismissPrefill={() => {
              if (fromSimple && !fromSimpleDismissed) setFromSimpleDismissed(true)
              else setPrefillDismissed(true)
            }}
          />
        )}
        {step === 3 && <StepThree form={form} setForm={setForm} />}
        {step === 4 && (
          <StepFour form={form} setForm={setForm} previewTargets={previewTargets} />
        )}
      </div>

      {/* ── Navigation — follows content naturally, no flex-1 stretch ── */}
      <div className="max-w-md mx-auto w-full px-5 py-5 flex items-center gap-3 border-t border-gray-100">
        {step > 0 && (
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
