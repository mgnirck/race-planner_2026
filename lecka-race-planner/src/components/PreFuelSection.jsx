import React, { useState } from 'react'

const FIELDS = [
  {
    key: 'diet',
    label: 'Diet',
    options: ['Omnivore', 'Vegetarian', 'Vegan', 'Gluten-free'],
  },
  {
    key: 'gi_sensitivity',
    label: 'GI sensitivity',
    options: ['Low (iron stomach)', 'Medium', 'High (sensitive gut)'],
  },
  {
    key: 'breakfast_time',
    label: 'Breakfast timing',
    options: ['2 hours before', '3 hours before', '4+ hours before'],
  },
  {
    key: 'coffee_habit',
    label: 'Coffee habit',
    options: ['Yes, daily', 'Occasionally', 'No'],
  },
  {
    key: 'race_morning_experience',
    label: 'Race morning experience',
    options: ['First time', 'Have a routine', 'Had problems before'],
  },
]

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

export default function PreFuelSection({ targets, form }) {
  const [answers, setAnswers] = useState({
    diet: '',
    gi_sensitivity: '',
    breakfast_time: '',
    coffee_habit: '',
    race_morning_experience: '',
  })
  const [state, setState] = useState('form') // 'form' | 'loading' | 'result' | 'error'
  const [plan, setPlan] = useState(null)

  const allAnswered = Object.values(answers).every(v => v !== '')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!allAnswered) return
    setState('loading')
    try {
      const weight_kg = (() => {
        if (!form?.weight_value) return null
        const n = parseFloat(form.weight_value)
        if (!isFinite(n)) return null
        return form.weight_unit === 'lb' ? n / 2.20462 : n
      })()

      const res = await fetch('/api/coach-copy?action=pre-fuel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          race_type:               targets.race_type,
          goal_minutes:            targets.total_duration_minutes,
          conditions:              targets.conditions,
          carb_per_hour:           targets.carb_per_hour,
          weight_kg,
          athlete_profile:         form?.athlete_profile ?? 'intermediate',
          gender:                  form?.gender ?? null,
          diet:                    answers.diet,
          gi_sensitivity:          answers.gi_sensitivity,
          breakfast_time:          answers.breakfast_time,
          coffee_habit:            answers.coffee_habit,
          race_morning_experience: answers.race_morning_experience,
        }),
      })
      const data = await res.json()
      if (data.pre_fuel) {
        setPlan(data.pre_fuel)
        setState('result')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  if (state === 'loading') {
    return (
      <div>
        <SectionLabel>Pre-race fueling</SectionLabel>
        <div className="border-2 border-gray-100 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Building your plan</p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-600">
              AI · Lecka knowledge
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-3/5" />
          <div className="mt-4 h-14 bg-amber-50 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div>
        <SectionLabel>Pre-race fueling</SectionLabel>
        <div className="border-2 border-gray-100 rounded-2xl p-5">
          <p className="text-sm text-gray-400 mb-3">Couldn&apos;t generate plan.</p>
          <button
            type="button"
            onClick={() => setState('form')}
            className="text-xs font-semibold text-[#48C4B0] hover:underline"
          >
            Retry →
          </button>
        </div>
      </div>
    )
  }

  if (state === 'result' && plan) {
    const sections = [
      { key: 't_minus_3_days', label: '3 DAYS OUT',                    value: plan.t_minus_3_days },
      { key: 't_minus_1_day',  label: 'DAY BEFORE',                    value: plan.t_minus_1_day },
      { key: 'race_morning',   label: 'RACE MORNING',                  value: plan.race_morning },
      { key: 'pre_start',      label: 'PRE-START (0–60 min before gun)', value: plan.pre_start },
    ]
    return (
      <div>
        <SectionLabel>Pre-race fueling</SectionLabel>
        <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-4 pb-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-600">
              AI · Lecka knowledge
            </span>
          </div>
          <div className="px-5 pb-5 space-y-5">
            {sections.map(({ key, label, value }) => (
              <div key={key}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
                  {label}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{value}</p>
              </div>
            ))}
            {plan.watch_out && (
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 mb-1">
                  Watch out for
                </p>
                <p className="text-sm text-amber-900">{plan.watch_out}</p>
              </div>
            )}
          </div>
          <div className="px-5 pb-4 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => { setState('form'); setPlan(null) }}
              className="text-xs font-semibold text-gray-400 hover:text-[#48C4B0] transition-colors"
            >
              Regenerate →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionLabel>Pre-race fueling</SectionLabel>
      <div className="border-2 border-gray-100 rounded-2xl p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          {FIELDS.map(field => (
            <div key={field.key}>
              <p className="text-xs font-semibold text-[#1B1B1B] mb-2">{field.label}</p>
              <div className="flex flex-wrap gap-2">
                {field.options.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswers(prev => ({ ...prev, [field.key]: option }))}
                    className={[
                      'px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                      answers[field.key] === option
                        ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                        : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#48C4B0]',
                    ].join(' ')}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="submit"
            disabled={!allAnswered}
            className="w-full min-h-[48px] bg-[#48C4B0] text-white rounded-xl text-sm font-semibold
                       disabled:opacity-40 transition-opacity mt-2"
          >
            Build my pre-race plan →
          </button>
        </form>
      </div>
    </div>
  )
}
