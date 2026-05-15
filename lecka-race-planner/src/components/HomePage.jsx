import React from 'react'
import Nav from './Nav.jsx'

function StepIcon() {
  return (
    <div className="w-10 h-10 rounded-full bg-[#48C4B0]/10 flex items-center justify-center flex-shrink-0">
      <svg className="w-5 h-5 text-[#48C4B0]" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    </div>
  )
}

function TargetIcon() {
  return (
    <div className="w-10 h-10 rounded-full bg-[#48C4B0]/10 flex items-center justify-center flex-shrink-0">
      <svg className="w-5 h-5 text-[#48C4B0]" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    </div>
  )
}

function BagIcon() {
  return (
    <div className="w-10 h-10 rounded-full bg-[#48C4B0]/10 flex items-center justify-center flex-shrink-0">
      <svg className="w-5 h-5 text-[#48C4B0]" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="bg-white min-h-screen">
      <Nav />

      <div className="max-w-lg mx-auto px-5">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="pt-16 pb-14 text-center">
          <h1 className="text-4xl font-bold text-[#1B1B1B] leading-tight mb-4">
            Build your race<br />nutrition plan
          </h1>
          <p className="text-base text-gray-500 mb-10 max-w-sm mx-auto leading-relaxed">
            Science-based fueling for ultra runners and cyclists — built around real food.
          </p>
          <a
            href="/planner"
            className="inline-flex items-center justify-center min-h-[56px] px-10
                       bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl
                       text-base font-bold transition-colors"
          >
            Build my plan →
          </a>
        </div>

        {/* ── Three-step explainer ───────────────────────────────────────────── */}
        <div className="border-2 border-gray-100 rounded-2xl p-6 mb-8 space-y-6">
          <div className="flex items-start gap-4">
            <StepIcon />
            <div>
              <p className="text-sm font-semibold text-[#1B1B1B]">Tell us about your race</p>
              <p className="text-sm text-gray-400 mt-0.5">Distance, goal time, conditions, your body.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pl-5">
            <div className="w-px h-4 bg-gray-200 ml-[2px]" />
          </div>

          <div className="flex items-start gap-4">
            <TargetIcon />
            <div>
              <p className="text-sm font-semibold text-[#1B1B1B]">Get your personalised targets</p>
              <p className="text-sm text-gray-400 mt-0.5">Carbs, sodium and fluid per hour, calibrated to you.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pl-5">
            <div className="w-px h-4 bg-gray-200 ml-[2px]" />
          </div>

          <div className="flex items-start gap-4">
            <BagIcon />
            <div>
              <p className="text-sm font-semibold text-[#1B1B1B]">Order exactly what you need</p>
              <p className="text-sm text-gray-400 mt-0.5">Products, quantities and a race-day timeline — ready to buy.</p>
            </div>
          </div>
        </div>

        {/* ── Social proof ──────────────────────────────────────────────────── */}
        <p className="text-xs text-center text-gray-400 pb-16">
          Trusted by athletes in Vietnam, US, Germany, Denmark and Switzerland
        </p>

      </div>
    </div>
  )
}
