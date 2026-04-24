import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import regionsConfig from './config/regions.json'
import { detectRegion } from './embed.js'

const SUPPORTED_LANGS = ['en', 'de', 'da', 'fr', 'vi']

/**
 * Determine the initial language using priority order:
 *   1. ?lang= URL param (explicit override — also persisted to localStorage)
 *   2. localStorage.lecka_lang (user's previous explicit choice)
 *   3. Region's defaultLanguage (from regions.json)
 *   4. 'en' fallback
 */
function getInitialLanguage() {
  try {
    const urlLang = new URLSearchParams(window.location.search).get('lang')
    if (urlLang && SUPPORTED_LANGS.includes(urlLang)) {
      localStorage.setItem('lecka_lang', urlLang)
      return urlLang
    }
    const stored = localStorage.getItem('lecka_lang')
    if (stored && SUPPORTED_LANGS.includes(stored)) return stored
  } catch {
    // localStorage blocked (Safari ITP in iframe) — continue to region default
  }
  const regionDefault = regionsConfig[detectRegion]?.defaultLanguage
  return (regionDefault && SUPPORTED_LANGS.includes(regionDefault)) ? regionDefault : 'en'
}

export const initialLanguage = getInitialLanguage()

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: initialLanguage,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS,
    ns: ['common', 'form', 'results', 'admin'],
    defaultNS: 'common',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
  })

export default i18n
