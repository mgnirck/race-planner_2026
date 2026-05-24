import React, { useState, useMemo } from 'react'
import { isAvailableInRegion } from '../engine/region-utils.js'
import FALLBACK_PRODUCTS from '../config/products.json'

export const ADDON_CATALOG = [
  { id: 'maurten-160',     display_name: 'Maurten 160',     brand: 'Maurten', type: 'drink_mix', carbs_per_unit: 38, note: 'drink mix' },
  { id: 'maurten-gel-100', display_name: 'Maurten Gel 100', brand: 'Maurten', type: 'gel',       carbs_per_unit: 25, note: 'gel' },
  { id: 'sis-beta-fuel',   display_name: 'SiS Beta Fuel',   brand: 'SiS',     type: 'gel',       carbs_per_unit: 40, note: 'gel' },
  { id: 'huma-gel',        display_name: 'Huma Gel',        brand: 'Huma',    type: 'gel',       carbs_per_unit: 23, note: 'real fruit gel' },
  { id: 'nuun-sport',      display_name: 'Nuun Sport Tab',  brand: 'Nuun',    type: 'tab',       category: 'electrolyte', carbs_per_unit: 1,  sodium_per_unit: 300,  note: 'electrolyte tab' },
  { id: 'precision-h1500', display_name: 'Precision Hydration PH 1500', brand: 'Precision Hydration', type: 'tab', category: 'electrolyte', carbs_per_unit: 0, sodium_per_unit: 1500, note: 'high-sodium electrolyte tab' },
]

function formatTimingLabel(minutes) {
  if (minutes < 0) return `T-${Math.abs(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${minutes} min`
}

function timingSummary(leckaSelection, productId) {
  const item = leckaSelection.find(i => i.product.id === productId)
  if (!item || !item.timing_minutes || item.timing_minutes.length === 0) return ''
  const times = [...item.timing_minutes].sort((a, b) => a - b)
  if (times.length === 1) return `at ${formatTimingLabel(times[0])}`
  return times.map(formatTimingLabel).join(' · ')
}

function ProductIcon({ product }) {
  const isBar = product.type === 'bar'
  const isCaf = product.caffeine
  const bg  = isBar ? '#48C4B0' : isCaf ? '#1B1B1B' : '#48C4B0'
  const tag = isBar ? 'BAR' : isCaf ? 'CAF' : 'GEL'
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: bg, opacity: isCaf ? 1 : (isBar ? 0.75 : 1) }}
      aria-hidden="true"
    >
      <span className="text-white text-[10px] font-bold tracking-wide">{tag}</span>
    </div>
  )
}

function AdjBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[22px] h-[22px] rounded-full border border-gray-200 flex items-center
                 justify-center text-gray-500 text-sm leading-none
                 hover:border-[#48C4B0] hover:text-[#48C4B0] transition-colors"
    >
      {children}
    </button>
  )
}

function RemoveBtn({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[22px] h-[22px] rounded-full border border-red-100 flex items-center
                 justify-center text-red-300 text-sm leading-none
                 hover:border-red-300 hover:text-red-400 transition-colors"
    >
      ×
    </button>
  )
}

function AddChip({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] text-gray-400
                 border border-gray-200 rounded-full px-2.5 py-1 mt-2
                 hover:border-[#48C4B0] hover:text-[#48C4B0] transition-colors"
    >
      {label}
    </button>
  )
}

export default function PlanProductEditor({
  region,
  regionType,
  leckaSelection,
  resolvedAddonItems,
  addonOverrides,
  onAddonChange,
  manualQty,
  setManualQty,
  targets,
  provided,
  catalog,
}) {
  const allProducts = catalog ?? FALLBACK_PRODUCTS
  const [showLeckaPicker, setShowLeckaPicker] = useState(false)
  const [showAddonPicker, setShowAddonPicker] = useState(false)
  const [showCustomForm,  setShowCustomForm]  = useState(false)
  const [customName,      setCustomName]      = useState('')
  const [customCarbs,     setCustomCarbs]     = useState('')
  const [customProducts,  setCustomProducts]  = useState([])

  function currentQty(id) {
    if (manualQty !== null && id in manualQty) return manualQty[id]
    return leckaSelection.find(i => i.product.id === id)?.quantity ?? 0
  }

  const activeLeckaProducts = useMemo(() => {
    const seen = new Set()
    const products = []
    for (const item of leckaSelection) {
      if (seen.has(item.product.id)) continue
      seen.add(item.product.id)
      if ((manualQty?.[item.product.id] ?? item.quantity) > 0) {
        products.push(item.product)
      }
    }
    if (manualQty) {
      for (const [id, qty] of Object.entries(manualQty)) {
        if (qty > 0 && !seen.has(id)) {
          const p = allProducts.find(p => p.id === id)
          if (p) { products.push(p); seen.add(id) }
        }
      }
    }
    return products
  }, [leckaSelection, manualQty, allProducts])

  const availableToAdd = useMemo(() => {
    const activeIds = new Set(activeLeckaProducts.map(p => p.id))
    return allProducts.filter(p =>
      (p.type === 'gel' || p.type === 'ultra_gel' || p.type === 'bar') &&
      isAvailableInRegion(p, region) &&
      !activeIds.has(p.id)
    )
  }, [allProducts, activeLeckaProducts, region])

  function adjustLecka(id, delta) {
    const next = Math.max(0, currentQty(id) + delta)
    setManualQty(prev => ({ ...(prev ?? {}), [id]: next }))
  }

  function removeLecka(id) {
    setManualQty(prev => ({ ...(prev ?? {}), [id]: 0 }))
  }

  function addLeckaProduct(id) {
    setManualQty(prev => ({ ...(prev ?? {}), [id]: 1 }))
    setShowLeckaPicker(false)
  }

  const allAddonCatalog = useMemo(() => [...ADDON_CATALOG, ...customProducts], [customProducts])

  const visibleAddons = useMemo(() => [
    ...resolvedAddonItems.map(item => ({
      ...item,
      quantity: addonOverrides[item.product.id] ?? item.quantity,
    })),
    ...Object.entries(addonOverrides)
      .filter(([id, qty]) => qty > 0 && !resolvedAddonItems.find(i => i.product.id === id))
      .map(([id, qty]) => {
        const p = allAddonCatalog.find(a => a.id === id)
        return p ? { product: p, quantity: qty } : null
      })
      .filter(Boolean),
  ].filter(item => (addonOverrides[item.product.id] ?? item.quantity) > 0), [resolvedAddonItems, addonOverrides, allAddonCatalog])

  function adjustAddon(id, delta) {
    const current = visibleAddons.find(i => i.product.id === id)?.quantity ?? 0
    onAddonChange(id, Math.max(0, current + delta))
  }

  function addCustomAddon() {
    const id = `custom-${Date.now()}`
    const carbs = parseInt(customCarbs) || 0
    setCustomProducts(prev => [...prev, {
      id, display_name: customName.trim(), brand: null,
      type: 'custom', carbs_per_unit: carbs, note: 'custom',
    }])
    onAddonChange(id, 1)
    setShowAddonPicker(false)
    setShowCustomForm(false)
    setCustomName('')
    setCustomCarbs('')
  }

  return (
    <div className="space-y-4">
      {/* Lecka products */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
          Lecka products
        </p>
        <div>
          {activeLeckaProducts.map(product => (
            <div key={product.id}
                 className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
              <ProductIcon product={product} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#1B1B1B] truncate">{product.name}</p>
                <p className="text-[10px] text-gray-400">
                  {product.carbs_per_unit}g carbs · {timingSummary(leckaSelection, product.id)}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <AdjBtn onClick={() => adjustLecka(product.id, -1)}>−</AdjBtn>
                <span className="text-xs font-semibold w-4 text-center">{currentQty(product.id)}</span>
                <AdjBtn onClick={() => adjustLecka(product.id, +1)}>+</AdjBtn>
                <RemoveBtn onClick={() => removeLecka(product.id)} />
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-[#48C4B0] mt-1.5">
          Real food foundation — gut-friendly base for your race.
        </p>

        <AddChip onClick={() => setShowLeckaPicker(v => !v)} label="+ Add Lecka product" />

        {showLeckaPicker && (
          <div className="mt-1 border border-gray-100 rounded-xl overflow-hidden">
            {['gel', 'ultra_gel', 'bar'].map(type => {
              const products = availableToAdd.filter(p => p.type === type)
              if (!products.length) return null
              return (
                <div key={type}>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-300
                                px-3 py-1.5 bg-gray-50">
                    {type === 'ultra_gel' ? 'Ultra gels' : type === 'gel' ? 'Gels' : 'Bars'}
                  </p>
                  {products.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addLeckaProduct(p.id)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-left
                                 hover:bg-gray-50 transition-colors border-t border-gray-50"
                    >
                      <ProductIcon product={p} />
                      <div>
                        <p className="text-xs font-semibold text-[#1B1B1B]">{p.name}</p>
                        <p className="text-[10px] text-gray-400">{p.carbs_per_unit}g carbs per unit</p>
                      </div>
                    </button>
                  ))}
                </div>
              )
            })}
            {availableToAdd.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">All products already in plan</p>
            )}
          </div>
        )}
      </div>

      {/* Add-on products */}
      <div>
        <div className="flex items-center gap-2 my-2">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-300 whitespace-nowrap">
            Add-on products · buy separately
          </span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {visibleAddons.length > 0 && (
          <div>
            {visibleAddons.map(item => {
              const product = item.product
              const qty = item.quantity
              return (
                <div key={product.id}
                     className="flex items-center gap-2 py-1.5 border-b border-dashed border-gray-100 last:border-0">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-gray-400">
                      {product.brand?.slice(0, 3).toUpperCase() ?? 'ADD'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#1B1B1B] truncate">
                      {product.display_name ?? product.name}
                    </p>
                    <p className="text-[10px] text-gray-400 italic">buy separately</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <AdjBtn onClick={() => adjustAddon(product.id, -1)}>−</AdjBtn>
                    <span className="text-xs font-semibold w-4 text-center">{qty}</span>
                    <AdjBtn onClick={() => adjustAddon(product.id, +1)}>+</AdjBtn>
                    <RemoveBtn onClick={() => onAddonChange(product.id, 0)} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <AddChip onClick={() => setShowAddonPicker(v => !v)} label="+ Add other brand" />

        {showAddonPicker && (
          <div className="mt-1 border border-gray-100 rounded-xl overflow-hidden">
            {ADDON_CATALOG.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onAddonChange(p.id, 1); setShowAddonPicker(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-left
                           hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold text-gray-400">
                    {p.brand.slice(0, 3).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#1B1B1B]">{p.display_name}</p>
                  <p className="text-[10px] text-gray-400">{p.carbs_per_unit}g carbs · {p.note}</p>
                </div>
              </button>
            ))}

            {showCustomForm ? (
              <div className="px-3 py-2 border-t border-gray-50 space-y-2">
                <input
                  type="text"
                  placeholder="Product name"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs
                             focus:outline-none focus:border-[#48C4B0]"
                />
                <input
                  type="number"
                  placeholder="Carbs per unit (g)"
                  value={customCarbs}
                  onChange={e => setCustomCarbs(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs
                             focus:outline-none focus:border-[#48C4B0]"
                />
                <button
                  type="button"
                  onClick={addCustomAddon}
                  disabled={!customName.trim()}
                  className="w-full bg-[#48C4B0] text-white rounded-lg py-1.5 text-xs font-semibold
                             disabled:opacity-40"
                >
                  Add to plan
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCustomForm(true)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left
                           hover:bg-gray-50 border-t border-gray-50"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold text-gray-400">+</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#1B1B1B]">Custom product…</p>
                  <p className="text-[10px] text-gray-400">enter name and carbs manually</p>
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress bars */}
      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
        {[
          { label: 'Carbs covered',  provided: provided.carbs_per_hour_provided,  target: targets.carb_per_hour },
          { label: 'Sodium covered', provided: provided.sodium_per_hour_provided, target: targets.sodium_per_hour },
        ].map(({ label, provided: prov, target }) => {
          const pct = target > 0 ? Math.min(130, Math.round((prov / target) * 100)) : 0
          const color = pct >= 90 && pct <= 110 ? '#48C4B0'
                      : pct < 75  ? '#ef4444'
                      : pct < 90  ? '#f59e0b'
                      : '#3b82f6'
          return (
            <div key={label}>
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>{label}</span>
                <span style={{ color }} className="font-medium">{Math.min(pct, 130)}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
