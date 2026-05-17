import React, { useState, useEffect, useMemo } from 'react'
import Nav from './Nav.jsx'
import { buildCartURLFromAggregated } from '../engine/shopify-link.js'
import { computeCartItems, computeLinePrice, isAvailableInRegion } from '../engine/region-utils.js'
import { isEmbedded, embedCartURL, getSavedRegion, saveRegion, getRegionConfig } from '../embed.js'
import { useProducts } from '../hooks/useProducts.js'
import FALLBACK_PRODUCTS from '../config/products.json'
import regionsConfig from '../config/regions.json'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import i18n from '../i18n.js'
import { formatAddonSummary } from '../engine/kit-calculator.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const COACH_COPY_TTL_MS = 24 * 60 * 60 * 1000

const RACE_LABELS = {
  '5k':              '5 km',
  '10k':             '10 km',
  'half_marathon':   'Half Marathon',
  'marathon':        'Marathon',
  'ultra_50k':       'Ultra 50 km',
  'ultra_100k':      'Ultra 100 km+',
  'triathlon_70_3':  '70.3 Triathlon',
  'triathlon_140_6': 'Ironman 140.6',
}

const CONDITION_LABELS = {
  cool:  '❄️ Cool',
  mild:  '🌤 Mild',
  warm:  '☀️ Warm',
  hot:   '🔥 Hot',
  humid: '💧 Humid',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function formatPrice(amount, symbol, decimals = 2) {
  const num = decimals === 0
    ? Math.round(amount).toLocaleString('en-US')
    : amount.toFixed(decimals)
  return `${symbol}${num}`
}

function buildPlainTiming(item) {
  const timings = item.timing_minutes ?? []
  if (!timings.length) return ''

  const duringTimings = timings.filter(t => t >= 0)
  const beforeTimings = timings.filter(t => t < 0)

  if (duringTimings.length === 0 && beforeTimings.length > 0) {
    const abs = Math.abs(beforeTimings[0])
    return `${abs} min before your start`
  }

  if (duringTimings.length === 1) {
    if (duringTimings[0] === 0) return 'at race start'
    return `at ${duringTimings[0]} min`
  }

  const intervals = duringTimings.slice(1).map((t, i) => t - duringTimings[i])
  const allSame = intervals.every(iv => iv === intervals[0])
  if (allSame && intervals.length > 0) {
    const start = duringTimings[0]
    return `every ${intervals[0]} min from ${start} min in`
  }

  return `at ${duringTimings.slice(0, 3).map(t => `${t} min`).join(', ')}`
}

function aggregateByProduct(selection, region, catalog = FALLBACK_PRODUCTS) {
  const map = {}
  for (const item of selection) {
    const id = item.product.id
    if (!map[id]) map[id] = { product: item.product, totalUnits: 0 }
    map[id].totalUnits += item.quantity
  }
  return Object.values(map)
    .map(({ product, totalUnits }) => {
      const cartItems = computeCartItems(product, region, totalUnits)
      const linePrice = computeLinePrice(product, region, totalUnits)
      const cartUnits = cartItems.reduce((s, item) => s + item.quantity * item.units_per_pack, 0)
      return { product, totalUnits, cartItems, linePrice, cartUnits }
    })
    .filter(row => row.cartItems.length > 0)
}

function getCoachCopyFromCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { copy, timestamp } = JSON.parse(raw)
    if (Date.now() - timestamp > COACH_COPY_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }
    return copy
  } catch {
    return null
  }
}

function setCoachCopyCache(key, copy) {
  try {
    localStorage.setItem(key, JSON.stringify({ copy, timestamp: Date.now() }))
  } catch {}
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

function ProductIcon({ product }) {
  const isBar = product.type === 'bar'
  const isCaf = product.caffeine
  const bg  = isBar ? '#48C4B0' : isCaf ? '#1B1B1B' : '#48C4B0'
  const tag = isBar ? 'BAR' : isCaf ? 'CAF' : 'GEL'
  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: bg, opacity: isBar ? 0.75 : 1 }}
    >
      <span className="text-white text-xs font-bold tracking-wide">{tag}</span>
    </div>
  )
}

function SimpleProductCard({ product, totalUnits, cartItems, linePrice, cartUnits, currencySymbol = '$', decimals = 2 }) {
  const packSummary = cartItems
    .map(item => item.units_per_pack === 1
      ? `${item.quantity} single`
      : `${item.quantity}×${item.units_per_pack}-pack`)
    .join(' + ')

  return (
    <div className="border-2 border-gray-100 rounded-2xl p-4 flex items-start gap-4">
      <ProductIcon product={product} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1B1B1B] leading-tight">{product.name}</p>
        <p className="text-xs text-gray-400 mt-1">
          {totalUnits} for race · {packSummary}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-[#1B1B1B]">{formatPrice(linePrice, currencySymbol, decimals)}</p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SimpleResultsPage({ targets, selection, form, onBack }) {
  const [region,     setRegion]     = useState(getSavedRegion())
  const [coachCopy,  setCoachCopy]  = useState(null)
  const [coachLoading, setCoachLoading] = useState(true)
  const [emailInput,  setEmailInput]  = useState('')
  const [emailState,  setEmailState]  = useState('idle') // idle | sending | success | error
  const [planSent,    setPlanSent]    = useState(false)
  const [chatSummary, setChatSummary] = useState(null)

  const { products: liveProducts } = useProducts()
  const catalog = liveProducts ?? FALLBACK_PRODUCTS
  const regionConfig = getRegionConfig(region)

  const leckaSelection = useMemo(
    () => selection.filter(item => item.product?.type !== 'powder_placeholder'),
    [selection]
  )

  const aggregated = useMemo(
    () => region ? aggregateByProduct(leckaSelection, region, catalog) : [],
    [leckaSelection, region, catalog]
  )

  const subtotal   = aggregated.reduce((sum, row) => sum + row.linePrice, 0)
  const totalPacks = aggregated.reduce(
    (sum, row) => sum + row.cartItems.reduce((s, item) => s + item.quantity, 0), 0
  )

  const cartURL = useMemo(
    () => region ? embedCartURL(buildCartURLFromAggregated(aggregated, 'NUTRIPLAN10', '', region)) : null,
    [aggregated, region]
  )

  const totalGelCount = useMemo(
    () => selection.filter(i => i.product?.type === 'gel' || i.product?.type === 'ultra_gel')
      .reduce((sum, i) => sum + i.quantity, 0),
    [selection]
  )

  const avgGelCarbs = useMemo(() => {
    const gels = selection.filter(i => i.product?.type === 'gel' || i.product?.type === 'ultra_gel')
    if (!gels.length) return 30
    const total = gels.reduce((s, i) => s + (i.product.carbs_per_unit ?? 30) * i.quantity, 0)
    const count = gels.reduce((s, i) => s + i.quantity, 0)
    return count > 0 ? total / count : 30
  }, [selection])

  const gelsPerHour = targets.total_duration_minutes > 0
    ? Math.round((targets.carb_per_hour / avgGelCarbs) * 10) / 10
    : 0

  // ── Auto-send plan if email provided in form ──────────────────────────────
  useEffect(() => {
    if (!form.email) return
    fetch('/api/send-plan', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:            form.email,
        targets,
        inputs:           form,
        selectedProducts: selection,
        region:           region ?? 'us',
        lang:             i18n.language,
        addon_items_summary: formatAddonSummary([]),
      }),
    })
      .then(r => r.ok ? setPlanSent(true) : null)
      .catch(() => {})
  }, [])

  // ── Silent plan save for logged-in users ──────────────────────────────────
  useEffect(() => {
    const userId = localStorage.getItem('lecka_user_id')
    if (!userId) return
    fetch('/api/plans', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${userId}`,
      },
      body: JSON.stringify({
        inputs:    { ...form, addon_items: [] },
        targets,
        selection,
        region:    region ?? 'us',
        lang:      i18n.language,
      }),
    }).catch(() => {})
  }, [])

  // ── Coach copy fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    const cacheKey = `lecka_coach_copy_${targets.race_type}_${targets.total_duration_minutes}_${targets.conditions}`
    const cached = getCoachCopyFromCache(cacheKey)
    if (cached) {
      setCoachCopy(cached)
      setCoachLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 8000)

    fetch('/api/coach-copy', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  controller.signal,
      body:    JSON.stringify({
        race_type:        targets.race_type,
        goal_minutes:     targets.total_duration_minutes,
        conditions:       targets.conditions,
        carb_per_hour:    targets.carb_per_hour,
        sodium_per_hour:  targets.sodium_per_hour,
        fluid_ml_per_hour: targets.fluid_ml_per_hour,
        total_carbs:      targets.total_carbs,
        gel_count:        totalGelCount,
        elevation_tier:   targets.elevation_tier,
        athlete_profile:  form.athlete_profile,
        gender:           form.gender,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        clearTimeout(timeout)
        if (data?.copy) {
          setCoachCopyCache(cacheKey, data.copy)
          setCoachCopy(data.copy)
        }
        setCoachLoading(false)
      })
      .catch(() => {
        clearTimeout(timeout)
        setCoachLoading(false)
      })

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  function handleRegionChange(newRegion) {
    setRegion(newRegion)
    saveRegion(newRegion)
    const userId = localStorage.getItem('lecka_user_id')
    if (userId) {
      fetch('/api/auth/me', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({ preferred_region: newRegion }),
      }).catch(() => {})
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => execCopy(text))
    } else {
      execCopy(text)
    }
  }

  function execCopy(text) {
    const el = document.createElement('textarea')
    el.value = text
    el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(el)
    el.focus()
    el.select()
    try { document.execCommand('copy') } catch (_) {}
    document.body.removeChild(el)
  }

  function handleChatClick(chatUrl) {
    const lines = aggregated.map(row =>
      `• ${row.totalUnits}x ${row.product.name} — ${formatPrice(row.linePrice, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}`
    ).join('\n')
    const summary = [
      'My Lecka race nutrition plan:',
      lines,
      `Total: ${formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}`,
      'Code NUTRIPLAN10 applied',
    ].join('\n')
    setChatSummary(summary)
    copyToClipboard(summary)
    window.open(chatUrl, '_blank', 'noopener,noreferrer')
  }

  async function handleSendEmail(e) {
    e.preventDefault()
    const emailVal = emailInput.trim()
    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) return
    setEmailState('sending')
    try {
      const res = await fetch('/api/send-plan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:            emailVal,
          targets,
          inputs:           form,
          selectedProducts: selection,
          region:           region ?? 'us',
          lang:             i18n.language,
          addon_items_summary: formatAddonSummary([]),
        }),
      })
      setEmailState(res.ok ? 'success' : 'error')
    } catch {
      setEmailState('error')
    }
  }

  const isLoggedIn    = Boolean(localStorage.getItem('lecka_user_id'))
  const heroTitle     = (form.race_name && form.race_name.trim()) || RACE_LABELS[targets.race_type] ?? targets.race_type
  const conditionText = CONDITION_LABELS[targets.conditions] ?? targets.conditions

  function formatRaceDate(dateStr) {
    if (!dateStr) return null
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  function daysUntilRace(dateStr) {
    if (!dateStr) return null
    const race  = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((race - today) / (1000 * 60 * 60 * 24))
  }

  return (
    <div className="bg-white">
      {/* Teal top border */}
      <div className="h-1 w-full bg-[#48C4B0]" />

      {/* Nav */}
      {isEmbedded ? (
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
          <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-[#48C4B0] font-medium hover:underline min-h-[44px] flex items-center"
            >
              ← Back
            </button>
            <img src="/logo.svg" alt="Lecka" className="h-6" />
            <LanguageSwitcher compact />
          </div>
        </div>
      ) : (
        <Nav />
      )}

      <div className="max-w-lg mx-auto px-5 py-6 space-y-8">

        {/* ── Section 1: Hero ───────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#48C4B0] mb-1">
            Your plan
          </p>
          <h1 className="text-2xl font-bold text-[#1B1B1B]">{heroTitle}</h1>
          <p className="text-sm text-gray-400 mt-1.5">
            {formatDuration(targets.total_duration_minutes)}
            {' · '}
            {conditionText}
            {' · Race pace'}
          </p>
          {form.race_date && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-gray-500">
                📅 {formatRaceDate(form.race_date)}
              </span>
              {daysUntilRace(form.race_date) > 0 && (
                <span className="text-xs font-semibold text-white bg-[#48C4B0] px-2.5 py-0.5 rounded-full">
                  {daysUntilRace(form.race_date)} days to go
                </span>
              )}
              {daysUntilRace(form.race_date) === 0 && (
                <span className="text-xs font-semibold text-white bg-[#F64866] px-2.5 py-0.5 rounded-full">
                  Race day! 🎉
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Section 2: Numbers ───────────────────────────────────────────── */}
        <section>
          <SectionLabel>Your targets</SectionLabel>
          <div className="border-2 border-gray-100 rounded-2xl p-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              {/* Carbs */}
              <div>
                <p className="text-2xl font-bold text-[#48C4B0]">{targets.carb_per_hour}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">g carbs<br />per hour</p>
                <p className="text-xs text-gray-400 italic mt-1 leading-tight">
                  About {gelsPerHour} gel{gelsPerHour === 1 ? '' : 's'} per hour
                </p>
              </div>
              {/* Sodium */}
              <div>
                <p className="text-2xl font-bold text-[#48C4B0]">{targets.sodium_per_hour}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">mg sodium<br />per hour</p>
                <p className="text-xs text-gray-400 italic mt-1 leading-tight">
                  From your gels + drinking to plan
                </p>
              </div>
              {/* Fluid */}
              <div>
                <p className="text-2xl font-bold text-[#48C4B0]">{targets.fluid_ml_per_hour}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">ml fluid<br />per hour</p>
                <p className="text-xs text-gray-400 italic mt-1 leading-tight">
                  Drink {targets.fluid_ml_per_hour}ml at each aid station or from your bottle
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 mt-4 pt-3 flex justify-center gap-4 text-xs text-gray-400">
              <span>Total carbs: <span className="font-semibold text-[#1B1B1B]">{targets.total_carbs}g</span></span>
              <span>·</span>
              <span>Total sodium: <span className="font-semibold text-[#1B1B1B]">{targets.total_sodium}mg</span></span>
            </div>
          </div>
        </section>

        {/* ── Section 3: Products ──────────────────────────────────────────── */}
        <section>
          <SectionLabel>What to take</SectionLabel>
          <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
            {leckaSelection.map((item, i) => (
              <div
                key={`${item.product.id}-${i}`}
                className={`flex items-center gap-4 px-5 py-3 ${i < leckaSelection.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <span className="text-[#48C4B0] text-lg flex-shrink-0">●</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1B1B1B]">{item.product.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{buildPlainTiming(item)}</p>
                </div>
                <p className="text-sm font-bold text-[#1B1B1B] flex-shrink-0">×{item.quantity}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 italic mt-3">
            Take each gel with a small sip of water — around 100–150ml.
          </p>
        </section>

        {/* ── Section 4: Coach copy ─────────────────────────────────────────── */}
        {(coachLoading || coachCopy) && (
          <section>
            <SectionLabel>Why this plan works for you</SectionLabel>
            {coachLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-4/5" />
                <div className="h-4 bg-gray-200 rounded w-3/5" />
              </div>
            ) : (
              <div className="space-y-4">
                {coachCopy.split('\n\n').filter(Boolean).map((para, i) => (
                  <div
                    key={i}
                    className="border-l-2 border-[#48C4B0] pl-3"
                  >
                    <p className="text-sm text-gray-700 leading-relaxed">{para}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Pro plan upsell ───────────────────────────────────────────────── */}
        <div className="border-2 border-[#48C4B0]/40 bg-[#48C4B0]/5 rounded-2xl p-5">
          <p className="text-sm font-semibold text-[#1B1B1B]">Want a more precise plan?</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {isLoggedIn
              ? 'The Pro planner uses your exact weight, fitness level, and conditions to sharpen your carb, sodium, and fluid targets. It also adds elevation data and a detailed race timeline.'
              : 'The Pro planner personalises every number to your body and race conditions — and saves your plans so you can track them across races.'}
          </p>
          <a
            href="/planner/pro"
            className="mt-3 flex items-center justify-center w-full min-h-[48px]
                       bg-white border-2 border-[#48C4B0] text-[#48C4B0] font-semibold
                       rounded-xl text-sm hover:bg-[#48C4B0] hover:text-white transition-colors"
          >
            Build my Pro plan →
          </a>
        </div>

        {/* ── Section 5: Buy / order ────────────────────────────────────────── */}
        <section>
          <SectionLabel>Where do you want to order?</SectionLabel>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(regionsConfig).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleRegionChange(key)}
                className={[
                  'px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors',
                  region === key
                    ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                    : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#48C4B0]',
                ].join(' ')}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Get your products</SectionLabel>

          {region == null ? (
            <div className="border-2 border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-500">
              <p className="font-semibold text-[#1B1B1B] mb-1">Select your region above</p>
              <p>to see local pricing and order.</p>
            </div>
          ) : aggregated.length === 0 ? (
            <div className="border-l-4 border-[#48C4B0] bg-[#48C4B0]/5 rounded-r-lg p-4 text-sm text-[#1B1B1B]">
              We couldn&apos;t find products available in your region. Try switching region above.
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-5">
                {aggregated.map(row => (
                  <SimpleProductCard
                    key={row.product.id}
                    {...row}
                    currencySymbol={regionConfig.currency_symbol}
                    decimals={regionConfig.decimals ?? 2}
                  />
                ))}
              </div>

              {region === 'vn' && (
                <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500">{totalPacks} pack{totalPacks !== 1 ? 's' : ''}</span>
                    <span className="text-xl font-bold text-[#1B1B1B]">
                      {formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleChatClick(regionConfig.zalo_url)}
                      className="flex items-center justify-center w-full min-h-[52px]
                                 bg-[#0068FF] hover:bg-[#0057d9] text-white rounded-2xl
                                 text-base font-bold transition-colors"
                    >
                      Order via Zalo
                    </button>
                    <button
                      onClick={() => handleChatClick(regionConfig.facebook_url)}
                      className="flex items-center justify-center w-full min-h-[52px]
                                 bg-[#1877F2] hover:bg-[#1060d0] text-white rounded-2xl
                                 text-base font-bold transition-colors"
                    >
                      Order via Facebook
                    </button>
                    <p className="text-xs text-gray-400 text-center mt-1">
                      Your order summary will be copied to your clipboard.
                    </p>
                    {chatSummary && (
                      <div className="mt-3 bg-gray-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">Copied to clipboard:</p>
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans select-all cursor-text leading-relaxed">
                          {chatSummary}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {region !== 'vn' && cartURL && (
                <div className="border border-gray-100 bg-gray-50/50 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500">{totalPacks} pack{totalPacks !== 1 ? 's' : ''}</span>
                    <span className="text-xl font-bold text-[#1B1B1B]">
                      {formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}
                    </span>
                  </div>
                  <a
                    href={cartURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full min-h-[52px]
                               bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl
                               text-base font-bold transition-colors"
                  >
                    Get your products →
                  </a>
                  <p className="text-xs font-semibold text-[#48C4B0] text-center mt-2">
                    Discount code NUTRIPLAN10 applied automatically
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Section 6: Email capture ──────────────────────────────────────── */}
        {form.email ? (
          planSent && (
            <div className="border-2 border-[#48C4B0]/40 bg-[#48C4B0]/5 rounded-2xl p-5">
              <p className="text-sm font-bold text-[#48C4B0]">✓ Your plan has been sent to {form.email}</p>
            </div>
          )
        ) : (
          <section>
            <SectionLabel>Get your plan as a PDF</SectionLabel>
            {emailState === 'success' ? (
              <div className="border-2 border-[#48C4B0]/40 bg-[#48C4B0]/5 rounded-2xl p-5">
                <p className="text-sm font-bold text-[#48C4B0]">✓ Plan sent to {emailInput}</p>
              </div>
            ) : (
              <form onSubmit={handleSendEmail} noValidate>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    disabled={emailState === 'sending'}
                    className="flex-1 min-w-0 border-2 border-gray-200 rounded-xl px-4 py-3
                               text-sm focus:outline-none focus:border-[#48C4B0] disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={emailState === 'sending' || !emailInput.trim()}
                    className="min-h-[48px] px-5 bg-[#F64866] text-white rounded-xl text-sm
                               font-semibold hover:bg-[#e03558] transition-colors
                               disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                  >
                    {emailState === 'sending' ? 'Sending…' : 'Send plan'}
                  </button>
                </div>
                {emailState === 'error' && (
                  <p className="text-xs text-red-500 mt-2">Something went wrong — please try again.</p>
                )}
              </form>
            )}
          </section>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="pb-8 space-y-3 text-center border-t border-gray-100 pt-6">
          <button
            type="button"
            onClick={onBack}
            className="block w-full text-sm text-[#48C4B0] hover:underline"
          >
            Plan another race →
          </button>
          <p className="text-xs text-gray-400">
            © Lecka ·{' '}
            <a
              href="https://www.getlecka.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#48C4B0]"
            >
              getlecka.com
            </a>
          </p>
        </div>

      </div>
    </div>
  )
}
