import React, { useState } from 'react'
import StepForm       from './components/StepForm'
import ResultsPage    from './components/ResultsPage'
import AdminPage      from './components/AdminPage'
import VerifyPage     from './components/VerifyPage'
import DashboardPage  from './components/DashboardPage'
import FeedbackPage   from './components/FeedbackPage'
import { detectRegion } from './embed.js'

// ── Plan recording — server + localStorage ────────────────────────────────────

const STATS_KEY = 'lecka_plans_v1'
const MAX_STORED = 1000  // prevent unbounded growth

function recordPlan(race_type, region) {
  // 1. Server-side counter — fire-and-forget, never blocks the UI
  fetch('/api/record-plan', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ race_type, region }),
  }).catch(() => {})  // silently swallow network errors

  // 2. localStorage fallback — works offline and in dev without the API
  try {
    const raw  = localStorage.getItem(STATS_KEY)
    const list = raw ? JSON.parse(raw) : []
    list.push({ date: new Date().toISOString(), race_type, region })
    localStorage.setItem(STATS_KEY, JSON.stringify(list.slice(-MAX_STORED)))
  } catch {
    // localStorage unavailable (private browsing, quota) — silently skip
  }
}

// ── Simple path-based router ──────────────────────────────────────────────────

const PATH = window.location.pathname

export default function App() {
  // null → show form; object → show results
  const [plan, setPlan] = useState(null)

  // Admin route — password-gated aggregate stats
  if (PATH === '/admin') {
    return <AdminPage />
  }

  // Auth verify route — validates magic-link token, saves pending plan
  if (PATH === '/auth/verify') {
    return <VerifyPage />
  }

  // Athlete dashboard
  if (PATH === '/dashboard') {
    return <DashboardPage />
  }

  // Post-race feedback form
  if (PATH.startsWith('/feedback/')) {
    const planId = PATH.split('/')[2]
    return <FeedbackPage planId={planId} />
  }

  function handleComplete(result) {
    recordPlan(
      result.targets?.race_type ?? result.form?.race_type ?? 'unknown',
      detectRegion,
    )
    setPlan(result)
  }

  if (plan) {
    return (
      <ResultsPage
        targets={plan.targets}
        selection={plan.selection}
        form={plan.form}
        onBack={() => setPlan(null)}
      />
    )
  }

  return <StepForm onComplete={handleComplete} />
}
