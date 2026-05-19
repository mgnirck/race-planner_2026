import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUPPORTED = ['en', 'de', 'da', 'fr', 'vi']
const cache = {}

function load(lng) {
  if (cache[lng] !== undefined) return cache[lng]
  try {
    const filePath = join(__dirname, 'locales', lng, 'pdf.json')
    const raw = readFileSync(filePath, 'utf8')
    cache[lng] = JSON.parse(raw)
  } catch (err) {
    console.error(`[i18n-server] Failed to load locale "${lng}":`, err.message)
    cache[lng] = null
  }
  return cache[lng]
}

function interp(str, params) {
  if (typeof str !== 'string') return String(str)
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    params[key] !== undefined ? params[key] : `{{${key}}}`
  )
}

/**
 * Returns a synchronous t(key, params) function for the given language.
 * Falls back to English for any missing key.
 */
export function getServerT(lang) {
  const lng = SUPPORTED.includes(lang) ? lang : 'en'
  const tr  = load(lng)
  const en  = load('en')

  // Verify English loaded — if not, we have a deployment problem
  if (!en) {
    console.error('[i18n-server] CRITICAL: English locale failed to load. ' +
      'Check that api/locales/en/pdf.json exists in the deployment.')
  }

  return function t(key, params = {}) {
    // Plural support
    if (params.count !== undefined) {
      const suffix    = params.count === 1 ? '_one' : '_other'
      const pluralKey = key + suffix
      const pluralVal = tr?.[pluralKey] ?? en?.[pluralKey]
      if (pluralVal) return interp(pluralVal, params)
    }

    const val = tr?.[key] ?? en?.[key]

    if (val === undefined || val === null) {
      console.warn(`[i18n-server] Missing translation key: "${key}" (lang: ${lng})`)
      return key  // fall back to key — visible in output as a signal
    }

    return interp(val, params)
  }
}
