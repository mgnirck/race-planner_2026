import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isEmbedded } from '../embed.js'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import { logout } from '../auth.js'

const TEAL = '#1D9E75'

function AccountMenu({ email, initial }) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)

  return (
    <div className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={t('nav.myPlans')}
        aria-expanded={open}
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
        style={{ background: TEAL }}
      >
        {initial}
      </button>

      {open && (
        <>
          {/* Click-away layer */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 mt-2 w-56 z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1">
            {email && (
              <p className="px-4 py-2 text-xs text-gray-400 truncate border-b border-gray-100">{email}</p>
            )}
            <a
              href="/dashboard"
              className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t('nav.myPlans')}
            </a>
            <button
              type="button"
              onClick={() => { setOpen(false); logout() }}
              className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t('nav.logOut')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function Nav() {
  const { t } = useTranslation('common')
  if (isEmbedded) return null

  const userId  = localStorage.getItem('lecka_user_id')
  const email   = localStorage.getItem('lecka_user_email')
  const initial = email ? email[0].toUpperCase() : '?'

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
      <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3">

        {/* Left — logo */}
        <a href="/" className="flex items-center flex-shrink-0">
          <img
            src="/Lecka-Logo-New%20Green%20Font.png"
            alt="Lecka"
            className="h-5 sm:h-7"
          />
        </a>

        {/* Centre — navigation links */}
        <div className="flex-1 hidden sm:flex items-center justify-center gap-6">
          <a
            href="/dashboard"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            {t('nav.myPlans')}
          </a>
        </div>

        {/* Right — plan CTAs + avatar */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <a
            href="/planner/pro"
            className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-full text-white whitespace-nowrap"
            style={{ background: TEAL }}
          >
            {t('nav.buildPlan')}
          </a>
          <LanguageSwitcher compact />
          {userId ? (
            <AccountMenu email={email} initial={initial} />
          ) : (
            <a
              href="/auth/login"
              className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap ml-1"
            >
              {t('nav.logIn')}
            </a>
          )}
        </div>

      </div>
    </div>
  )
}

