import React, { useState } from 'react'
import StepForm    from './components/StepForm'
import ResultsPage from './components/ResultsPage'
import AdminPage   from './components/AdminPage'

// ── localStorage stats ────────────────────────────────────────────────────────

const STATS_KEY = 'lecka_plans_v1'
const MAX_STORED = 1000  // prevent unbounded growth

function recordPlan(race_type) {
  try {
    const raw  = localStorage.getItem(STATS_KEY)
    const list = raw ? JSON.parse(raw) : []
    list.push({ date: new Date().toISOString(), race_type })
    // Trim to the most recent MAX_STORED entries
    const trimmed = list.slice(-MAX_STORED)
    localStorage.setItem(STATS_KEY, JSON.stringify(trimmed))
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

  function handleComplete(result) {
    recordPlan(result.targets?.race_type ?? result.form?.race_type ?? 'unknown')
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
