import React from 'react'
import { useTranslation } from 'react-i18next'
import regionsConfig from '../config/regions.json'

const LANG_LABELS = { de: 'DE', fr: 'FR', en: 'EN', da: 'DA' }

/**
 * Language toggle pill — only renders for regions with multiple languages (e.g. Switzerland).
 * Writes the choice to localStorage and the ?lang= URL param so it survives iframe reloads.
 */
export default function LanguageSwitcher({ region }) {
  const { i18n } = useTranslation()
  const langs = regionsConfig[region]?.languages ?? []

  if (langs.length <= 1) return null

  function switchLang(lang) {
    i18n.changeLanguage(lang)
    try {
      localStorage.setItem('lecka_lang', lang)
    } catch {
      // localStorage blocked in iframe — URL param is the fallback
    }
    const url = new URL(window.location.href)
    url.searchParams.set('lang', lang)
    window.history.replaceState({}, '', url)
  }

  return (
    <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden text-sm font-medium">
      {langs.map(lang => (
        <button
          key={lang}
          type="button"
          onClick={() => switchLang(lang)}
          className={[
            'px-3 py-1.5 min-h-[36px] transition-colors',
            i18n.language === lang
              ? 'bg-[#48C4B0] text-white'
              : 'bg-white text-[#1B1B1B] hover:bg-gray-50',
          ].join(' ')}
        >
          {LANG_LABELS[lang] ?? lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
