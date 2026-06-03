import React from 'react'

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

export default function PreFuelSection({ targets }) {
  const raceDuration = targets.total_duration_minutes
  const isLong       = raceDuration >= 120
  const isVeryLong   = raceDuration >= 240
  const conditions   = targets.conditions

  return (
    <div>
      <SectionLabel>Pre-race fueling</SectionLabel>
      <div className="border-2 border-gray-100 rounded-2xl p-5 space-y-5">

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            5–7 days out
          </p>
          <p className="text-sm text-[#374151] leading-relaxed">
            No dramatic diet changes. Keep eating the foods you train on — your body knows them. Focus on consistent meals, good sleep, and staying hydrated throughout the week.
          </p>
          {isLong && (
            <p className="text-sm text-[#374151] leading-relaxed mt-2">
              Start slightly increasing your carbohydrate portions from 3 days out — add an extra serving of rice, pasta, or oats to dinner. This tops up muscle glycogen without needing a full carb-load protocol.
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            Day before
          </p>
          {!isLong && (
            <p className="text-sm text-[#374151] leading-relaxed">
              No carb-loading needed for this distance. Eat a normal, familiar dinner — something you've had before training. Avoid anything heavy, rich, or new. Drink plenty of water through the day.
            </p>
          )}
          {isLong && !isVeryLong && (
            <p className="text-sm text-[#374151] leading-relaxed">
              Focus on carbohydrates at dinner: rice, pasta, or potatoes with a modest protein serving. Avoid high-fibre vegetables and heavy sauces. Drink steadily through the day — urine should be pale yellow by evening.
            </p>
          )}
          {isVeryLong && (
            <p className="text-sm text-[#374151] leading-relaxed">
              This distance benefits from a proper carb-load. Aim for ~8–10g of carbohydrate per kg of body weight across the day — mostly from rice, pasta, bread, or oats. Keep fat and fibre low. Drink 2–3L of water. Lay out your race kit and nutrition in the evening.
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            Race morning
          </p>
          <p className="text-sm text-[#374151] leading-relaxed">
            Eat your main pre-race meal 2.5–3 hours before your start. Aim for 60–90g of carbohydrates — a bowl of oats with banana and honey, white rice with a little salt, or toast with jam work well. Keep it simple and familiar.
          </p>
          {isVeryLong && (
            <p className="text-sm text-[#374151] leading-relaxed mt-2">
              For a race this long, also drink 500ml of water with a pinch of salt when you wake up. This helps prime blood plasma volume before you even start.
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            30–60 min before start
          </p>
          <p className="text-sm text-[#374151] leading-relaxed">
            In the 30–60 minutes before your start, have a Lecka bar or half a gel with 200–300ml of water. This gives your body a final carbohydrate top-up without sitting heavy. Avoid eating within 15 minutes of the gun — the insulin response can cause a brief energy dip early in the race.
          </p>
          {(conditions === 'hot' || conditions === 'humid') && (
            <p className="text-sm text-[#374151] leading-relaxed mt-2">
              In warm conditions, also sip an extra 300–500ml of water or electrolyte drink in this window.
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
