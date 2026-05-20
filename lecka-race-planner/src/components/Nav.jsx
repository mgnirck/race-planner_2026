import React from 'react'
import { isEmbedded } from '../embed.js'

export default function Nav() {
  if (isEmbedded) return null

  const userId  = localStorage.getItem('lecka_user_id')
  const email   = localStorage.getItem('lecka_user_email')
  const initial = email ? email[0].toUpperCase() : null

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
      <div className="flex items-center px-5 py-3">

        {/* Left — new plan links */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <a
            href="/planner"
            className="text-xs font-medium text-[#1B1B1B] hover:text-[#48C4B0] transition-colors whitespace-nowrap"
          >
            New Quick Plan
          </a>
          <span className="text-gray-200 text-xs">|</span>
          <a
            href="/planner/pro"
            className="text-xs font-medium text-[#1B1B1B] hover:text-[#48C4B0] transition-colors whitespace-nowrap"
          >
            New Pro Plan
          </a>
        </div>

        {/* Centre — logo */}
        <div className="flex-1 flex justify-center">
          <a href="/">
            <img src="/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" className="h-6" />
          </a>
        </div>

        {/* Right — auth */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {userId ? (
            <>
              <a
                href="/dashboard"
                className="text-xs font-medium text-[#1B1B1B] hover:text-[#48C4B0] transition-colors whitespace-nowrap"
              >
                My Plans
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
              className="text-xs font-medium text-[#1B1B1B] hover:text-[#48C4B0] transition-colors whitespace-nowrap"
            >
              Log in
            </a>
          )}
        </div>

      </div>
    </div>
  )
}
