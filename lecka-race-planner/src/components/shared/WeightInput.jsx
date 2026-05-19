import React from 'react'

export function toKg(value, unit) {
  const n = parseFloat(value)
  if (!isFinite(n) || n <= 0) return null
  const kg = unit === 'lb' ? n / 2.20462 : n
  return kg >= 40 && kg <= 140 ? kg : null
}

export default function WeightInput({ value, unit, onChange }) {
  const weightOk      = toKg(value, unit) !== null
  const weightTouched = value !== ''
  const weightMin     = unit === 'kg' ? 40  : 88
  const weightMax     = unit === 'kg' ? 140 : 309

  function switchUnit(newUnit) {
    if (unit === newUnit) return
    const n = parseFloat(value)
    if (isFinite(n) && n > 0) {
      const converted = newUnit === 'lb'
        ? Math.round(n * 2.20462)
        : Math.round(n / 2.20462)
      onChange(String(converted), newUnit)
    } else {
      onChange(value, newUnit)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          maxLength={5}
          placeholder="e.g. 70"
          value={value}
          onChange={e => onChange(e.target.value, unit)}
          className={[
            'w-24 border-2 rounded-lg px-3 py-2.5 text-sm',
            'focus:outline-none focus:border-[#48C4B0]',
            weightTouched && !weightOk ? 'border-red-300' : 'border-gray-200',
          ].join(' ')}
        />
        <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden text-sm font-medium">
          {['kg', 'lb'].map(u => (
            <button
              key={u}
              type="button"
              onClick={() => switchUnit(u)}
              className={[
                'px-3 py-2 min-h-[38px] transition-colors',
                unit === u
                  ? 'bg-[#48C4B0] text-white'
                  : 'bg-white text-[#1B1B1B] hover:bg-gray-50',
              ].join(' ')}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      {weightTouched && !weightOk && (
        <p className="text-xs text-red-400 mt-1.5">
          Enter a valid weight ({weightMin}–{weightMax} {unit})
        </p>
      )}
    </div>
  )
}
