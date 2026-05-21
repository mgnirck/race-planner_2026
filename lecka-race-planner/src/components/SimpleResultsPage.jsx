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
  const [region,      setRegion]      = useState(getSavedRegion())
  const [emailInput,  setEmailInput]  = useState('')
  const [emailState,  setEmailState]  = useState('idle')
  const [planSent,    setPlanSent]    = useState(false)
  const [chatSummary, setChatSummary] = useState(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [navigating,  setNavigating]  = useState(false)
  const emailRef = useRef(null)

  const { products: liveProducts } = useProducts()
  const catalog    = liveProducts ?? FALLBACK_PRODUCTS
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
    () => (region && regionType === 'shopify') ? embedCartURL(buildCartURLFromAggregated(aggregated, region === 'us' ? 'NUTRIPLAN10' : '', '', region)) : null,
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

  const providedCarbs = useMemo(
    () => leckaSelection.reduce((sum, i) => sum + i.quantity * (i.product.carbs_per_unit ?? 30), 0),
    [leckaSelection]
  )

  const heroTitle     = (form.race_name && form.race_name.trim()) || (RACE_LABELS[targets.race_type] ?? targets.race_type)
  const conditionText = CONDITION_LABELS[targets.conditions] ?? targets.conditions

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
    if (!userId) {
      localStorage.setItem('lecka_plan_needs_save', 'true')
      return
    }
    fetch('/api/plans', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${userId}`,
      },
      body: JSON.stringify({
        inputs:    { ...form, addon_items: [], mode: 'quick' },
        targets,
        selection,
        region:    region ?? 'us',
        lang:      i18n.language,
      }),
    }).catch(() => {})
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

  function handleBuildProPlan() {
    setNavigating(true)
    const draft = {
      race_name:              form.race_name ?? '',
      race_date:              form.race_date ?? '',
      race_type:              form.race_type ?? '',
      goal_time_h:            form.goal_time_h ?? '',
      goal_time_m:            form.goal_time_m ?? '',
      conditions:             form.conditions ?? 'mild',
      temperature:            form.temperature ?? 'mild',
      humidity:               form.humidity ?? 'dry',
      surface_type:           form.surface_type ?? '',
      dist_unit:              form.dist_unit ?? 'km',
      weight_value:           form.weight_value ?? '',
      weight_unit:            form.weight_unit ?? 'kg',
      gender:                 form.gender ?? '',
      caffeine_ok:            form.caffeine_ok !== undefined ? form.caffeine_ok : null,
      preferred_product_ids:  form.preferred_product_ids ?? [],
      fuelling_style:         form.fuelling_style ?? 'gels_only',
      _from_simple:           true,
    }
    try {
      sessionStorage.setItem('lecka_form_draft', JSON.stringify(draft))
    } catch {}
    window.location.href = '/planner/pro'
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

  const carbPct = targets.total_carbs > 0
    ? Math.min(100, Math.round((providedCarbs / targets.total_carbs) * 100))
    : 0

  const dayCount = form.race_date ? daysUntilRace(form.race_date) : null

  return (
    <div className="bg-white min-h-screen">
      {/* Share modal */}
      {showShareModal && (
        <ShareModal
          plan={sharePlan}
          onClose={() => setShowShareModal(false)}
        />
      )}

      <Nav />

      {/* ── Action bar ──────────────────────────────────────────────────────── */}
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

      {/* ── Single column content ────────────────────────────────────────────── */}
      <div style={{ maxWidth: 672, margin: '0 auto', padding: '0 16px 64px' }}>

        {/* ── Section 1: Race hero ─────────────────────────────────────────── */}
        <div style={{ paddingTop: 28, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#48C4B0',
            }}>
              Quick plan
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1B1B1B', lineHeight: 1.2, margin: '0 0 8px' }}>
            {heroTitle}
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            {formatDuration(targets.total_duration_minutes)} · {conditionText}
          </p>
          {form.race_date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>
                📅 {formatRaceDate(form.race_date)}
              </span>
              {dayCount !== null && dayCount > 0 && (
                <span style={{
                  fontSize: 12, fontWeight: 600, color: '#fff',
                  background: '#48C4B0', padding: '2px 10px', borderRadius: 20,
                }}>
                  {dayCount}d to go
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Section 2: Nutrition targets ─────────────────────────────── */}
        <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <SectionLabel>Your targets</SectionLabel>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8, textAlign: 'center',
            border: '2px solid #f3f4f6', borderRadius: 16, padding: '20px 8px',
          }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#48C4B0', margin: 0 }}>
                {targets.carb_per_hour}
              </p>
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
                g carbs<br/>per hour
              </p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#48C4B0', margin: 0 }}>
                {targets.sodium_per_hour}
              </p>
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
                mg sodium<br/>per hour
              </p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#48C4B0', margin: 0 }}>
                {targets.fluid_ml_per_hour}
              </p>
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
                ml fluid<br/>per hour
              </p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 12, paddingTop: 10,
            display: 'flex', justifyContent: 'center', gap: 16,
            fontSize: 12, color: '#9ca3af' }}>
            <span>Total carbs: <strong style={{ color: '#1B1B1B' }}>{targets.total_carbs}g</strong></span>
            <span>·</span>
            <span>Total sodium: <strong style={{ color: '#1B1B1B' }}>{targets.total_sodium}mg</strong></span>
          </div>

        </div>

        {/* ── Section 3: Pro plan upsell card ─────────────────────────────── */}
        <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <div style={{
            border: '1.5px solid #48C4B0',
            borderRadius: 12,
            padding: '20px 24px',
            background: '#E1F5EE',
          }}>
            <p style={{ fontSize: 16, fontWeight: 500, color: '#085041', marginBottom: 8, marginTop: 0 }}>
              Get exact targets for your body
            </p>
            <p style={{ fontSize: 13, color: '#0F6E56', lineHeight: 1.6, marginBottom: 16, marginTop: 0 }}>
              Pro plan uses your actual weight, fitness level, elevation, and effort to personalise every number.
              Also unlocks gut training mode, checkpoint planning, coach notes, and support for other nutrition
              brands alongside Lecka.
            </p>
            <button
              type="button"
              onClick={handleBuildProPlan}
              disabled={navigating}
              style={{
                background: '#48C4B0', color: '#fff', fontSize: 14, fontWeight: 500,
                padding: '12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                width: '100%', opacity: navigating ? 0.6 : 1,
              }}
            >
              {navigating ? 'Opening Pro planner…' : 'Get my precise plan — takes 3 minutes →'}
            </button>
          </div>
        </div>

        {/* ── Section 4: Lecka products list ──────────────────────────────── */}
        <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <SectionLabel>What to take</SectionLabel>
          <div style={{ border: '2px solid #f3f4f6', borderRadius: 16, overflow: 'hidden' }}>
            {leckaSelection.map((item, i) => (
              <div
                key={`${item.product.id}-${i}`}
                style={{
                  display: 'flex', alignItems: 'flex-start', padding: '12px 16px',
                  borderBottom: i < leckaSelection.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1B1B1B', margin: '0 0 2px' }}>
                    {item.product.name} × {item.quantity}
                  </p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
                    {buildPlainTiming(item)}
                  </p>
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#48C4B0', flexShrink: 0, margin: 0, paddingLeft: 12 }}>
                  {item.quantity * (item.product.carbs_per_unit ?? 30)}g carbs
                </p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
              <span>{providedCarbs}g carbs provided</span>
              <span>{targets.total_carbs}g target</span>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${carbPct}%`, height: '100%',
                background: carbPct >= 90 ? '#48C4B0' : carbPct >= 70 ? '#f59e0b' : '#ef4444',
                borderRadius: 4, transition: 'width 0.3s',
              }} />
            </div>
          </div>
        </div>

        {/* ── Section 5: Simple flat timeline ─────────────────────────────── */}
        {timelineEvents.length > 0 && (
          <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
            <SectionLabel>Race day timeline</SectionLabel>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {timelineEvents.map((event, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 0',
                    borderBottom: i < timelineEvents.length - 1 ? '1px solid #f9fafb' : 'none',
                  }}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#fff',
                    background: '#48C4B0', borderRadius: 6,
                    padding: '3px 8px', flexShrink: 0, minWidth: 44,
                    textAlign: 'center',
                  }}>
                    {formatTimeLabel(event.time)}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1B1B1B', flex: 1 }}>
                    {event.product.name}
                  </span>
                  {event.note && (
                    <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>
                      {event.note}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── Section 6: Order card ────────────────────────────────────────── */}
        <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid #f3f4f6' }}>
          <SectionLabel>Get your products</SectionLabel>

          {/* Region picker */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {Object.entries(regionsConfig).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleRegionChange(key)}
                className={[
                  'px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-colors',
                  region === key
                    ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                    : 'border-gray-200 bg-white text-[#1B1B1B] hover:border-[#48C4B0]',
                ].join(' ')}
              >
                {cfg.label}
              </button>
            ))}
          </div>

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
              <a href="https://www.getlecka.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors">
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
                  {formatPrice(subtotal, regionConfig.currency_symbol, regionConfig.decimals ?? 2)}
                </span>
              </div>
              {regionType === 'haravan' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={() => handleChatClick(regionConfig.zalo_url)}
                    className="flex items-center justify-center w-full min-h-[48px] bg-[#0068FF] hover:bg-[#0057d9] text-white rounded-2xl text-sm font-bold transition-colors">
                    Order via Zalo
                  </button>
                  <button onClick={() => handleChatClick(regionConfig.facebook_url)}
                    className="flex items-center justify-center w-full min-h-[48px] bg-[#1877F2] hover:bg-[#1060d0] text-white rounded-2xl text-sm font-bold transition-colors">
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
                  <a href={cartURL} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors">
                    Get your products →
                  </a>
                  {region === 'us' && (
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#48C4B0', textAlign: 'center', marginTop: 8, marginBottom: 0 }}>
                      Discount code NUTRIPLAN10 applied automatically
                    </p>
                  )}
                </>
              )}
              {regionType === 'distributor' && (
                <a href={regionConfig.store_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center w-full min-h-[48px] bg-[#F64866] hover:bg-[#e03558] text-white rounded-2xl text-sm font-bold transition-colors">
                  Shop at {regionConfig.label} →
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── Section 7: Share button ──────────────────────────────────────── */}
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

        {/* ── Section 8: Email capture ─────────────────────────────────────── */}
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
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
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
