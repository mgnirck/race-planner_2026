import React, { useState, useEffect, useMemo, useRef } from 'react'
import Nav from './Nav.jsx'
import { buildCartURLFromAggregated } from '../engine/shopify-link.js'
import { computeCartItems, computeLinePrice } from '../engine/region-utils.js'
import { embedCartURL, getSavedRegion, saveRegion, getRegionConfig } from '../embed.js'
import { useProducts } from '../hooks/useProducts.js'
import FALLBACK_PRODUCTS from '../config/products.json'
import regionsConfig from '../config/regions.json'
import i18n from '../i18n.js'
import { formatAddonSummary } from '../engine/kit-calculator.js'
import ShareModal from './ShareModal.jsx'
import PreFuelSection from './PreFuelSection.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

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

const RACE_DISTANCE_KM = {
  '5k':              5,
  '10k':             10,
  'half_marathon':   21.1,
  'marathon':        42.2,
  'ultra_50k':       50,
  'ultra_100k':      100,
  'ultra_marathon':  60,
  'triathlon_sprint':   25.75,
  'triathlon_olympic':  51.5,
  'triathlon_70_3':     113,
  'triathlon_140_6':    226,
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

function formatTimeLabel(minutes) {
  if (minutes < 0) return `T−${Math.abs(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h${m}m`
  if (h > 0) return `${h}h`
  return `${minutes}m`
}

function minutesToKm(minutes, totalMinutes, totalKm) {
  if (!totalKm || totalKm <= 0 || minutes < 0) return null
  const fraction = minutes / totalMinutes
  return Math.round(fraction * totalKm * 10) / 10
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

function productEmoji(product) {
  const type = (product.type ?? '').toLowerCase()
  if (type.includes('gel')) return '🟢'
  if (type.includes('bar')) return '🍫'
  if (type.includes('chew')) return '🟡'
  if (type.includes('electrolyte') || type.includes('drink') || type.includes('mix')) return '💧'
  return '⚪'
}

function hasCaffeine(product) {
  if (product.has_caffeine) return true
  if (product.caffeine_mg > 0) return true
  const name = (product.name ?? '').toLowerCase()
  return name.includes('caffeine') || name.includes('cola') || name.includes('coffee') || name.includes('espresso')
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SimpleResultsPage({ targets, selection, form, onBack }) {
  const [region,         setRegion]         = useState(getSavedRegion())
  const [emailInput,     setEmailInput]     = useState('')
  const [emailState,     setEmailState]     = useState('idle')
  const [planSent,       setPlanSent]       = useState(false)
  const [chatSummary,    setChatSummary]    = useState(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [coachCopy,      setCoachCopy]      = useState(null)
  const [coachLoading,   setCoachLoading]   = useState(true)
  const [coachFailed,    setCoachFailed]    = useState(false)
  const [coachRetryKey,  setCoachRetryKey]  = useState(0)
  const [coachExpanded,  setCoachExpanded]  = useState(false)
  const [timeUnit,       setTimeUnit]       = useState(
    () => { try { return localStorage.getItem('lecka_time_unit') ?? 'min' } catch { return 'min' } }
  )
  const emailRef = useRef(null)

  const { products: liveProducts } = useProducts()
  const catalog      = liveProducts ?? FALLBACK_PRODUCTS
  const regionConfig = getRegionConfig(region)
  const regionType   = regionsConfig[region]?.type ?? null

  const leckaSelection = useMemo(
    () => selection.filter(item => item.product?.type !== 'powder_placeholder'),
    [selection]
  )

  const aggregated = useMemo(
    () => (region && regionType !== 'international') ? aggregateByProduct(leckaSelection, region, catalog) : [],
    [leckaSelection, region, regionType, catalog]
  )

  const subtotal   = aggregated.reduce((sum, row) => sum + row.linePrice, 0)
  const totalPacks = aggregated.reduce(
    (sum, row) => sum + row.cartItems.reduce((s, item) => s + item.quantity, 0), 0
  )

  const cartURL = useMemo(
    () => (region && regionType === 'shopify')
      ? embedCartURL(buildCartURLFromAggregated(aggregated, region === 'us' ? 'NUTRIPLAN10' : '', '', region))
      : null,
    [aggregated, region]
  )

  const timelineEvents = useMemo(() => {
    const events = []
    for (const item of leckaSelection) {
      for (const t of (item.timing_minutes ?? [])) {
        events.push({ time: t, product: item.product, note: item.note ?? '' })
      }
    }
    events.sort((a, b) => a.time - b.time)
    return events
  }, [leckaSelection])

  const packingList = useMemo(() => {
    const map = {}
    for (const item of leckaSelection) {
      const id = item.product.id
      if (!map[id]) map[id] = { product: item.product, totalUnits: 0 }
      map[id].totalUnits += item.quantity
    }
    return Object.values(map).map(({ product, totalUnits }) => {
      let cartUnits = 0
      if (region) {
        try {
          const cartItems = computeCartItems(product, region, totalUnits)
          cartUnits = cartItems.reduce((s, ci) => s + ci.quantity * ci.units_per_pack, 0)
        } catch {}
      }
      return { product, totalUnits, cartUnits }
    })
  }, [leckaSelection, region])

  const totalKm = form.custom_race_km ?? RACE_DISTANCE_KM[targets.race_type] ?? null

  const heroTitle     = (form.race_name && form.race_name.trim()) || (RACE_LABELS[targets.race_type] ?? targets.race_type)
  const conditionText = CONDITION_LABELS[targets.conditions] ?? targets.conditions
  const dayCount      = form.race_date ? daysUntilRace(form.race_date) : null

  // ── Auto-send plan if email provided in form ──────────────────────────────
  useEffect(() => {
    if (!form.email) return
    fetch('/api/send-plan', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:               form.email,
        targets,
        inputs:              form,
        selectedProducts:    selection,
        region:              region ?? 'us',
        lang:                i18n.language,
        addon_items_summary: formatAddonSummary([]),
      }),
    })
      .then(r => r.ok ? setPlanSent(true) : null)
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Silent plan save ────────────────────────────────────────────────────────
  useEffect(() => {
    const userId  = localStorage.getItem('lecka_user_id')
    const headers = { 'Content-Type': 'application/json' }
    if (userId) headers['Authorization'] = `Bearer ${userId}`
    fetch('/api/plans', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs:    { ...form, addon_items: [], mode: 'quick' },
        targets,
        selection,
        region:    region ?? 'us',
        lang:      i18n.language,
      }),
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch coach notes ──────────────────────────────────────────────────────
  useEffect(() => {
    const gelCount = leckaSelection
      .filter(i => i.product.type === 'gel' || i.product.type === 'ultra_gel')
      .reduce((sum, i) => sum + i.quantity, 0)

    const controller = new AbortController()
    fetch('/api/coach-copy', {
      method:  'POST',
      signal:  controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        race_type:         targets.race_type,
        goal_minutes:      targets.total_duration_minutes,
        conditions:        targets.conditions,
        carb_per_hour:     targets.carb_per_hour,
        sodium_per_hour:   targets.sodium_per_hour,
        fluid_ml_per_hour: targets.fluid_ml_per_hour,
        total_carbs:       targets.total_carbs,
        gel_count:         gelCount,
        athlete_profile:   'intermediate',
        gender:            form.gender ?? null,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.copy) setCoachCopy(data.copy)
        else setCoachFailed(true)
        setCoachLoading(false)
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setCoachFailed(true)
          setCoachLoading(false)
        }
      })
    return () => controller.abort()
  }, [coachRetryKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
          email:               emailVal,
          targets,
          inputs:              form,
          selectedProducts:    selection,
          region:              region ?? 'us',
          lang:                i18n.language,
          addon_items_summary: formatAddonSummary([]),
        }),
      })
      setEmailState(res.ok ? 'success' : 'error')
    } catch {
      setEmailState('error')
    }
  }

  const sharePlan = {
    raceName:      heroTitle,
    duration:      formatDuration(targets.total_duration_minutes),
    conditions:    conditionText,
    effort:        '',
    carbsPerHour:  Math.round(targets.carb_per_hour),
    sodiumPerHour: Math.round(targets.sodium_per_hour),
    fluidPerHour:  Math.round(targets.fluid_ml_per_hour),
    totalCarbs:    Math.round(targets.total_carbs),
    totalSodium:   Math.round(targets.total_sodium),
    products:      leckaSelection.map(i => ({ name: i.product.name, quantity: i.quantity, type: i.product.type })),
    planUrl:       'https://plan.getlecka.com',
    region,
  }

  // Coach notes split
  const coachParagraphs = coachCopy ? coachCopy.split(/\n\n+/).filter(Boolean) : []
  const teaserParas     = coachParagraphs.slice(0, 1)
  const restParas       = coachParagraphs.slice(1)
  const hasMoreCoach    = restParas.length > 0

  const showKmFallback = timeUnit === 'km' && totalKm === null

  const formattedSubtotal = formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2)

  function getTimeLabel(event) {
    if (event.time < 0) return `${Math.abs(event.time)} min before start`
    if (timeUnit === 'km' && totalKm !== null) {
      const km = minutesToKm(event.time, targets.total_duration_minutes, totalKm)
      return km !== null ? `km ${km}` : formatTimeLabel(event.time)
    }
    return formatTimeLabel(event.time)
  }

  return (
    <div className="bg-white min-h-screen">
      {showShareModal && (
        <ShareModal plan={sharePlan} onClose={() => setShowShareModal(false)} />
      )}

      <Nav />

      {/* Action bar */}
      <div className="sticky top-[53px] z-10 bg-white border-b border-gray-100 flex items-center justify-end gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          style={{ width: 36, height: 36, borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label="Email plan"
        >
          <svg width="16" height="16" fill="none" stroke="#6b7280" strokeWidth="1.8" viewBox="0 0 24 24">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <polyline points="2,4 12,13 22,4"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          style={{ width: 36, height: 36, borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label="Share plan"
        >
          <svg width="16" height="16" fill="none" stroke="#6b7280" strokeWidth="1.8" viewBox="0 0 24 24">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
      </div>

      <div style={{ maxWidth: 672, margin: '0 auto', padding: '0 16px 64px' }}>

        {/* ── Section 1: Compact hero ─────────────────────────────────────── */}
        <div style={{ paddingTop: 20, paddingBottom: 20, borderBottom: '1px solid #f3f4f6' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1B1B1B', lineHeight: 1.2, margin: '0 0 4px' }}>
            {heroTitle}
          </h1>
          <p className="text-sm text-gray-400" style={{ margin: '0 0 10px' }}>
            {formatDuration(targets.total_duration_minutes)} · {conditionText}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: form.race_date ? 10 : 0 }}>
            <span style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#1B1B1B' }}>
              {targets.carb_per_hour}g carbs/hr
            </span>
            <span style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#1B1B1B' }}>
              {targets.sodium_per_hour}mg sodium/hr
            </span>
            <span style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#1B1B1B' }}>
              {targets.fluid_ml_per_hour}ml fluid/hr
            </span>
          </div>
          {form.race_date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>
                📅 {formatRaceDate(form.race_date)}
              </span>
              {dayCount !== null && dayCount > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#48C4B0', padding: '2px 10px', borderRadius: 20 }}>
                  {dayCount}d to go
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Section 2: Race plan ─────────────────────────────────────────── */}
        <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <SectionLabel>Your race plan</SectionLabel>

          {/* 2a: Packing list */}
          <div style={{ border: '2px solid #f3f4f6', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
            {packingList.map((row, i) => {
              const extra = row.cartUnits > row.totalUnits ? row.cartUnits - row.totalUnits : 0
              return (
                <div
                  key={row.product.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                    borderBottom: i < packingList.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0, width: 24, textAlign: 'center', lineHeight: 1 }}>
                    {productEmoji(row.product)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1B1B1B', margin: 0 }}>
                      {row.product.name}
                    </p>
                    {extra > 0 && (
                      <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>
                        +{extra} for training
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#48C4B0', flexShrink: 0 }}>
                    ×{row.totalUnits}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 2b: Intake schedule */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showKmFallback ? 6 : 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', margin: 0 }}>
              When to take them
            </p>
            <div style={{ display: 'flex', gap: 0, border: '1.5px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => { setTimeUnit('min'); try { localStorage.setItem('lecka_time_unit', 'min') } catch {} }}
                style={{
                  padding: '3px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: timeUnit === 'min' ? '#1B1B1B' : 'transparent',
                  color:      timeUnit === 'min' ? '#fff'    : '#6b7280',
                }}
              >min</button>
              <button
                type="button"
                onClick={() => { setTimeUnit('km'); try { localStorage.setItem('lecka_time_unit', 'km') } catch {} }}
                style={{
                  padding: '3px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: timeUnit === 'km' ? '#1B1B1B' : 'transparent',
                  color:      timeUnit === 'km' ? '#fff'    : '#6b7280',
                }}
              >km</button>
            </div>
          </div>

          {showKmFallback && (
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
              No distance data — showing minutes
            </p>
          )}

          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {timelineEvents.map((event, i) => {
              const isPreRace    = event.time < 0
              const showSeparator = i > 0 && timelineEvents[i - 1].time < 0 && event.time >= 0
              return (
                <React.Fragment key={i}>
                  {showSeparator && (
                    <li style={{ padding: '10px 0' }}>
                      <div style={{ borderTop: '1px solid #f3f4f6' }} />
                      <p style={{
                        textAlign: 'center', fontSize: 10, color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '0.1em',
                        margin: '6px 0 0',
                      }}>
                        Race start ↓
                      </p>
                    </li>
                  )}
                  <li style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
                    borderBottom: i < timelineEvents.length - 1 ? '1px solid #f9fafb' : 'none',
                  }}>
                    <span style={{
                      color: isPreRace ? '#d1d5db' : '#48C4B0',
                      fontSize: 8, marginTop: 6, flexShrink: 0,
                    }}>●</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', flexShrink: 0, minWidth: 72 }}>
                      {getTimeLabel(event)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, color: '#1B1B1B' }}>
                        {event.product.name}
                      </span>
                      {hasCaffeine(event.product) && (
                        <span style={{ fontSize: 11, color: '#48C4B0', marginLeft: 4 }}>☕</span>
                      )}
                      {(event.product.carbs_per_unit ?? 0) > 0 && (
                        <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>
                          {event.product.carbs_per_unit}g carbs
                        </p>
                      )}
                    </div>
                  </li>
                </React.Fragment>
              )
            })}
          </ol>
        </div>

        {/* ── Section 3: Buy ──────────────────────────────────────────────── */}
        <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <SectionLabel>Get your products</SectionLabel>

          <select
            value={region ?? ''}
            onChange={e => { if (e.target.value) handleRegionChange(e.target.value) }}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 12,
              border: '1.5px solid #e5e7eb', fontSize: 14, color: '#1B1B1B',
              background: 'white', cursor: 'pointer', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C%2Fsvg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center',
              paddingRight: 36, marginBottom: 16,
            }}
          >
            <option value="" disabled>Select your region…</option>
            {Object.entries(regionsConfig).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>

          {region == null ? (
            <div style={{ border: '2px solid #f3f4f6', borderRadius: 16, padding: 20, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
              <p style={{ fontWeight: 600, color: '#1B1B1B', marginBottom: 4, marginTop: 0 }}>Select your region above</p>
              <p style={{ margin: 0 }}>to see local pricing and order.</p>
            </div>
          ) : regionType === 'international' ? (
            <div style={{ border: '1px solid #f3f4f6', background: '#fafafa', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 14, color: '#1B1B1B', lineHeight: 1.6, marginTop: 0 }}>
                Lecka isn&apos;t available in your country yet — use this plan with any real food gel matching the targets above.
              </p>
              <a
                href="https://www.getlecka.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors"
              >
                Find Lecka → getlecka.com
              </a>
            </div>
          ) : aggregated.length === 0 ? (
            <div style={{ borderLeft: '4px solid #48C4B0', background: 'rgba(72,196,176,0.05)', borderRadius: '0 8px 8px 0', padding: 16, fontSize: 14, color: '#1B1B1B' }}>
              We couldn&apos;t find products available in your region. Try switching region above.
            </div>
          ) : (
            <div style={{ border: '1px solid #f3f4f6', background: '#fafafa', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {aggregated.map(row => {
                  const packSummary = row.cartItems
                    .map(item => item.units_per_pack === 1
                      ? `${item.quantity} single`
                      : `${item.quantity}×${item.units_per_pack}-pack`)
                    .join(' + ')
                  return (
                    <div key={row.product.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#1B1B1B', margin: '0 0 2px' }}>{row.product.name}</p>
                        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{row.totalUnits} for race · {packSummary}</p>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#1B1B1B', margin: 0, flexShrink: 0 }}>
                        {formatPrice(row.linePrice, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}
                      </p>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6', paddingTop: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{totalPacks} pack{totalPacks !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#1B1B1B' }}>
                  {formattedSubtotal}
                </span>
              </div>

              {regionType === 'haravan' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={() => handleChatClick(regionConfig.zalo_url)}
                    className="flex items-center justify-center w-full min-h-[48px] bg-[#0068FF] hover:bg-[#0057d9] text-white rounded-2xl text-sm font-bold transition-colors"
                  >
                    Order via Zalo
                  </button>
                  <button
                    onClick={() => handleChatClick(regionConfig.facebook_url)}
                    className="flex items-center justify-center w-full min-h-[48px] bg-[#1877F2] hover:bg-[#1060d0] text-white rounded-2xl text-sm font-bold transition-colors"
                  >
                    Order via Facebook
                  </button>
                  {chatSummary && (
                    <div style={{ marginTop: 8, background: '#fff', borderRadius: 12, padding: 12, border: '1px solid #f3f4f6' }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, marginTop: 0 }}>Copied to clipboard:</p>
                      <pre style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, lineHeight: 1.6 }}>{chatSummary}</pre>
                    </div>
                  )}
                </div>
              )}

              {regionType === 'shopify' && cartURL && (
                <>
                  <a
                    href={cartURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors"
                  >
                    Buy my plan — {formattedSubtotal} →
                  </a>
                  {region === 'us' && (
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#48C4B0', textAlign: 'center', marginTop: 8, marginBottom: 0 }}>
                      Discount code NUTRIPLAN10 applied automatically
                    </p>
                  )}
                </>
              )}

              {regionType === 'distributor' && (
                <a
                  href={regionConfig.store_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors"
                >
                  Shop at {regionConfig.label} →
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── Section 4: Pre-fueling ──────────────────────────────────────── */}
        <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <PreFuelSection targets={targets} form={form} />
        </div>

        {/* ── Section 5: Coach notes ──────────────────────────────────────── */}
        <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <SectionLabel>Coach notes</SectionLabel>
          {coachLoading ? (
            <div style={{ border: '2px solid #f3f4f6', borderRadius: 16, padding: 20 }}>
              <div className="animate-pulse bg-gray-100 rounded h-3 w-full mb-2" />
              <div className="animate-pulse bg-gray-100 rounded h-3" style={{ width: '80%' }} />
            </div>
          ) : coachFailed || !coachCopy ? (
            <div style={{ border: '2px solid #f3f4f6', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 14, color: '#9ca3af', margin: '0 0 8px' }}>Coach notes couldn&apos;t load.</p>
              <button
                type="button"
                onClick={() => { setCoachFailed(false); setCoachLoading(true); setCoachCopy(null); setCoachRetryKey(k => k + 1) }}
                style={{ fontSize: 12, fontWeight: 600, color: '#48C4B0', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Retry →
              </button>
            </div>
          ) : (
            <div style={{ border: '2px solid #f3f4f6', borderRadius: 16, padding: 20 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 20, background: '#f5f3ff',
                border: '1px solid #ddd6fe', fontSize: 10, fontWeight: 600, color: '#7c3aed',
              }}>
                AI · Lecka knowledge
              </span>
              {teaserParas.map((para, i) => (
                <p key={i} style={{
                  fontSize: 14, color: '#374151', lineHeight: 1.7,
                  borderLeft: '2px solid #48C4B0', paddingLeft: 12, marginBottom: 16, marginTop: 12,
                }}>
                  {para}
                </p>
              ))}
              {coachExpanded && restParas.map((para, i) => (
                <p key={i} style={{
                  fontSize: 14, color: '#374151', lineHeight: 1.7,
                  borderLeft: '2px solid #48C4B0', paddingLeft: 12, marginBottom: 16, marginTop: 0,
                }}>
                  {para}
                </p>
              ))}
              {hasMoreCoach && (
                <button
                  type="button"
                  onClick={() => setCoachExpanded(v => !v)}
                  style={{ fontSize: 12, fontWeight: 600, color: '#48C4B0', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {coachExpanded ? 'Show less ↑' : 'Read more →'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Section 6: Email / Share ─────────────────────────────────────── */}
        <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', minHeight: 48, borderRadius: 12,
              border: '1.5px solid #e5e7eb', background: 'transparent',
              fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share my plan
          </button>
        </div>

        <div ref={emailRef} style={{ paddingTop: 24 }}>
          <SectionLabel>Get your plan by email</SectionLabel>
          {form.email && planSent ? (
            <div style={{ border: '2px solid rgba(72,196,176,0.4)', background: 'rgba(72,196,176,0.05)', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#48C4B0', margin: 0 }}>✓ Your plan has been sent to {form.email}</p>
            </div>
          ) : emailState === 'success' ? (
            <div style={{ border: '2px solid rgba(72,196,176,0.4)', background: 'rgba(72,196,176,0.05)', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#48C4B0', margin: 0 }}>✓ Plan sent to {emailInput}</p>
            </div>
          ) : (
            <form onSubmit={handleSendEmail} noValidate>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  disabled={emailState === 'sending'}
                  style={{
                    flex: 1, minWidth: 0, border: '2px solid #e5e7eb', borderRadius: 12,
                    padding: '12px 16px', fontSize: 14, outline: 'none',
                    opacity: emailState === 'sending' ? 0.5 : 1,
                  }}
                  onFocus={e => e.target.style.borderColor = '#48C4B0'}
                  onBlur={e  => e.target.style.borderColor = '#e5e7eb'}
                />
                <button
                  type="submit"
                  disabled={emailState === 'sending' || !emailInput.trim()}
                  style={{
                    minHeight: 48, padding: '0 20px', background: '#F64866',
                    color: '#fff', borderRadius: 12, fontSize: 14, fontWeight: 600,
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    opacity: (emailState === 'sending' || !emailInput.trim()) ? 0.5 : 1,
                  }}
                >
                  {emailState === 'sending' ? 'Sending…' : 'Send plan'}
                </button>
              </div>
              {emailState === 'error' && (
                <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>
                  Something went wrong — please try again.
                </p>
              )}
            </form>
          )}
        </div>

      </div>
    </div>
  )
}
