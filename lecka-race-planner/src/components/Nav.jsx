import React from 'react'
import { isEmbedded } from '../embed.js'

const TEAL = '#1D9E75'

function LeckaIcon() {
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8 flex-shrink-0" fill="none">
      <rect width="32" height="32" rx="7" fill={TEAL} />
      <rect x="7.5" y="7.5" width="17" height="17" rx="3" stroke="white" strokeWidth="2.5" />
    </svg>
  )
}

export default function Nav() {
  if (isEmbedded) return null

  const userId  = localStorage.getItem('lecka_user_id')
  const email   = localStorage.getItem('lecka_user_email')
  const initial = email ? email[0].toUpperCase() : '?'

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
      <div className="max-w-4xl mx-auto flex items-center gap-4 px-5 py-3">

        {/* Left — logo */}
        <a href="/" className="flex items-center gap-2 flex-shrink-0">
          <LeckaIcon />
          <span className="text-base font-bold text-gray-900 tracking-tight">Lecka</span>
        </a>

        {/* Centre — navigation links */}
        <div className="flex-1 flex items-center justify-center gap-6">
          <a
            href="/dashboard"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            My Plans
          </a>
          <a
            href="/dashboard"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            History
          </a>
        </div>

        {/* Right — plan CTAs + avatar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href="/planner"
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:border-gray-400 transition-colors whitespace-nowrap"
          >
            Quick plan
          </a>
          <a
            href="/planner/pro"
            className="text-xs font-semibold px-3 py-1.5 rounded-full text-white whitespace-nowrap"
            style={{ background: TEAL }}
          >
            Pro plan
          </a>
          {userId ? (
            <a
              href="/dashboard"
              aria-label="My plans"
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white ml-1"
              style={{ background: TEAL }}
            >
              {initial}
            </a>
          ) : (
            <a
              href="/auth/login"
              className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap ml-1"
            >
              Log in
            </a>
          )}
        </div>

      </div>
    </div>
  )
}
