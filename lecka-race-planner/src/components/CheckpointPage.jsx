/**
 * CheckpointPage.jsx — Checkpoint planner for ultra/long-distance races.
 * Route: /plan/:planId/checkpoints
 *
 * Two-panel layout (desktop): left = plan summary, right = checkpoint builder.
 * Mobile: compact pill row + single-column builder.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const RACE_DISTANCE_KM = {
  '5k': 5, '10k': 10, 'half_marathon': 21.1, 'marathon': 42.2,
  'ultra_50k': 50, 'ultra_100k': 100,
  'triathlon_70_3': 113, 'triathlon_140_6': 226,
}

const RACE_LABELS = {
  '5k': '5 km', '10k': '10 km', 'half_marathon': 'Half Marathon',
  'marathon': 'Marathon', 'ultra_50k': 'Ultra 50 km', 'ultra_100k': 'Ultra 100 km+',
  'triathlon_70_3': '70.3 Triathlon', 'triathlon_140_6': 'Ironman 140.6',
}

const CONDITION_LABELS = {
  cool: 'Cool', mild: 'Mild', warm: 'Warm', hot: 'Hot', humid: 'Humid',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(minutes) {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function formatGoalTime(minutes) {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}min`
}

function estimateSegmentMinutes(distanceKm, elevationGainM, paceMinsPerKm) {
  const baseTime   = distanceKm * paceMinsPerKm
  const climbPenalty = elevationGainM / 10
  return Math.round(baseTime + climbPenalty)
}

function getSegmentElevationModifier(distanceKm, elevationGainM) {
  if (distanceKm <= 0) return 1.0
  const avgGradePct = (elevationGainM / (distanceKm * 1000)) * 100
  if (avgGradePct < 1)  return 1.00
  if (avgGradePct < 3)  return 1.05
  if (avgGradePct < 6)  return 1.10
  if (avgGradePct < 10) return 1.15
  return 1.22
}

function calcSegmentNutrition(segmentMinutes, targets, elevModifier = 1.0) {
  const hours = segmentMinutes / 60
  return {
    carbs:  Math.round(targets.carb_per_hour  * hours * elevModifier),
    sodium: Math.round(targets.sodium_per_hour * hours * elevModifier),
    fluid:  Math.round(targets.fluid_ml_per_hour * hours),
  }
}

function newCheckpoint() {
  return { id: `cp-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', distance: '', elevation: '', drop_bag: false }
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

// ── Left Panel ────────────────────────────────────────────────────────────────

function PlanSummaryPanel({ plan }) {
  if (!plan) {
    return (
      <div className="h-full bg-gray-50 border-r border-gray-200 p-5 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#48C4B0] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-gray-400">Loading plan…</p>
        </div>
      </div>
    )
  }

  const targets   = plan.targets ?? {}
  const inputs    = plan.inputs  ?? {}
  const selection = plan.selection ?? []

  const productSummary = (() => {
    const map = {}
    for (const item of selection) {
      const name = item.product?.name ?? 'Unknown'
      map[name] = (map[name] ?? 0) + (item.quantity ?? 0)
    }
    return Object.entries(map).map(([name, qty]) => `${qty}× ${name.split(' ').slice(-2).join(' ')}`).join(' · ')
  })()

  const raceName = inputs.race_name
    || RACE_LABELS[targets.race_type]
    || targets.race_type
    || '—'

  return (
    <div className="h-full bg-gray-50 border-r border-gray-200 p-5 overflow-y-auto text-xs">
      <div className="space-y-5">
        <div>
          <SectionLabel>Race</SectionLabel>
          <p className="text-sm font-bold text-[#1B1B1B] leading-snug">{raceName}</p>
          <p className="text-gray-500 mt-1">
            {formatGoalTime(targets.total_duration_minutes)}
            {targets.conditions ? ` · ${CONDITION_LABELS[targets.conditions] ?? targets.conditions}` : ''}
          </p>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <SectionLabel>Targets per hour</SectionLabel>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Carbs</span>
              <span className="font-semibold text-[#1B1B1B]">{targets.carb_per_hour ?? '—'}g</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Sodium</span>
              <span className="font-semibold text-[#1B1B1B]">{targets.sodium_per_hour ?? '—'}mg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fluid</span>
              <span className="font-semibold text-[#1B1B1B]">{targets.fluid_ml_per_hour ?? '—'}ml</span>
            </div>
          </div>
        </div>

        {productSummary && (
          <div className="border-t border-gray-200 pt-4">
            <SectionLabel>Products in plan</SectionLabel>
            <p className="text-gray-600 leading-relaxed">{productSummary}</p>
          </div>
        )}

        <div className="border-t border-gray-200 pt-4">
          <SectionLabel>Total race</SectionLabel>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Carbs</span>
              <span className="font-semibold text-[#1B1B1B]">{targets.total_carbs ?? '—'}g</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Sodium</span>
              <span className="font-semibold text-[#1B1B1B]">{targets.total_sodium ?? '—'}mg</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Segment edit popover ──────────────────────────────────────────────────────

function SegmentEditPopover({ seg, products, onChange, onClose }) {
  const [localProducts, setLocalProducts] = useState(seg.products ?? [])
  const [localNote,     setLocalNote]     = useState(seg.note ?? '')

  function getQty(name) {
    return localProducts.find(p => p.name === name)?.quantity ?? 0
  }

  function setQty(name, qty) {
    setLocalProducts(prev => {
      const existing = prev.filter(p => p.name !== name)
      return qty > 0 ? [...existing, { name, quantity: qty }] : existing
    })
  }

  function handleDone() {
    onChange({ products: localProducts, note: localNote })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
         style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
         onClick={e => { if (e.target === e.currentTarget) { handleDone() } }}>
      <div className="bg-white w-full sm:max-w-sm sm:mx-4 sm:rounded-2xl rounded-t-2xl
                      overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-bold text-[#1B1B1B]">Edit segment nutrition</p>
          <button type="button" onClick={handleDone}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100
                       text-gray-500 hover:bg-gray-200 text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {products.map(name => {
            const qty = getQty(name)
            return (
              <div key={name} className="flex items-center gap-3">
                <p className="flex-1 text-sm text-[#1B1B1B] leading-snug">{name}</p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setQty(name, Math.max(0, qty - 1))}
                    disabled={qty === 0}
                    className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center
                               justify-center text-gray-500 hover:border-[#48C4B0] hover:text-[#48C4B0]
                               transition-colors disabled:opacity-30 text-lg leading-none">−</button>
                  <span className="w-6 text-center text-sm font-bold">{qty}</span>
                  <button type="button" onClick={() => setQty(name, qty + 1)}
                    className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center
                               justify-center text-gray-500 hover:border-[#48C4B0] hover:text-[#48C4B0]
                               transition-colors text-lg leading-none">+</button>
                </div>
              </div>
            )
          })}
          <div className="pt-2">
            <label className="text-xs text-gray-500 block mb-1">Segment note</label>
            <textarea
              value={localNote}
              onChange={e => setLocalNote(e.target.value)}
              rows={2}
              placeholder="Coaching note for this segment…"
              className="w-full border-2 rounded-lg px-3 py-2 text-sm border-gray-200
                         focus:outline-none focus:border-[#48C4B0] resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button type="button" onClick={handleDone}
            className="w-full min-h-[44px] bg-[#48C4B0] text-white rounded-xl text-sm
                       font-semibold hover:bg-[#3db09d] transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CheckpointPage({ planId }) {
  const [plan,         setPlan]         = useState(null)
  const [planLoading,  setPlanLoading]  = useState(true)
  const [checkpoints,  setCheckpoints]  = useState([])
  const [segmentData,  setSegmentData]  = useState([]) // [{products, note}]
  const [aiFilling,    setAiFilling]    = useState(false)
  const [aiFillMsg,    setAiFillMsg]    = useState(null) // null | 'success' | 'error'
  const [saveState,    setSaveState]    = useState('idle') // idle | saving | saved | error
  const [editingIndex, setEditingIndex] = useState(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)

  const userId    = localStorage.getItem('lecka_user_id')
  const isLoggedIn = Boolean(userId)

  // Auth guard
  useEffect(() => {
    if (!isLoggedIn) {
      window.location.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`)
    }
  }, [isLoggedIn])

  // Fetch plan
  useEffect(() => {
    if (!planId) return
    fetch(`/api/plans?planId=${planId}`, {
      headers: userId ? { Authorization: `Bearer ${userId}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setPlan(data)
        // Restore saved checkpoints from plan inputs
        if (data?.inputs?.checkpoints) {
          const saved = data.inputs.checkpoints
          setCheckpoints(saved.map(cp => ({ ...cp, id: cp.id ?? `cp-${Date.now()}-${Math.random().toString(36).slice(2)}` })))
        }
        setPlanLoading(false)
      })
      .catch(() => setPlanLoading(false))
  }, [planId, userId])

  // Restore from localStorage
  useEffect(() => {
    if (!planId) return
    try {
      const raw = localStorage.getItem(`lecka_checkpoints_${planId}`)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.checkpoints?.length) setCheckpoints(saved.checkpoints)
        if (saved.segmentData?.length) setSegmentData(saved.segmentData)
      }
    } catch {}
  }, [planId])

  // Persist to localStorage on change
  useEffect(() => {
    if (!planId) return
    try {
      localStorage.setItem(`lecka_checkpoints_${planId}`, JSON.stringify({ checkpoints, segmentData }))
    } catch {}
  }, [planId, checkpoints, segmentData])

  // Derived values
  const targets = plan?.targets ?? {}
  const inputs  = plan?.inputs  ?? {}

  const raceTotalKm = useMemo(() => {
    if (inputs.custom_km) return parseFloat(inputs.custom_km)
    return RACE_DISTANCE_KM[targets.race_type] ?? 0
  }, [inputs.custom_km, targets.race_type])

  const paceMinsPerKm = useMemo(() => {
    if (!targets.total_duration_minutes || !raceTotalKm) return 6
    return targets.total_duration_minutes / raceTotalKm
  }, [targets.total_duration_minutes, raceTotalKm])

  const validCheckpoints = checkpoints.filter(cp => cp.distance !== '' && !isNaN(parseFloat(cp.distance)))

  const sortedCheckpoints = useMemo(() => {
    return [...validCheckpoints].sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
  }, [validCheckpoints])

  // Build segments from sorted checkpoints + start/finish
  const segments = useMemo(() => {
    if (sortedCheckpoints.length === 0) return []
    const points = [
      { name: 'Start', distance: 0, elevation: 0 },
      ...sortedCheckpoints.map(cp => ({
        name:      cp.name || 'Checkpoint',
        distance:  parseFloat(cp.distance),
        elevation: parseFloat(cp.elevation) || 0,
        drop_bag:  cp.drop_bag,
      })),
      { name: 'Finish', distance: raceTotalKm, elevation: 0 },
    ]

    const segs = []
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to   = points[i + 1]
      const distKm = Math.max(0, to.distance - from.distance)
      const elevM  = Math.max(0, to.elevation)
      const modifier = getSegmentElevationModifier(distKm, elevM)
      const estMins  = estimateSegmentMinutes(distKm, elevM, paceMinsPerKm)
      const nutrition = calcSegmentNutrition(estMins, targets, modifier)
      segs.push({
        name:     `${from.name} → ${to.name}`,
        fromName: from.name,
        toName:   to.name,
        distKm,
        elevM,
        drop_bag: to.drop_bag ?? false,
        estMins,
        carbs:    nutrition.carbs,
        sodium:   nutrition.sodium,
        fluid:    nutrition.fluid,
      })
    }
    return segs
  }, [sortedCheckpoints, raceTotalKm, paceMinsPerKm, targets])

  // Ensure segmentData array matches segments length
  useEffect(() => {
    setSegmentData(prev => {
      if (prev.length === segments.length) return prev
      const next = Array.from({ length: segments.length }, (_, i) => prev[i] ?? { products: [], note: '' })
      return next
    })
  }, [segments.length])

  const availableProductNames = useMemo(() => {
    const sel = plan?.selection ?? []
    const names = [...new Set(sel.map(i => i.product?.name).filter(Boolean))]
    return names
  }, [plan])

  // Totals
  const totalPlanned = useMemo(() => {
    return segmentData.reduce((acc, seg) => {
      const carbsFromProducts = (seg.products ?? []).reduce((s, p) => {
        const prod = (plan?.selection ?? []).find(i => i.product?.name === p.name)?.product
        return s + (prod?.carbs_per_unit ?? 0) * p.quantity
      }, 0)
      return { carbs: acc.carbs + carbsFromProducts }
    }, { carbs: 0 })
  }, [segmentData, plan])

  const targetTotalCarbs = targets.total_carbs ?? 0

  function carbStatusClass(planned, target) {
    if (!target) return 'text-gray-400'
    const r = planned / target
    if (r >= 0.9 && r <= 1.1) return 'text-green-600'
    if (r >= 0.75 && r < 0.9) return 'text-amber-600'
    if (r > 1.1 && r <= 1.25) return 'text-amber-600'
    return 'text-red-500'
  }

  // Add / remove checkpoint
  function addCheckpoint() {
    setCheckpoints(prev => [...prev, newCheckpoint()])
  }

  function removeCheckpoint(id) {
    setCheckpoints(prev => prev.filter(cp => cp.id !== id))
  }

  function updateCheckpoint(id, field, value) {
    setCheckpoints(prev => prev.map(cp => cp.id === id ? { ...cp, [field]: value } : cp))
  }

  function sortCheckpoints() {
    setCheckpoints(prev => {
      const valid   = prev.filter(cp => cp.distance !== '' && !isNaN(parseFloat(cp.distance)))
      const invalid = prev.filter(cp => cp.distance === '' || isNaN(parseFloat(cp.distance)))
      const sorted  = [...valid].sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
      return [...sorted, ...invalid]
    })
  }

  // AI fill
  async function handleAiFill() {
    if (segments.length === 0) return
    setAiFilling(true)
    setAiFillMsg(null)
    try {
      const res = await fetch('/api/coach-copy?action=checkpoint-fill', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          plan: {
            race_type:       targets.race_type,
            goal_minutes:    targets.total_duration_minutes,
            conditions:      targets.conditions,
            carb_per_hour:   targets.carb_per_hour,
            sodium_per_hour: targets.sodium_per_hour,
            caffeine_ok:     targets.caffeine_ok,
            athlete_profile: inputs.athlete_profile ?? 'intermediate',
          },
          segments: segments.map((s, i) => ({
            name:          s.name,
            distance_km:   s.distKm,
            elevation_m:   s.elevM,
            drop_bag:      s.drop_bag,
            est_minutes:   s.estMins,
            carbs_needed:  s.carbs,
            sodium_needed: s.sodium,
          })),
          available_products: availableProductNames,
        }),
      })
      const data = await res.json()
      if (data.segments) {
        setSegmentData(prev => {
          const next = [...prev]
          for (const seg of data.segments) {
            const idx = seg.index
            if (idx >= 0 && idx < next.length) {
              next[idx] = {
                products: seg.products ?? [],
                note:     seg.note ?? '',
              }
            }
          }
          return next
        })
        setAiFillMsg('success')
      } else {
        setAiFillMsg('error')
      }
    } catch {
      setAiFillMsg('error')
    } finally {
      setAiFilling(false)
    }
  }

  // Save checkpoints
  async function handleSave() {
    if (!userId || !planId) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/plans', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userId}` },
        body:    JSON.stringify({
          planId,
          checkpoints: checkpoints.map((cp, i) => ({
            ...cp,
            segmentProducts: segmentData[i]?.products ?? [],
            segmentNote:     segmentData[i]?.note ?? '',
          })),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 3000)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  // PDF generation
  async function handleDownloadPdf() {
    setPdfGenerating(true)
    try {
      const { jsPDF } = await import('jspdf')
      await import('jspdf-autotable')

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const margin = 15
      const pageW  = 210
      const contentW = pageW - margin * 2

      // Header
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(72, 196, 176)
      doc.text('lecka', margin, margin + 5)

      const raceName = inputs.race_name || RACE_LABELS[targets.race_type] || 'Race'
      const goalTime = formatGoalTime(targets.total_duration_minutes)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(27, 27, 27)
      doc.text(`${raceName} — ${goalTime}`, pageW - margin, margin + 5, { align: 'right' })

      // Teal rule
      doc.setDrawColor(72, 196, 176)
      doc.setLineWidth(0.5)
      doc.line(margin, margin + 9, pageW - margin, margin + 9)

      let y = margin + 16

      // Race summary table (2-col, no borders)
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      const summaryRows = [
        [`Race: ${raceName}`, `Conditions: ${CONDITION_LABELS[targets.conditions] ?? '—'}`],
        [`Goal time: ${goalTime}`, `Date: ${inputs.race_date ?? '—'}`],
        [`Carbs/h: ${targets.carb_per_hour ?? '—'}g`, `Sodium/h: ${targets.sodium_per_hour ?? '—'}mg`],
      ]
      for (const row of summaryRows) {
        doc.setTextColor(100, 100, 100)
        doc.text(row[0], margin, y)
        doc.text(row[1], margin + contentW / 2, y)
        y += 5
      }

      y += 4

      // Main checkpoint table
      if (segments.length > 0) {
        const head = [['Segment', 'Dist', 'Elev', 'Est. time', 'Carbs', 'Sodium', 'Products', 'Notes']]
        const body = segments.map((seg, i) => {
          const sd = segmentData[i] ?? {}
          const productsText = (sd.products ?? []).map(p => `${p.quantity}× ${p.name.split(' ').slice(-2).join(' ')}`).join('\n') || '—'
          const distLabel = `${seg.distKm.toFixed(1)} km`
          const elevLabel = `+${seg.elevM}m`
          const timeLabel = formatDuration(seg.estMins)
          const segLabel  = seg.drop_bag ? `${seg.name}\n[DROP BAG]` : seg.name
          return [
            segLabel,
            distLabel,
            elevLabel,
            timeLabel,
            `${seg.carbs}g`,
            `${seg.sodium}mg`,
            productsText,
            sd.note ?? '',
          ]
        })

        // Totals row
        const totalCarbs  = segments.reduce((s, seg) => s + seg.carbs,  0)
        const totalSodium = segments.reduce((s, seg) => s + seg.sodium, 0)
        body.push(['TOTAL', '', '', '', `${totalCarbs}g`, `${totalSodium}mg`, 'See full plan', ''])

        doc.autoTable({
          startY: y,
          head,
          body,
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
          headStyles: { fillColor: [72, 196, 176], textColor: 255, fontStyle: 'bold', fontSize: 9 },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 14 },
            2: { cellWidth: 14 },
            3: { cellWidth: 18 },
            4: { cellWidth: 14 },
            5: { cellWidth: 18 },
            6: { cellWidth: 30 },
            7: { cellWidth: 'auto', fontStyle: 'italic', textColor: [120, 120, 120] },
          },
          didParseCell(data) {
            if (data.row.index === body.length - 1) {
              data.cell.styles.fontStyle = 'bold'
            }
            if (data.section === 'body' && data.column.index === 0 && typeof data.cell.raw === 'string' && data.cell.raw.includes('[DROP BAG]')) {
              data.cell.styles.textColor = [72, 196, 176]
            }
          },
        })
      }

      // Footer on each page
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text('lecka — real food, real performance — getlecka.com', pageW / 2, 297 - 5, { align: 'center' })
        doc.text(`${i} / ${pageCount}`, pageW - margin, 297 - 5, { align: 'right' })
      }

      const racetype = targets.race_type ?? 'race'
      doc.save(`lecka-checkpoint-plan-${racetype}.pdf`)
    } catch (err) {
      console.error('[CheckpointPage] PDF error:', err)
    } finally {
      setPdfGenerating(false)
    }
  }

  if (!isLoggedIn) return null

  const hasCheckpoints = validCheckpoints.length > 0
  const hasSegments    = segments.length > 0

  return (
    <div className="bg-white min-h-screen flex flex-col">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <a
            href={`/plan/${planId}`}
            className="text-sm text-[#48C4B0] font-medium hover:underline min-h-[44px] flex items-center gap-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Back to my plan
          </a>
          <img src="/logo.svg" alt="Lecka" className="h-6" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === 'saving' || !hasCheckpoints}
              className={[
                'min-h-[40px] px-4 rounded-xl text-sm font-semibold transition-colors',
                saveState === 'saved'
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-[#48C4B0] hover:text-[#48C4B0]',
                (!hasCheckpoints || saveState === 'saving') ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!hasCheckpoints || pdfGenerating}
              className={[
                'min-h-[40px] px-4 rounded-xl text-sm font-semibold bg-[#48C4B0] text-white',
                'hover:bg-[#3db09d] transition-colors',
                (!hasCheckpoints || pdfGenerating) ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {pdfGenerating ? 'Generating…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile target pills ────────────────────────────────────────────── */}
      <div className="lg:hidden bg-gray-50 border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-3 text-xs font-semibold text-[#48C4B0]">
          <span>{targets.carb_per_hour ?? '—'}g carbs/h</span>
          <span className="text-gray-300">|</span>
          <span>{targets.sodium_per_hour ?? '—'}mg sodium/h</span>
          <span className="text-gray-300">|</span>
          <span>{targets.fluid_ml_per_hour ?? '—'}ml fluid/h</span>
        </div>
      </div>

      {/* ── Two-panel body ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — desktop only */}
        <div className="hidden lg:block w-72 flex-shrink-0"
             style={{ height: 'calc(100vh - 60px)', position: 'sticky', top: 60 }}>
          {planLoading ? (
            <div className="h-full bg-gray-50 border-r border-gray-200 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-[#48C4B0] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <PlanSummaryPanel plan={plan} />
          )}
        </div>

        {/* Right panel — checkpoint builder */}
        <div className="flex-1 overflow-y-auto px-4 py-6" style={{ maxHeight: 'calc(100vh - 60px)' }}>
          <div className="max-w-3xl mx-auto space-y-8">

            {/* ── Section 1: Checkpoint table ──────────────────────────── */}
            <section>
              <SectionLabel>Your checkpoints</SectionLabel>
              {checkpoints.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  Add your first checkpoint below to start planning.
                </p>
              ) : (
                <div className="space-y-2">
                  {checkpoints.map((cp, idx) => (
                    <div key={cp.id}
                         className="border-2 border-gray-100 rounded-xl p-3 grid grid-cols-12 gap-2 items-center">
                      {/* # */}
                      <div className="col-span-1">
                        <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
                      </div>
                      {/* Name */}
                      <div className="col-span-4">
                        <input
                          type="text"
                          value={cp.name}
                          onChange={e => updateCheckpoint(cp.id, 'name', e.target.value)}
                          placeholder="e.g. CP1 — River crossing"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs
                                     focus:outline-none focus:border-[#48C4B0]"
                        />
                      </div>
                      {/* Distance */}
                      <div className="col-span-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={cp.distance}
                          onChange={e => updateCheckpoint(cp.id, 'distance', e.target.value)}
                          onBlur={sortCheckpoints}
                          placeholder="km"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs
                                     focus:outline-none focus:border-[#48C4B0]"
                        />
                      </div>
                      {/* Elev */}
                      <div className="col-span-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={cp.elevation}
                          onChange={e => updateCheckpoint(cp.id, 'elevation', e.target.value)}
                          placeholder="elev m"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs
                                     focus:outline-none focus:border-[#48C4B0]"
                        />
                      </div>
                      {/* Drop bag toggle */}
                      <div className="col-span-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateCheckpoint(cp.id, 'drop_bag', !cp.drop_bag)}
                          className={[
                            'text-xs px-2 py-1 rounded-full border transition-colors',
                            cp.drop_bag
                              ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                              : 'border-gray-200 text-gray-400 hover:border-[#48C4B0]',
                          ].join(' ')}
                        >
                          Bag
                        </button>
                      </div>
                      {/* Remove */}
                      <div className="col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeCheckpoint(cp.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-full
                                     text-gray-300 hover:text-red-400 transition-colors"
                          aria-label="Remove checkpoint"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Column labels */}
              {checkpoints.length > 0 && (
                <div className="grid grid-cols-12 gap-2 mt-1 px-3">
                  <div className="col-span-1" />
                  <div className="col-span-4 text-xs text-gray-400">Name</div>
                  <div className="col-span-2 text-xs text-gray-400">Dist (km)</div>
                  <div className="col-span-2 text-xs text-gray-400">Elev gain (m)</div>
                  <div className="col-span-2 text-xs text-gray-400">Drop bag</div>
                  <div className="col-span-1" />
                </div>
              )}

              <button
                type="button"
                onClick={addCheckpoint}
                className="mt-4 w-full min-h-[44px] border-2 border-dashed border-[#48C4B0]
                           text-[#48C4B0] text-sm font-semibold rounded-xl
                           hover:bg-[#48C4B0]/5 transition-colors"
              >
                + Add checkpoint
              </button>
            </section>

            {/* ── AI fill button ────────────────────────────────────────── */}
            {hasCheckpoints && (
              <section>
                <button
                  type="button"
                  onClick={handleAiFill}
                  disabled={aiFilling}
                  className={[
                    'w-full min-h-[52px] rounded-xl text-sm font-semibold transition-colors',
                    aiFilling
                      ? 'bg-[#48C4B0]/60 text-white cursor-not-allowed'
                      : 'bg-[#48C4B0] text-white hover:bg-[#3db09d]',
                  ].join(' ')}
                >
                  {aiFilling ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Filling your plan… this takes a few seconds
                    </span>
                  ) : (
                    'Fill nutrition with AI →'
                  )}
                </button>
                {aiFillMsg === 'success' && (
                  <p className="text-xs text-[#48C4B0] text-center mt-2">
                    Plan filled — review and adjust as needed.
                  </p>
                )}
                {aiFillMsg === 'error' && (
                  <p className="text-xs text-gray-400 text-center mt-2">
                    Couldn't auto-fill — add products manually using the edit icon.
                  </p>
                )}
              </section>
            )}

            {/* ── Section 2: Nutrition table ────────────────────────────── */}
            {hasSegments && (
              <section>
                <SectionLabel>Nutrition per segment</SectionLabel>
                <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
                  {/* Header row */}
                  <div className="grid grid-cols-8 gap-1 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
                    <div className="col-span-2">Segment</div>
                    <div>Dist</div>
                    <div>Time</div>
                    <div>Carbs</div>
                    <div>Sodium</div>
                    <div className="col-span-2">Products</div>
                  </div>

                  {segments.map((seg, i) => {
                    const sd = segmentData[i] ?? {}
                    const productChips = (sd.products ?? [])
                      .filter(p => p.quantity > 0)
                      .map(p => `${p.quantity}× ${p.name.split(' ').slice(-2).join(' ')}`)
                      .join(' · ')

                    return (
                      <div key={i}
                           className={`grid grid-cols-8 gap-1 px-3 py-3 text-xs border-t border-gray-100
                                       ${seg.drop_bag ? 'bg-[#48C4B0]/5' : ''}`}>
                        <div className="col-span-2">
                          <p className="font-semibold text-[#1B1B1B] leading-snug">{seg.name}</p>
                          {seg.drop_bag && (
                            <span className="inline-block mt-0.5 text-[10px] font-semibold
                                             text-[#48C4B0] border border-[#48C4B0] rounded px-1">
                              DROP BAG ✓
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500 pt-0.5">{seg.distKm.toFixed(1)}km</div>
                        <div className="text-gray-500 pt-0.5">~{formatDuration(seg.estMins)}</div>
                        <div className="font-semibold text-[#1B1B1B] pt-0.5">{seg.carbs}g</div>
                        <div className="text-gray-500 pt-0.5">{seg.sodium}mg</div>
                        <div className="col-span-1 text-gray-500 pt-0.5 leading-relaxed">
                          {productChips || '—'}
                          {sd.note && (
                            <p className="text-[10px] text-gray-400 italic mt-0.5 leading-snug">{sd.note}</p>
                          )}
                        </div>
                        <div className="flex items-start justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingIndex(i)}
                            className="w-7 h-7 flex items-center justify-center rounded-full
                                       text-gray-300 hover:text-[#48C4B0] transition-colors"
                            aria-label="Edit segment"
                          >
                            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Totals row */}
                  <div className="grid grid-cols-8 gap-1 px-3 py-3 text-xs border-t-2 border-gray-200 bg-gray-50">
                    <div className="col-span-2 font-bold text-[#1B1B1B]">TOTAL</div>
                    <div />
                    <div />
                    <div>
                      <span className={`font-bold ${carbStatusClass(totalPlanned.carbs, targetTotalCarbs)}`}>
                        {totalPlanned.carbs}g
                      </span>
                      {targetTotalCarbs > 0 && (
                        <span className="text-gray-400 ml-1">/ {targetTotalCarbs}g</span>
                      )}
                    </div>
                    <div className="text-gray-500 font-semibold">
                      {segments.reduce((s, seg) => s + seg.sodium, 0)}mg
                    </div>
                    <div className="col-span-2 text-gray-400 italic">See full plan</div>
                  </div>
                </div>
              </section>
            )}

          </div>
        </div>
      </div>

      {/* ── Segment edit popover ─────────────────────────────────────────── */}
      {editingIndex !== null && (
        <SegmentEditPopover
          seg={segmentData[editingIndex] ?? { products: [], note: '' }}
          products={availableProductNames}
          onChange={data => {
            setSegmentData(prev => {
              const next = [...prev]
              next[editingIndex] = data
              return next
            })
          }}
          onClose={() => setEditingIndex(null)}
        />
      )}

    </div>
  )
}
