import { createRequire } from 'module'

const _require = createRequire(import.meta.url)
const SUPPORTED = ['en', 'de', 'da', 'fr']
const cache = {}

function load(lng) {
  if (cache[lng] !== undefined) return cache[lng]
  try {
    cache[lng] = _require(`./locales/${lng}/pdf.json`)
  } catch {
    cache[lng] = null
  }
  return cache[lng]
}

function interp(str, params) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? `{{${key}}}`)
}

/**
 * Returns a synchronous t(key, params) function for the given language.
 * Falls back to English for any missing key.
 */
export function getServerT(lang) {
  const lng = SUPPORTED.includes(lang) ? lang : 'en'
  const tr  = load(lng)
  const en  = load('en')

  return function t(key, params = {}) {
    if (params.count !== undefined) {
      const suffix     = params.count === 1 ? '_one' : '_other'
      const pluralVal  = tr?.[key + suffix] ?? en?.[key + suffix]
      if (pluralVal) return interp(pluralVal, params)
    }
    const val = tr?.[key] ?? en?.[key] ?? key
    return interp(val, params)
  }
}
