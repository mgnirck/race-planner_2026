import React, { useState } from 'react'
import StepForm      from './components/StepForm'
import ResultsPage   from './components/ResultsPage'
import AdminPage     from './components/AdminPage'
import VerifyPage    from './components/VerifyPage'
import DashboardPage from './components/DashboardPage'
import FeedbackPage  from './components/FeedbackPage'
import HomePage      from './components/HomePage'
import LoginPage     from './components/LoginPage'
import PlanViewPage  from './components/PlanViewPage'
import { isEmbedded, detectRegion } from './embed.js'

// ── Plan recording — server + localStorage ────────────────────────────────────

const STATS_KEY  = 'lecka_plans_v1'
const MAX_STORED = 1000

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
  const [plan, setPlan] = useState(null)

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
        onBack={() => isEmbedded ? setPlan(null) : window.location.replace('/planner')}
      />
    )
  }

  return <StepForm onComplete={handleComplete} />
}
