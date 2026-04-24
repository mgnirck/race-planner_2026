/**
 * /api/send-plan.js — Vercel serverless function
 *
 * POST body: { email, inputs, targets, selectedProducts }
 *
 *   email            : string   — recipient address
 *   inputs           : object   — raw form state from StepForm
 *   targets          : object   — output of calculateTargets()
 *   selectedProducts : array    — output of selectProducts()
 *
 * Behaviour
 * ---------
 * 1. Generate a PDF of the nutrition plan using jsPDF + jspdf-autotable
 * 2. Send the PDF to the athlete via Resend
 * 3. Create or update a Shopify customer (non-fatal — email always ships first)
 *
 * Environment variables (set in Vercel dashboard)
 * -------------------------------------------------
 * RESEND_API_KEY        — Resend API key
 * SHOPIFY_ACCESS_TOKEN  — Shopify Admin API access token
 * SHOPIFY_STORE_URL     — e.g. getlecka.myshopify.com (no https://)
 */

import jsPDFModule from 'jspdf'
// IMPORTANT: side-effect import. jspdf-autotable ships a UMD bundle whose CJS
// default export is an object wrapper ({ default: fn, __esModule: true }), not
// a function — so `import autoTable from 'jspdf-autotable'; autoTable(doc, ...)`
// throws "autoTable is not a function" under Node ESM on Vercel. Loading the
// module for its side effect invokes applyPlugin(jsPDF) and attaches
// `autoTable` to jsPDF.API, so `doc.autoTable({...})` works everywhere.
// Do NOT change this to a default or namespace import.
import 'jspdf-autotable'
import { Resend }  from 'resend'
import { computeCartItems, computeLinePrice, computeOptimalGelCart } from '../src/engine/region-utils.js'
import { createRequire } from 'module'
const _require = createRequire(import.meta.url)
const allProductsCatalog = _require('../src/config/products.json')
import { getServerT } from './i18n-server.js'

const { jsPDF } = jsPDFModule

// ── Brand colours ─────────────────────────────────────────────────────────────

const C = {
  green:      '#48C4B0',
  greenRgb:   [72, 196, 176],
  accent:     '#48C4B0',
  accentRgb:  [72, 196, 176],
  white:      '#FFFFFF',
  whiteRgb:   [255, 255, 255],
  black:      '#1B1B1B',
  blackRgb:   [27, 27, 27],
  gray:       '#666666',
  grayRgb:    [102, 102, 102],
  light:      '#F5F5F5',
  lightRgb:   [245, 245, 245],
}

// ── Human-readable label maps ─────────────────────────────────────────────────

const RACE_LABELS = {
  '5k':               '5 km road',
  '10k':              '10 km road',
  'half_marathon':    'Half marathon',
  'marathon':         'Marathon',
  'ultra_50k':        'Ultra 50 km',
  'ultra_100k':       'Ultra 100 km',
  'triathlon_sprint': 'Sprint triathlon',
  'triathlon_olympic':'Olympic triathlon',
  'triathlon_70_3':   '70.3 triathlon',
  'triathlon_140_6':  'Ironman 140.6',
}

const EFFORT_LABELS = {
  'easy':       'Easy / long day',
  'race_pace':  'Race pace',
  'hard':       'All-out effort',
}

const CONDITIONS_LABELS = {
  'cool':  'Cool (under 15°C / 59°F)',
  'mild':  'Mild (15–20°C / 59–68°F)',
  'warm':  'Warm (20–26°C / 68–79°F)',
  'hot':   'Hot (over 26°C / 79°F)',
  'humid': 'Humid',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format a minute offset from race start into a readable time string.
 *   -30  → "30m before"
 *    0   → "0:00"
 *   20   → "0:20"
 *   135  → "2:15"
 *   150  (past 135) → "+15m after"
 */
function fmtMin(minutes, totalDuration, t) {
  if (minutes < 0)
    return t ? t('pdf.time.before', { n: Math.abs(minutes) }) : `${Math.abs(minutes)}m before`
  if (totalDuration !== undefined && minutes > totalDuration)
    return t ? t('pdf.time.after', { n: minutes - totalDuration }) : `+${minutes - totalDuration}m after`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

/** Race label — prefer the athlete's own race name, fall back to translated key label */
function raceLabel(inputs, t) {
  if (inputs.race_name && inputs.race_name.trim()) return inputs.race_name.trim()
  if (t) return t(`racetype.${inputs.race_type}`, { defaultValue: inputs.race_type })
  return RACE_LABELS[inputs.race_type] ?? inputs.race_type
}

/** Check y position and add a new page if less than `need` mm remain */
function ensureSpace(doc, y, need = 40) {
  if (y + need > 280) { doc.addPage(); return 20 }
  return y
}

/** Draw a green section heading with a rule underneath; returns new y */
function sectionHeading(doc, title, y, marginL, contentW) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(C.green)
  doc.text(title, marginL, y)
  doc.setDrawColor(C.green)
  doc.setLineWidth(0.4)
  doc.line(marginL, y + 2, marginL + contentW, y + 2)
  return y + 9
}

const REGION_STORE_URLS = {
  us: 'https://www.getlecka.com',
  de: 'https://www.getlecka.de',
  dk: 'https://www.getlecka.dk',
  ch: 'https://www.getlecka.ch',
}

/** Builds an optimised Shopify cart URL, using variety packs when cheaper */
function buildCartURL(selectedProducts, region = 'us', discountCode = 'NUTRIPLAN10') {
  const storeUrl = REGION_STORE_URLS[region] ?? REGION_STORE_URLS.us
  if (!selectedProducts?.length) return storeUrl

  // Aggregate units per product
  const unitsByPid = {}
  const productById = {}
  for (const item of selectedProducts) {
    const pid = item.product.id
    unitsByPid[pid] = (unitsByPid[pid] ?? 0) + item.quantity
    productById[pid] = item.product
  }

  // Build aggregated rows with cart items (same shape as ResultsPage aggregateByProduct)
  const allRows = Object.entries(unitsByPid).map(([pid, totalUnits]) => {
    const product   = productById[pid]
    const cartItems = computeCartItems(product, region, totalUnits)
    const linePrice = computeLinePrice(product, region, totalUnits)
    const cartUnits = cartItems.reduce((s, i) => s + i.quantity * i.units_per_pack, 0)
    return { product, totalUnits, cartItems, linePrice, cartUnits }
  }).filter(r => r.cartItems.length > 0)

  // Apply variety-pack optimisation for gel rows
  const gelRows   = allRows.filter(r => r.product.type === 'gel')
  const otherRows = allRows.filter(r => r.product.type !== 'gel')
  const { rows: optimalGelRows } = computeOptimalGelCart(gelRows, region, allProductsCatalog)
  const optimisedRows = [...optimalGelRows, ...otherRows]

  // Build variant totals from optimised rows
  const variantTotals = {}
  for (const row of optimisedRows) {
    for (const line of row.cartItems) {
      const vid = String(line.shopify_variant_id)
      if (!/^\d+$/.test(vid)) {
        console.warn(`[send-plan] Non-numeric variant ID "${vid}" for "${row.product.name}" — skipping`)
        continue
      }
      variantTotals[vid] = (variantTotals[vid] ?? 0) + line.quantity
    }
  }

  if (!Object.keys(variantTotals).length) return storeUrl
  const parts = Object.entries(variantTotals).map(([vid, qty]) => `${vid}:${qty}`)
  const base  = `${storeUrl}/cart/${parts.join(',')}`
  return discountCode ? `${base}?discount=${encodeURIComponent(discountCode)}` : base
}

// ── Training overage helper ───────────────────────────────────────────────────

function computeTrainingInfo(selectedProducts, region) {
  const unitsByPid = {}
  const productById = {}
  for (const item of selectedProducts) {
    const pid = item.product.id
    unitsByPid[pid] = (unitsByPid[pid] ?? 0) + item.quantity
    productById[pid] = item.product
  }
  let totalRaceUnits = 0
  let totalCartUnits = 0
  for (const [pid, raceUnits] of Object.entries(unitsByPid)) {
    const product = productById[pid]
    const cartItems = computeCartItems(product, region, raceUnits)
    const cartUnits = cartItems.reduce((s, item) => s + item.quantity * item.units_per_pack, 0)
    totalRaceUnits += raceUnits
    totalCartUnits += cartUnits
  }
  return {
    hasOverage:    totalCartUnits > totalRaceUnits,
    totalRaceUnits,
    totalCartUnits,
    extraUnits:    totalCartUnits - totalRaceUnits,
  }
}

// ── PDF generation ────────────────────────────────────────────────────────────

function generatePDF(inputs, targets, selectedProducts, region = 'us', lang = 'en') {
  const t  = getServerT(lang)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W  = 210   // page width (A4)
  const ML = 20    // left margin
  const MR = 20    // right margin
  const CW = W - ML - MR  // content width = 170 mm

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.setFillColor(C.green)
  doc.rect(0, 0, W, 38, 'F')

  // Wordmark — lowercase bold, white on teal, matching the Lecka brand
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(30)
  doc.setTextColor(C.white)
  doc.text('lecka', ML, 20)

  // Small brand tagline
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(200, 240, 235)
  doc.text(t('pdf.header.tagline'), ML, 28)

  // Right side — plan title + date
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(t('pdf.header.title'), W - MR, 17, { align: 'right' })

  const localeMap = { en: 'en-AU', de: 'de-DE', da: 'da-DK', fr: 'fr-CH' }
  const dateStr = new Date().toLocaleDateString(localeMap[lang] ?? 'en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(dateStr, W - MR, 25, { align: 'right' })

  let y = 48

  // ── Runner summary ────────────────────────────────────────────────────────
  doc.setFillColor(C.light)
  doc.setDrawColor(C.light)
  doc.roundedRect(ML, y, CW, 30, 2, 2, 'F')

  const summaryItems = [
    [t('pdf.summary.race'),       raceLabel(inputs, t)],
    [t('pdf.summary.goalTime'),   inputs.goal_time],
    [t('pdf.summary.conditions'), t(`conditions.${inputs.conditions}`, { defaultValue: inputs.conditions })],
    [t('pdf.summary.effort'),     t(`effort.${inputs.effort}`,         { defaultValue: inputs.effort })],
    [t('pdf.summary.weight'),     `${inputs.weight_value}\u202f${inputs.weight_unit}`],
    [t('pdf.summary.caffeine'),   inputs.caffeine_ok ? t('pdf.summary.yes') : t('pdf.summary.no')],
  ]

  const colW = CW / 3
  summaryItems.forEach((item, i) => {
    const col  = i % 3
    const row  = Math.floor(i / 3)
    const x    = ML + 5 + col * colW
    const itemY = y + 8 + row * 12

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(C.green)
    doc.text(item[0].toUpperCase(), x, itemY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(C.black)
    doc.text(item[1], x, itemY + 5)
  })

  y += 38

  // ── Section 1: Nutrition targets ──────────────────────────────────────────
  y = ensureSpace(doc, y, 60)
  y = sectionHeading(doc, t('pdf.section.nutritionTargets'), y, ML, CW)

  const durH = targets.total_duration_minutes / 60
  const totalFluid = Math.round(targets.fluid_ml_per_hour * durH)

  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [[t('pdf.nutrition.metric'), t('pdf.nutrition.perHour'), t('pdf.nutrition.totalRace')]],
    body: [
      [t('pdf.nutrition.carbohydrates'), `${targets.carb_per_hour} g`,       `${targets.total_carbs} g`],
      [t('pdf.nutrition.sodium'),        `${targets.sodium_per_hour} mg`,    `${targets.total_sodium} mg`],
      [t('pdf.nutrition.fluid'),         `${targets.fluid_ml_per_hour} ml`,  `${totalFluid} ml`],
    ],
    styles: {
      fontSize: 10,
      cellPadding: 4,
      textColor: C.blackRgb,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.greenRgb,
      textColor: C.whiteRgb,
      fontStyle: 'bold',
      fontSize: 10,
    },
    alternateRowStyles: { fillColor: C.lightRgb },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 65 },
      1: { halign: 'center' },
      2: { halign: 'center' },
    },
  })

  y = doc.lastAutoTable.finalY + 10

  // ── Section 2: Product plan ───────────────────────────────────────────────
  y = ensureSpace(doc, y, 50)
  y = sectionHeading(doc, t('pdf.section.productPlan'), y, ML, CW)

  const productRows = selectedProducts.map(item => [
    item.product.name,
    String(item.quantity),
    item.timing_minutes.map(min => fmtMin(min, targets.total_duration_minutes, t)).join(', '),
    item.note ?? '',
  ])

  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [[t('pdf.product.product'), t('pdf.product.qty'), t('pdf.product.when'), t('pdf.product.instructions')]],
    body: productRows,
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: C.blackRgb,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.greenRgb,
      textColor: C.whiteRgb,
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: C.lightRgb },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 12, halign: 'center' },
      2: { cellWidth: 30 },
      3: { cellWidth: 'auto', fontSize: 8, textColor: C.grayRgb },
    },
  })

  y = doc.lastAutoTable.finalY + 10

  // ── Section 2b: Shopping recommendation (variety pack when cheaper) ───────
  {
    const unitsByPid = {}
    const productByPid = {}
    for (const item of selectedProducts) {
      const pid = item.product.id
      unitsByPid[pid] = (unitsByPid[pid] ?? 0) + item.quantity
      productByPid[pid] = item.product
    }
    const gelAgg = Object.entries(unitsByPid)
      .filter(([pid]) => productByPid[pid].type === 'gel')
      .map(([pid, totalUnits]) => ({
        product:   productByPid[pid],
        totalUnits,
        cartItems: computeCartItems(productByPid[pid], region, totalUnits),
        linePrice: computeLinePrice(productByPid[pid], region, totalUnits),
        cartUnits: computeCartItems(productByPid[pid], region, totalUnits).reduce((s, i) => s + i.quantity * i.units_per_pack, 0),
      }))
    const { usesVarietyPack, savedAmount } = computeOptimalGelCart(gelAgg, region, allProductsCatalog)
    if (usesVarietyPack && savedAmount > 0) {
      y = ensureSpace(doc, y, 20)
      const currencySymbol = region === 'de' ? '\u20ac' : region === 'dk' ? 'kr' : region === 'vn' ? '\u20ab' : '$'
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(C.green)
      doc.text(
        t('pdf.product.shoppingTip', { currency: currencySymbol, amount: region === 'vn' ? Math.round(savedAmount).toLocaleString('en-US') : savedAmount.toFixed(2) }),
        ML, y
      )
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(C.black)
      y += 8
    }
  }

  // ── Section 2c: Training preparation (when buying more than race needs) ──
  const tInfo = computeTrainingInfo(selectedProducts, region)
  if (tInfo.hasOverage) {
    y = ensureSpace(doc, y, 55)
    y = sectionHeading(doc, t('pdf.section.trainingPrep'), y, ML, CW)

    const trainingLines = [
      t('pdf.training.intro', { count: tInfo.totalRaceUnits }),
      t('pdf.training.multipack', { cart: tInfo.totalCartUnits, extra: tInfo.extraUnits }),
      '',
      t('pdf.training.prepTitle'),
      `  \u2022  ${t('pdf.training.tip1')}`,
      `  \u2022  ${t('pdf.training.tip2')}`,
      `  \u2022  ${t('pdf.training.tip3')}`,
      `  \u2022  ${t('pdf.training.tip4')}`,
    ]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(C.gray)
    for (const line of trainingLines) {
      if (line === '') { y += 3; continue }
      const wrapped = doc.splitTextToSize(line, CW)
      doc.text(wrapped, ML, y)
      y += wrapped.length * 5.5
    }
    y += 4
  }

  // ── Section 3: Race day timeline ──────────────────────────────────────────
  y = ensureSpace(doc, y, 60)
  y = sectionHeading(doc, t('pdf.section.raceTimeline'), y, ML, CW)

  // Build a flat sorted list of events, inserting race start + finish markers
  const events = [
    { time: 0,                              action: t('pdf.timeline.raceStart'),  product: '—', marker: true },
    { time: targets.total_duration_minutes, action: t('pdf.timeline.finishLine'), product: '—', marker: true },
    ...selectedProducts.flatMap(item =>
      item.timing_minutes.map(min => ({
        time: min,
        action:
          min < 0                                    ? t('pdf.timeline.preRaceFuel') :
          min >= targets.total_duration_minutes      ? t('pdf.timeline.postRace') :
          item.product.caffeine                      ? t('pdf.timeline.fuelCaffeine') : t('pdf.timeline.fuel'),
        product: item.product.name,
        marker: false,
      }))
    ),
  ]
  events.sort((a, b) => a.time - b.time)

  const markerIndices = new Set()
  const timelineBody = events.map((e, i) => {
    if (e.marker) markerIndices.add(i)
    return [fmtMin(e.time, targets.total_duration_minutes, t), e.action, e.product]
  })

  doc.autoTable({
    startY: y,
    margin: { left: ML, right: MR },
    head: [[t('pdf.timeline.time'), t('pdf.timeline.action'), t('pdf.timeline.product')]],
    body: timelineBody,
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: C.blackRgb,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.greenRgb,
      textColor: C.whiteRgb,
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: C.lightRgb },
    columnStyles: {
      0: { cellWidth: 26, halign: 'center' },
      1: { cellWidth: 52 },
      2: { cellWidth: 'auto' },
    },
    // Highlight the race start and finish rows in accent green
    didParseCell(data) {
      if (data.section !== 'body') return
      if (markerIndices.has(data.row.index)) {
        data.cell.styles.fillColor = C.accentRgb
        data.cell.styles.textColor = C.whiteRgb
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  y = doc.lastAutoTable.finalY + 10

  // ── Section 4: Pre-race sodium loading (if applicable) ────────────────────
  const isHotCondition = ['hot', 'humid'].includes(inputs.conditions)
  const isLongRace = targets.total_duration_minutes >= 240
  if (isHotCondition && isLongRace) {
    y = ensureSpace(doc, y, 50)
    y = sectionHeading(doc, t('pdf.section.sodiumLoading'), y, ML, CW)

    const lines = [
      t('pdf.sodium.line1'),
      t('pdf.sodium.line2'),
      '',
      t('pdf.sodium.line3'),
      t('pdf.sodium.line4'),
      t('pdf.sodium.line5'),
      t('pdf.sodium.line6'),
      '',
      t('pdf.sodium.line7'),
    ]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(C.gray)
    for (const line of lines) {
      doc.text(line === '' ? '' : line, ML, y)
      y += line === '' ? 3 : 5.5
    }
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFillColor(C.green)
    doc.rect(0, 285, W, 12, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(C.white)
    doc.text(
      t('pdf.footer'),
      W / 2,
      292,
      { align: 'center' },
    )
  }

  return Buffer.from(doc.output('arraybuffer'))
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendPlanEmail(email, inputs, targets, selectedProducts, pdfBuffer, cartUrl, region = 'us', lang = 'en') {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is not set')
  }
  const t       = getServerT(lang)
  const resend  = new Resend(process.env.RESEND_API_KEY)
  const label   = raceLabel(inputs, t)
  const subject = t('email.subject', { label })

  const productListHtml = selectedProducts
    .map(item => `<li><strong>${item.product.name}</strong> &times;&nbsp;${item.quantity} &mdash; ${item.note ?? ''}</li>`)
    .join('\n')

  // Check variety pack optimisation for email
  const emailUnitsByPid = {}
  const emailProductByPid = {}
  for (const item of selectedProducts) {
    const pid = item.product.id
    emailUnitsByPid[pid] = (emailUnitsByPid[pid] ?? 0) + item.quantity
    emailProductByPid[pid] = item.product
  }
  const emailGelAgg = Object.entries(emailUnitsByPid)
    .filter(([pid]) => emailProductByPid[pid].type === 'gel')
    .map(([pid, totalUnits]) => ({
      product:   emailProductByPid[pid],
      totalUnits,
      cartItems: computeCartItems(emailProductByPid[pid], region, totalUnits),
      linePrice: computeLinePrice(emailProductByPid[pid], region, totalUnits),
      cartUnits: computeCartItems(emailProductByPid[pid], region, totalUnits).reduce((s, i) => s + i.quantity * i.units_per_pack, 0),
    }))
  const emailVpResult = computeOptimalGelCart(emailGelAgg, region, allProductsCatalog)
  const currencySymbol = region === 'de' ? '&euro;' : region === 'dk' ? 'kr' : region === 'vn' ? '&#8363;' : '$'
  const varietyPackHtml = emailVpResult.usesVarietyPack && emailVpResult.savedAmount > 0 ? `
    <div style="background:#f0fdf9;border:2px solid #48C4B0;border-radius:8px;padding:14px 16px;margin:12px 0;">
      <p style="margin:0;font-size:13px;color:#1B1B1B;">
        <strong>&#10003; ${t('email.varietyPack.bestValue')}</strong> ${t('email.varietyPack.body', { currency: currencySymbol, amount: region === 'vn' ? Math.round(emailVpResult.savedAmount).toLocaleString('en-US') : emailVpResult.savedAmount.toFixed(2) })}
      </p>
    </div>` : ''

  const emailTInfo = computeTrainingInfo(selectedProducts, region)
  const trainingHtml = emailTInfo.hasOverage ? `
    <div style="background:#f0fdf9;border:1px solid #48C4B0;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1B1B1B;">${t('email.training.title')}</p>
      <p style="margin:0 0 12px;font-size:13px;color:#374151;">
        ${t('email.training.body', { count: emailTInfo.totalRaceUnits, cart: emailTInfo.totalCartUnits, extra: emailTInfo.extraUnits })}
      </p>
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;">${t('email.training.extrasTitle')}</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.8;">
        <li>${t('email.training.tip1')}</li>
        <li>${t('email.training.tip2')}</li>
        <li>${t('email.training.tip3')}</li>
        <li>${t('email.training.tip4')}</li>
      </ul>
    </div>` : ''

  const html = /* html */`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    *  { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #f9f9f9; font-family: -apple-system, Helvetica Neue, Arial, sans-serif; color: #1B1B1B; }
    .wrap      { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header    { background: #48C4B0; padding: 28px 32px; }
    .header svg { display: block; margin-bottom: 8px; }
    .header p  { margin: 6px 0 0; color: rgba(255,255,255,0.75); font-size: 14px; }
    .body      { padding: 32px; }
    .targets   { display: flex; gap: 12px; margin: 24px 0; }
    .tbox      { flex: 1; border: 2px solid #e8e8e8; border-radius: 10px; padding: 16px 12px; text-align: center; }
    .tbox .val { font-size: 26px; font-weight: 700; color: #48C4B0; line-height: 1; }
    .tbox .lbl { font-size: 11px; color: #888; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.05em; }
    .cta       { display: block; background: #F64866; color: #fff !important; text-decoration: none;
                 padding: 14px 24px; border-radius: 8px; text-align: center;
                 font-weight: 700; font-size: 15px; margin: 28px 0; }
    .cta:hover { background: #e03558; }
    ul         { padding-left: 20px; line-height: 1.9; color: #333; }
    .note      { font-size: 13px; color: #888; margin-top: 20px; }
    .footer    { background: #f2f2f2; padding: 16px 32px; font-size: 12px; color: #999; text-align: center; }
    .footer a  { color: #48C4B0; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 44" height="36" aria-label="lecka">
        <text x="0" y="36" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-weight="800" font-size="38" letter-spacing="-1" fill="#ffffff">lecka</text>
      </svg>
      <p>${t('email.headerTagline')}</p>
    </div>
    <div class="body">
      <p>${t('email.hi')}</p>
      <p>${t('email.intro', { label, goalTime: inputs.goal_time })}</p>

      <div class="targets">
        <div class="tbox">
          <div class="val">${targets.carb_per_hour}<small style="font-size:14px">g</small></div>
          <div class="lbl">${t('email.carbsLabel')}</div>
        </div>
        <div class="tbox">
          <div class="val">${targets.sodium_per_hour}<small style="font-size:14px">mg</small></div>
          <div class="lbl">${t('email.sodiumLabel')}</div>
        </div>
        <div class="tbox">
          <div class="val">${targets.fluid_ml_per_hour}<small style="font-size:14px">ml</small></div>
          <div class="lbl">${t('email.fluidLabel')}</div>
        </div>
      </div>

      <p style="margin-bottom: 6px;"><strong>${t('email.productPlanTitle')}</strong></p>
      <ul>
        ${productListHtml}
      </ul>

      ${varietyPackHtml}

      ${trainingHtml}

      <a href="${cartUrl}" class="cta">${t('email.cta')}</a>

      <div style="background:#f0fdf9;border:1px solid #48C4B0;border-radius:8px;padding:12px 16px;margin:0 0 20px;">
        <p style="margin:0;font-size:13px;color:#1B1B1B;">
          <strong>${t('email.discountTitle')}</strong> ${t('email.discountBody')}
        </p>
      </div>

      <p class="note">
        ${t('email.note')}
      </p>
    </div>
    <div class="footer">
      ${t('email.footer')}
      <a href="https://getlecka.com">getlecka.com</a>
    </div>
  </div>
</body>
</html>`

  const { error } = await resend.emails.send({
    from:        'Lecka <info@getlecka.com>',
    to:          [email],
    subject,
    html,
    attachments: [
      {
        filename:     `lecka-race-plan-${inputs.race_type ?? 'race'}.pdf`,
        content:      pdfBuffer,
        content_type: 'application/pdf',
      },
    ],
  })

  if (error) throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`)
}

// ── Shopify customer upsert ───────────────────────────────────────────────────

async function upsertShopifyCustomer(email, inputs, region = 'us') {
  let accessToken, storeUrl
  if (region === 'de') {
    accessToken = process.env.SHOPIFY_ACCESS_TOKEN_DE
    storeUrl    = process.env.SHOPIFY_STORE_URL_DE
  } else {
    accessToken = process.env.SHOPIFY_ACCESS_TOKEN
    storeUrl    = process.env.SHOPIFY_STORE_URL
  }
  if (!accessToken || !storeUrl) {
    throw new Error(`Shopify env vars missing for region "${region}" (need SHOPIFY_ACCESS_TOKEN${region === 'de' ? '_DE' : ''} and SHOPIFY_STORE_URL${region === 'de' ? '_DE' : ''})`)
  }

  const base    = `https://${storeUrl}/admin/api/2024-01`
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type':           'application/json',
    'Accept':                 'application/json',
  }

  const note = [
    `Race: ${raceLabel(inputs)}`,
    `Goal: ${inputs.goal_time}`,
    `Generated: ${new Date().toISOString().split('T')[0]}`,
  ].join(' | ')

  // email_marketing_consent replaces deprecated accepts_marketing (since API 2022-07)
  const marketingConsent = {
    state:                'subscribed',
    opt_in_level:         'single_opt_in',
    consent_updated_at:   new Date().toISOString(),
  }

  // 1. Direct email lookup — more reliable than /search.json which is eventually consistent
  const lookupUrl = `${base}/customers.json?email=${encodeURIComponent(email)}&limit=1&fields=id,email,tags`
  const lookupRes = await fetch(lookupUrl, { headers })
  if (!lookupRes.ok) {
    const body = await lookupRes.text()
    throw new Error(`Shopify lookup ${lookupRes.status}: ${body}`)
  }
  const { customers } = await lookupRes.json()
  const existing = customers?.[0]

  if (existing) {
    // 2a. Update existing customer — merge tags, never clobber
    const existingTags = existing.tags
      ? existing.tags.split(',').map(t => t.trim()).filter(Boolean)
      : []
    const mergedTags = Array.from(new Set([...existingTags, 'race-planner', 'plan'])).join(', ')

    const putRes = await fetch(`${base}/customers/${existing.id}.json`, {
      method:  'PUT',
      headers,
      body:    JSON.stringify({
        customer: {
          id: existing.id,
          tags: mergedTags,
          note,
          email_marketing_consent: marketingConsent,
        },
      }),
    })
    if (!putRes.ok) {
      const body = await putRes.text()
      throw new Error(`Shopify update ${putRes.status}: ${body}`)
    }
    console.log(`[send-plan] Shopify customer updated: ${existing.id} | tags: ${mergedTags}`)
  } else {
    // 2b. Create new customer with plan + race-planner tags and marketing consent
    const postRes = await fetch(`${base}/customers.json`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({
        customer: {
          email,
          tags:                    'race-planner, plan',
          note,
          verified_email:          true,
          email_marketing_consent: marketingConsent,
        },
      }),
    })
    if (!postRes.ok) {
      const body = await postRes.text()
      // 422 means duplicate — customer was created between our lookup and POST
      if (postRes.status === 422) {
        console.warn(`[send-plan] Shopify 422 on create (duplicate?): ${body}`)
        return // non-fatal; customer already exists
      }
      throw new Error(`Shopify create ${postRes.status}: ${body}`)
    }
    const created = await postRes.json()
    console.log(`[send-plan] Shopify customer created: ${created.customer?.id} | email: ${email}`)
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
//
// In-memory Map keyed by IP. Acceptable for MVP — the Map resets on every cold
// start, so counts are per-instance rather than global. For production hardening
// replace with Upstash Redis: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
// Their free tier covers ~10k requests/day with a single UPSTASH_REDIS_REST_URL
// env var and the `@upstash/ratelimit` package.

const RATE_LIMIT_MAX    = 5   // requests
const RATE_LIMIT_WINDOW = 60  // seconds

const rateLimitMap = new Map()  // IP → { count, resetAt }

function isRateLimited(ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now >= entry.resetAt) {
    // First request in this window (or window has expired)
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW * 1000 })
    return false
  }

  if (entry.count >= RATE_LIMIT_MAX) return true

  entry.count++
  return false
}

function clientIP(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS_WHITELIST = [
  'https://www.getlecka.com',
  'https://getlecka.com',
  'https://getlecka.myshopify.com',
  'https://www.getlecka.de',
  'https://getlecka.de',
  'https://www.getlecka.dk',
  'https://getlecka.dk',
  'https://www.getlecka.ch',
  'https://getlecka.ch',
]

function applyCORS(req, res) {
  const origin = req.headers?.origin ?? ''
  const allowed =
    CORS_WHITELIST.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin)

  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  applyCORS(req, res)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // Rate limit — 5 requests per IP per 60 s
  if (isRateLimited(clientIP(req))) {
    return res.status(429).json({ success: false, error: 'Too many requests — please wait a minute and try again.' })
  }

  const { email, inputs, targets, selectedProducts, region = 'us', lang = 'en' } = req.body ?? {}

  // ── Input validation ───────────────────────────────────────────────────────
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'A valid email address is required.' })
  }
  if (!inputs || typeof inputs !== 'object') {
    return res.status(400).json({ success: false, error: 'Missing field: inputs' })
  }
  if (!targets || typeof targets !== 'object') {
    return res.status(400).json({ success: false, error: 'Missing field: targets' })
  }
  if (!Array.isArray(selectedProducts) || selectedProducts.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing field: selectedProducts (must be a non-empty array)' })
  }

  // ── Generate PDF ───────────────────────────────────────────────────────────
  let pdfBuffer
  try {
    pdfBuffer = generatePDF(inputs, targets, selectedProducts, region, lang)
  } catch (pdfErr) {
    console.error('[send-plan] PDF generation failed:', pdfErr)
    return res.status(500).json({ success: false, error: 'Failed to generate PDF.' })
  }

  const cartUrl = buildCartURL(selectedProducts, region)

  // ── Send email (priority — failure aborts the request) ────────────────────
  try {
    await sendPlanEmail(email, inputs, targets, selectedProducts, pdfBuffer, cartUrl, region, lang)
  } catch (emailErr) {
    console.error('[send-plan] Email send failed:', emailErr.message)
    console.error('[send-plan] RESEND_API_KEY set:', !!process.env.RESEND_API_KEY)
    return res.status(500).json({ success: false, error: 'Failed to send email. Please try again.' })
  }

  // ── Shopify upsert (non-fatal) ────────────────────────────────────────────
  try {
    await upsertShopifyCustomer(email, inputs, region)
  } catch (shopifyErr) {
    // Log but do not fail — email was already sent successfully
    console.error('[send-plan] Shopify upsert failed (non-fatal):', shopifyErr.message)
  }

  return res.status(200).json({ success: true, message: 'Plan sent!' })
}
