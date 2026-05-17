import React, { useState, useEffect } from 'react'
import StepForm      from './components/StepForm'
import ResultsPage   from './components/ResultsPage'
import AdminPage     from './components/AdminPage'
import VerifyPage    from './components/VerifyPage'
import DashboardPage from './components/DashboardPage'
import FeedbackPage  from './components/FeedbackPage'
import HomePage      from './components/HomePage'
import LoginPage     from './components/LoginPage'
import PlanViewPage  from './components/PlanViewPage'
import { isEmbedded, getSavedRegion } from './embed.js'

// ── Plan recording — server + localStorage ────────────────────────────────────

const STATS_KEY        = 'lecka_plans_v1'
const MAX_STORED       = 1000
const CURRENT_PLAN_KEY = 'lecka_current_plan'

function saveCurrentPlan(result) {
  try {
    localStorage.setItem(CURRENT_PLAN_KEY, JSON.stringify(result))
  } catch {
    // storage full or unavailable — silently skip
  }
}

function loadCurrentPlan() {
  try {
    const raw = localStorage.getItem(CURRENT_PLAN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function recordPlan(race_type, region) {
  fetch('/api/record-plan', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ race_type, region }),
  }).catch(() => {})

  try {
    const raw  = localStorage.getItem(STATS_KEY)
    const list = raw ? JSON.parse(raw) : []
    list.push({ date: new Date().toISOString(), race_type, region })
    localStorage.setItem(STATS_KEY, JSON.stringify(list.slice(-MAX_STORED)))
  } catch {
    // localStorage unavailable — silently skip
  }
}

// ── Simple path-based router ──────────────────────────────────────────────────

const PATH = window.location.pathname

export default function App() {
  const [plan,           setPlan]           = useState(null)
  const [offlineBanner,  setOfflineBanner]  = useState(false)
  const [savedPlan,      setSavedPlan]      = useState(null)

  useEffect(() => {
    if (!navigator.onLine) {
      const stored = loadCurrentPlan()
      if (stored) {
        setSavedPlan(stored)
        setOfflineBanner(true)
      }
    }
  }, [])

  if (PATH === '/admin')        return <AdminPage />
  if (PATH === '/auth/verify')  return <VerifyPage />
  if (PATH === '/auth/login')   return <LoginPage />
  if (PATH === '/dashboard')    return <DashboardPage />
  if (PATH.startsWith('/feedback/')) {
    return <FeedbackPage planId={PATH.split('/')[2]} />
  }
  if (PATH.startsWith('/plan/')) {
    return <PlanViewPage />
  }

  // Standalone homepage — only when not in Shopify embed
  if (PATH === '/' && !isEmbedded) return <HomePage />

  // Planner flow — /planner (standalone) and / (embedded)
  function handleComplete(result) {
    recordPlan(
      result.targets?.race_type ?? result.form?.race_type ?? 'unknown',
      getSavedRegion(),
    )
    saveCurrentPlan(result)
    setPlan(result)
  }

  if (plan) {
    return (
      <ResultsPage
        targets={plan.targets}
        foundationTargets={plan.foundationTargets ?? plan.targets}
        selection={plan.selection}
        addonCoverage={plan.addonCoverage ?? null}
        resolvedAddonItems={plan.resolvedAddonItems ?? []}
        form={plan.form}
        onBack={() => {
          try { sessionStorage.removeItem('lecka_form_draft') } catch {}
          isEmbedded ? setPlan(null) : window.location.replace('/planner')
        }}
      />
    )
  }

  return (
    <>
      {offlineBanner && savedPlan && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#1B1B1B] text-white
                        px-4 py-3 flex items-center justify-between gap-3 text-sm shadow-lg">
          <span>You&apos;re offline. Want to view your last saved plan?</span>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => { setPlan(savedPlan); setOfflineBanner(false) }}
              className="px-3 py-1.5 bg-[#48C4B0] text-white rounded-lg font-semibold text-xs"
            >
              Restore plan
            </button>
            <button
              type="button"
              onClick={() => setOfflineBanner(false)}
              className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <StepForm onComplete={handleComplete} />
    </>
  )
}
