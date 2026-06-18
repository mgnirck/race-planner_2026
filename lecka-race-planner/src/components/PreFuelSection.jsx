import React from 'react'
import { useTranslation } from 'react-i18next'

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

export default function PreFuelSection({ targets }) {
  const { t } = useTranslation('common')
  const raceDuration = targets.total_duration_minutes
  const isLong       = raceDuration >= 120
  const isVeryLong   = raceDuration >= 240
  const conditions   = targets.conditions

  return (
    <div>
      <SectionLabel>{t('prefuel.title')}</SectionLabel>
      <div className="border-2 border-gray-100 rounded-2xl p-5 space-y-5">

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            {t('prefuel.days57.title')}
          </p>
          <p className="text-sm text-[#374151] leading-relaxed">
            {t('prefuel.days57.body')}
          </p>
          {isLong && (
            <p className="text-sm text-[#374151] leading-relaxed mt-2">
              {t('prefuel.days57.carb')}
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            {t('prefuel.dayBefore.title')}
          </p>
          {!isLong && (
            <p className="text-sm text-[#374151] leading-relaxed">
              {t('prefuel.dayBefore.shortBody')}
            </p>
          )}
          {isLong && !isVeryLong && (
            <p className="text-sm text-[#374151] leading-relaxed">
              {t('prefuel.dayBefore.medBody')}
            </p>
          )}
          {isVeryLong && (
            <p className="text-sm text-[#374151] leading-relaxed">
              {t('prefuel.dayBefore.longBody')}
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            {t('prefuel.morning.title')}
          </p>
          <p className="text-sm text-[#374151] leading-relaxed">
            {t('prefuel.morning.body')}
          </p>
          {isVeryLong && (
            <p className="text-sm text-[#374151] leading-relaxed mt-2">
              {t('prefuel.morning.longExtra')}
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            {t('prefuel.before.title')}
          </p>
          <p className="text-sm text-[#374151] leading-relaxed">
            {t('prefuel.before.body')}
          </p>
          {(conditions === 'hot' || conditions === 'humid') && (
            <p className="text-sm text-[#374151] leading-relaxed mt-2">
              {t('prefuel.before.warmExtra')}
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
