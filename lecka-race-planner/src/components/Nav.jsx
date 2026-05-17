import React from 'react'
import { isEmbedded } from '../embed.js'

export default function Nav({ backHref, backLabel }) {
  if (isEmbedded) return null

  const userId  = localStorage.getItem('lecka_user_id')
  const email   = localStorage.getItem('lecka_user_email')
  const initial = email ? email[0].toUpperCase() : null

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
      <div className="max-w-lg mx-auto px-5 py-3 flex items-center">

        {/* Left — back link or spacer */}
        <div className="w-28 flex-shrink-0">
          {backHref && (
            <a
              href={backHref}
              className="text-sm text-[#48C4B0] font-medium hover:underline
                         min-h-[44px] flex items-center"
            >
              ← {backLabel || 'Back'}
            </a>
          )}
        </div>

        {/* Centre — logo */}
        <div className="flex-1 flex justify-center">
          <a href="/">
            <img src="/logo.svg" alt="Lecka" className="h-6" />
          </a>
        </div>

        {/* Right — auth */}
        <div className="w-28 flex-shrink-0 flex items-center justify-end gap-2">
          {/* Language switcher — re-enable when translations complete */}
          {userId ? (
            <>
              <a
                href="/dashboard"
                className="text-sm font-medium text-[#1B1B1B] hover:text-[#48C4B0]
                           transition-colors hidden sm:block"
              >
                My plans
              </a>
              <a
                href="/planner/pro"
                className="text-sm font-medium text-[#1B1B1B] hover:text-[#48C4B0]
                           transition-colors hidden sm:block"
              >
                Pro plan
              </a>
              <a
                href="/dashboard"
                aria-label="My plans"
                className="w-8 h-8 rounded-full bg-[#48C4B0] text-white flex items-center
                           justify-center text-xs font-bold flex-shrink-0 hover:bg-[#3db09d]
                           transition-colors"
              >
                {initial}
              </a>
            </>
          ) : (
            <a
              href="/auth/login"
              className="text-sm font-medium text-[#1B1B1B] hover:text-[#48C4B0] transition-colors"
            >
              Log in
            </a>
          )}
        </div>

      </div>
    </div>
  )
}
