import React from 'react'
import { useTranslation } from 'react-i18next'

function buildProtocol(daysToRace, carbTarget, firstGelName, t) {
  const phases = [
    { share: 0.15, phaseKey: 'phase1', titleParams: {}, bodyParams: { gelName: firstGelName } },
    { share: 0.25, phaseKey: 'phase2', titleParams: { carbs: Math.round(carbTarget * 0.6) }, bodyParams: {} },
    { share: 0.35, phaseKey: 'phase3', titleParams: {}, bodyParams: {} },
    { share: 0.15, phaseKey: 'phase4', titleParams: {}, bodyParams: {} },
    { share: 0.10, phaseKey: 'phase5', titleParams: {}, bodyParams: {} },
  ]

  const useWeeks = daysToRace >= 28

  if (useWeeks) {
    let weekStart = 1
    return phases.map(phase => {
      const phaseDays = Math.round(daysToRace * phase.share)
      const weekEnd = weekStart + Math.ceil(phaseDays / 7) - 1
      const label = weekStart === weekEnd
        ? t(`gutTraining.week`, { n: weekStart })
        : t(`gutTraining.weeks`, { start: weekStart, end: weekEnd })
      weekStart = weekEnd + 1
      return {
        weekLabel: label,
        title: t(`gutTraining.${phase.phaseKey}.title`, phase.titleParams),
        body:  t(`gutTraining.${phase.phaseKey}.body`,  phase.bodyParams),
      }
    })
  }

  let dayStart = 1
  return phases.map(phase => {
    const phaseDays = Math.max(1, Math.round(daysToRace * phase.share))
    const dayEnd = Math.min(dayStart + phaseDays - 1, daysToRace)
    const label = dayStart === dayEnd
      ? t(`gutTraining.day`, { n: dayStart })
      : t(`gutTraining.days`, { start: dayStart, end: dayEnd })
    dayStart = dayEnd + 1
    return {
      weekLabel: label,
      title: t(`gutTraining.${phase.phaseKey}.title`, phase.titleParams),
      body:  t(`gutTraining.${phase.phaseKey}.body`,  phase.bodyParams),
    }
  })
}

export default function GutTrainingTab({ targets, form, leckaSelection }) {
  const { t } = useTranslation('results')
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
        {t('gutTraining.noDate')}
      </p>
    )
  }

  if (daysToRace < 14) {
    return (
      <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-xl p-4 text-xs text-amber-900">
        <p className="font-semibold mb-1">{t('gutTraining.raceWeekTitle')}</p>
        <p>{t('gutTraining.raceWeekBody')}</p>
      </div>
    )
  }

  const protocol = buildProtocol(daysToRace, targets.carb_per_hour, firstGelName, t)

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 leading-relaxed mb-3">
        {t('gutTraining.intro', { days: daysToRace, carbs: targets.carb_per_hour })}
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
        <p className="font-semibold mb-1">{t('gutTraining.nauseaTitle')}</p>
        <p>{t('gutTraining.nauseaBody')}</p>
      </div>
    </div>
  )
}
