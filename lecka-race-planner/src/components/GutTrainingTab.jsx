import React from 'react'

function buildProtocol(daysToRace, carbTarget, firstGelName) {
  const phases = [
    { share: 0.15, title: 'Baseline — 2 gels per long run',
      body: `Take 2× ${firstGelName} on your next two long runs (60 min+). One at 20 min, one at 45 min. Focus on timing consistency. Note any stomach response in your training log.` },
    { share: 0.25, title: `Build to ${Math.round(carbTarget * 0.6)}g carbs/hour`,
      body: `Add a gel every 25 min across a 90-min long run. Swap one for your caffeine gel at the 1-hour mark. Your gut is learning to absorb carbohydrates under effort — this is the critical adaptation window.` },
    { share: 0.35, title: 'Race simulation — full protocol',
      body: `Two long runs at race effort, minimum 2 hours. Full protocol: bar before, gel every 25 min, caffeine at 1h and 2h. Treat these sessions like races. This is where gut training actually happens.` },
    { share: 0.15, title: 'Confidence run — lock the plan',
      body: `One 90-min run with your exact race protocol. If everything sits well, the plan is locked. No new products or changes after this point.` },
    { share: 0.10, title: "Taper — maintain, don't experiment",
      body: `Reduce volume but keep gel timing on shorter runs. Your gut adapts downward too — do not skip fuelling sessions in taper. Arrive at the start line with a trained gut.` },
  ]

  let weekStart = 1
  return phases.map(phase => {
    const phaseDays = Math.round(daysToRace * phase.share)
    const weekEnd = weekStart + Math.ceil(phaseDays / 7) - 1
    const label = weekStart === weekEnd
      ? `Week ${weekStart}`
      : `Weeks ${weekStart}–${weekEnd}`
    weekStart = weekEnd + 1
    return { weekLabel: label, title: phase.title, body: phase.body }
  })
}

export default function GutTrainingTab({ targets, form, leckaSelection }) {
  const raceDateStr = form.race_date ?? null
  const daysToRace = raceDateStr
    ? Math.round((new Date(raceDateStr + 'T00:00:00') - new Date()) / 86400000)
    : null
  const firstGelName = leckaSelection.find(
    i => i.product.type === 'gel' || i.product.type === 'ultra_gel'
  )?.product.name ?? 'Lecka gel'

  if (!raceDateStr) {
    return (
      <p className="text-xs text-gray-400 text-center py-6">
        Add your race date to see a personalised gut training protocol.
      </p>
    )
  }

  if (daysToRace < 14) {
    return (
      <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-xl p-4 text-xs text-amber-900">
        <p className="font-semibold mb-1">Race week</p>
        <p>Stick to exactly what you&apos;ve trained with. No new products.
           Keep gel timing consistent on your final shakeout run.</p>
      </div>
    )
  }

  const protocol = buildProtocol(daysToRace, targets.carb_per_hour, firstGelName)

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 leading-relaxed mb-3">
        {daysToRace} days to race day. Here&apos;s how to train your gut to absorb{' '}
        <span className="font-semibold text-[#1B1B1B]">{targets.carb_per_hour}g carbs/hour</span> comfortably.
        GI issues on race day are almost always a training failure, not bad luck.
      </p>

      {protocol.map((phase, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            {phase.weekLabel}
          </p>
          <p className="text-xs font-semibold text-[#1B1B1B] mb-1">{phase.title}</p>
          <p className="text-xs text-gray-500 leading-relaxed">{phase.body}</p>
        </div>
      ))}

      <div className="bg-[#E1F5EE] border border-[#9FE1CB] rounded-xl p-3 text-xs text-[#085041] leading-relaxed mt-2">
        <p className="font-semibold mb-1">If you feel nausea in training</p>
        <p>Drop one gel and hold that level for two runs before building again.
           Never race at a carb load you haven&apos;t practised.</p>
      </div>
    </div>
  )
}
