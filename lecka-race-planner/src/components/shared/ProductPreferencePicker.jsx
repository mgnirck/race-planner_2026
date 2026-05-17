import React from 'react'
import { useTranslation } from 'react-i18next'
import { useProducts } from '../../hooks/useProducts.js'
import FALLBACK_PRODUCTS from '../../config/products.json'
import { isAvailableInRegion } from '../../engine/region-utils.js'

function ProductPreferenceCard({ product, selected, onToggle, caffeineOk, t }) {
  const isExcluded = !caffeineOk && product.caffeine
  return (
    <div className={isExcluded ? 'opacity-40 pointer-events-none' : ''}>
      <button
        type="button"
        onClick={onToggle}
        className={[
          'w-full px-4 py-3 rounded-xl border-2 text-left transition-colors',
          selected
            ? 'border-[#48C4B0] bg-[#48C4B0]/5'
            : 'border-gray-200 bg-white hover:border-[#48C4B0]/50',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold leading-tight ${selected ? 'text-[#48C4B0]' : 'text-[#1B1B1B]'}`}>
              {product.name}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              <span className="text-xs text-gray-400">{t('form:product.carbs', { value: product.carbs_per_unit })}</span>
              <span className="text-xs text-gray-400">{t('form:product.sodium', { value: product.sodium_per_unit })}</span>
              {product.caffeine && (
                <span className="text-xs font-medium text-[#48C4B0]">{t('form:product.caffeine', { value: product.caffeine_mg })}</span>
              )}
            </div>
          </div>
          <div
            className={[
              'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
              selected ? 'bg-[#48C4B0] border-[#48C4B0]' : 'border-gray-300',
            ].join(' ')}
          >
            {selected && (
              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </div>
      </button>
      {isExcluded && (
        <p className="text-xs text-gray-400 mt-1 pl-1">Caffeine — excluded from your plan</p>
      )}
    </div>
  )
}

export default function ProductPreferencePicker({ preferredProductIds, onToggle, region, caffeineOk }) {
  const { t } = useTranslation(['form', 'common'])
  const { products: liveProducts } = useProducts()
  const products = liveProducts ?? FALLBACK_PRODUCTS
  const gels = products.filter(p => p.type === 'gel' && isAvailableInRegion(p, region))
  const bars = products.filter(p => p.type === 'bar' && isAvailableInRegion(p, region))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Gels</p>
        <div className="space-y-2">
          {gels.map(gel => (
            <ProductPreferenceCard
              key={gel.id}
              product={gel}
              selected={preferredProductIds.includes(gel.id)}
              onToggle={() => onToggle(gel.id)}
              caffeineOk={caffeineOk}
              t={t}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Bars</p>
        <div className="space-y-2">
          {bars.map(bar => (
            <ProductPreferenceCard
              key={bar.id}
              product={bar}
              selected={preferredProductIds.includes(bar.id)}
              onToggle={() => onToggle(bar.id)}
              caffeineOk={caffeineOk}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
