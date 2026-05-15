import React, { useEffect, useState } from 'react'
import ResultsPage from './ResultsPage'
import Nav from './Nav'

const planId = window.location.pathname.split('/')[2]

export default function PlanViewPage() {
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const userId = localStorage.getItem('lecka_user_id')
    if (!userId) {
      localStorage.setItem('lecka_auth_next', window.location.pathname)
      window.location.replace('/auth/login')
      return
    }

    fetch(`/api/plans/get?planId=${planId}`, {
      headers: { Authorization: `Bearer ${userId}` },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setPlan)
      .catch(() => setError('Could not load plan.'))
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error}</p>
          <a href="/dashboard" className="text-[#48C4B0] font-semibold hover:underline">← Back to dashboard</a>
        </div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#48C4B0] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <ResultsPage
      targets={plan.targets}
      selection={plan.selection}
      form={plan.inputs}
      region={plan.region}
      onBack={() => window.location.replace('/dashboard')}
      hideSave
    />
  )
}
