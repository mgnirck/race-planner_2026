import React, { useEffect, useState } from 'react'
import ResultsPage from './ResultsPage'
import Nav from './Nav'

const planId = window.location.pathname.split('/')[2]

export default function PlanViewPage() {
  const [plan,    setPlan]    = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    const userId = localStorage.getItem('lecka_user_id')
    // Plans are publicly readable — auth header is optional and only used
    // to determine whether this visitor is the owner (enables extra UI).
    const headers = userId ? { Authorization: `Bearer ${userId}` } : {}

    fetch(`/api/plans/get?planId=${planId}`, { headers })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setIsOwner(data.isOwner ?? false)
        setPlan(data)
      })
      .catch(() => setError('Could not load plan.'))
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error}</p>
          <a href="/planner" className="text-[#48C4B0] font-semibold hover:underline">Build your own plan →</a>
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
      onBack={isOwner ? () => window.location.replace('/dashboard') : null}
      hideSave={!isOwner}
      isPublicView={!isOwner}
    />
  )
}
