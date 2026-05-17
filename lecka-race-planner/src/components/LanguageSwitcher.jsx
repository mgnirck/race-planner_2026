import React from 'react'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'fr', label: 'FR' },
  { code: 'da', label: 'DA' },
  { code: 'vi', label: 'VI' },
]

export default function LanguageSwitcher({ compact = false }) {
  const { i18n } = useTranslation()

  function switchLang(lang) {
    i18n.changeLanguage(lang)
    try { localStorage.setItem('lecka_lang', lang) } catch {}
    const url = new URL(window.location.href)
    url.searchParams.set('lang', lang)
    window.history.replaceState({}, '', url)
    const userId = localStorage.getItem('lecka_user_id')
    if (userId) {
      fetch('/api/auth/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userId}`,
        },
        body: JSON.stringify({ preferred_lang: lang }),
      }).catch(() => {})
    }
  }

  if (compact) {
    return (
      <select
        value={i18n.language}
        onChange={e => switchLang(e.target.value)}
        className="border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm
                   bg-white text-[#1B1B1B] focus:outline-none
                   focus:border-[#48C4B0] cursor-pointer"
        aria-label="Select language"
      >
        {LANGUAGES.map(l => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    )
  }

  return (
    <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden
                    text-sm font-medium" role="group" aria-label="Language">
      {LANGUAGES.map(l => (
        <button
          key={l.code}
          type="button"
          onClick={() => switchLang(l.code)}
          className={[
            'px-3 py-1.5 min-h-[36px] transition-colors',
            i18n.language === l.code
              ? 'bg-[#48C4B0] text-white'
              : 'bg-white text-[#1B1B1B] hover:bg-gray-50',
          ].join(' ')}
          aria-pressed={i18n.language === l.code}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
