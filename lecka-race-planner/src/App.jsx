import React, { useState } from 'react'
import StepForm    from './components/StepForm'
import ResultsPage from './components/ResultsPage'

export default function App() {
  // null → show form; object → show results
  const [plan, setPlan] = useState(null)

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

  return <StepForm onComplete={setPlan} />
}
