/**
 * url-prefill.js
 *
 * Lets a page that links to /planner/pro (the Shopify race quiz) pre-fill the
 * planner through the query string, e.g.
 *
 *   /planner/pro?region=vn&lang=vi&race=marathon&time=270&effort=race_pace&sweat=salty&climate=humid&profile=intermediate
 *
 * The params are turned into the same `lecka_pro_prefill` sessionStorage entry
 * the homepage writes, so StepForm needs no second prefill path. This module
 * runs once at import time and must be imported before StepForm reads the key.
 * The quiz params are then stripped from the address bar so a reload keeps the
 * athlete's own edits (region, lang and utm_* stay).
 *
 *   race    10k | half_marathon | marathon | ultra_50k | ultra_100k |
 *           triathlon_70_3 | triathlon_olympic | triathlon_140_6 | cycling
 *   time    goal finish time in minutes (ignored for triathlon: the planner
 *           asks for swim/bike/run splits)
 *   km      distance for running (overrides the race's standard distance and
 *           sets the race type from it) and cycling
 *   elev    elevation gain in metres (running and cycling)
 *   surface trail | road (running)
 *   effort  easy | race_pace | hard
 *   profile untrained | intermediate | trained | elite
 *   sweat   light | average | salty
 *   climate humid | hot | warm | mild | cool
 */

import { distanceToRaceType } from './form-helpers.js'

const RUN_KM = {
  '5k':          '5',
  '10k':         '10',
  half_marathon: '21.1',
  marathon:      '42.2',
  ultra_50k:     '50',
  ultra_100k:    '100',
}

const TRI_KM = {
  triathlon_sprint:  '51',
  triathlon_olympic: '51.5',
  triathlon_70_3:    '113',
  triathlon_140_6:   '226',
}

// climate → the planner's temperature + humidity pair (see deriveConditionsFromForm)
const CLIMATE = {
  cool:  { temperature: 'cool', humidity: 'dry'   },
  mild:  { temperature: 'mild', humidity: 'dry'   },
  warm:  { temperature: 'warm', humidity: 'dry'   },
  humid: { temperature: 'warm', humidity: 'humid' },
  hot:   { temperature: 'hot',  humidity: 'dry'   },
}

const EFFORTS  = ['easy', 'race_pace', 'hard']
const SWEATS   = ['light', 'average', 'salty']
const PROFILES = ['untrained', 'intermediate', 'trained', 'elite']
const QUIZ_PARAMS = ['race', 'time', 'km', 'elev', 'surface', 'effort', 'sweat', 'climate', 'profile']

export function prefillFromParams(params) {
  const race = params.get('race')
  if (!race) return null

  let prefill
  if (TRI_KM[race]) {
    prefill = {
      sport:          'triathlon',
      triathlon_type: race,
      race_type:      race,
      custom_km:      TRI_KM[race],
      surface_type:   'road',
    }
  } else if (race === 'cycling') {
    const km = parseFloat(params.get('km'))
    prefill = {
      sport:        'cycling',
      race_type:    'cycling',
      surface_type: 'road',
      ...(km > 0 ? { custom_km: String(km), custom_km_display: String(km), dist_unit: 'km' } : {}),
    }
  } else if (RUN_KM[race]) {
    const customKm = parseFloat(params.get('km'))
    const km = customKm > 0 && customKm <= 500 ? String(customKm) : RUN_KM[race]
    const surface = params.get('surface')
    prefill = {
      sport:             'running',
      race_type:         distanceToRaceType(parseFloat(km)),
      custom_km:         km,
      custom_km_display: km,
      dist_unit:         'km',
      surface_type:      surface === 'trail' || surface === 'road' ? surface : (race.startsWith('ultra') ? 'trail' : 'road'),
    }
  } else {
    return null
  }

  const elev = parseInt(params.get('elev'), 10)
  if (prefill.sport !== 'triathlon' && elev > 0 && elev < 20000) {
    prefill.elevation_gain_m = elev
    prefill.elev_display     = String(elev)
    prefill.elev_unit        = 'm'
  }

  const minutes = parseInt(params.get('time'), 10)
  if (prefill.sport !== 'triathlon' && minutes > 0 && minutes < 6000) {
    prefill.goal_time_h = String(Math.floor(minutes / 60))
    prefill.goal_time_m = String(minutes % 60)
  }

  const effort = params.get('effort')
  if (EFFORTS.includes(effort)) prefill.effort = effort

  const sweat = params.get('sweat')
  if (SWEATS.includes(sweat)) prefill.sweat_profile = sweat

  const profile = params.get('profile')
  if (PROFILES.includes(profile)) prefill.athlete_profile = profile

  const climate = CLIMATE[params.get('climate')]
  if (climate) Object.assign(prefill, climate)

  // Hide the sport picker on step 1, as for the homepage prefill
  prefill._from_home = true
  return prefill
}

try {
  const url = new URL(window.location.href)
  const prefill = prefillFromParams(url.searchParams)
  if (prefill) {
    sessionStorage.setItem('lecka_pro_prefill', JSON.stringify(prefill))
    QUIZ_PARAMS.forEach(p => url.searchParams.delete(p))
    window.history.replaceState({}, '', url)
  }
} catch {
  // storage unavailable — the planner simply starts empty
}
