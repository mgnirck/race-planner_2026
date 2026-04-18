import regionsConfig    from '../config/regions.json'
import { computeCartItems } from './region-utils.js'

/**
 * Builds a Shopify cart URL directly from an already-aggregated product list.
 * Each row must have a `cartItems` array of { shopify_variant_id, quantity } objects.
 * This is the preferred path when variety-pack optimisation has already been applied.
 *
 * @param {Array}  aggregated     — output of aggregateByProduct() (or computeOptimalGelCart)
 * @param {string} [discountCode]
 * @param {string} [utmSource]
 * @param {string} [region]
 * @returns {string}
 */
export function buildCartURLFromAggregated(aggregated, discountCode = '', utmSource = '', region = 'us') {
  const storeUrl = regionsConfig[region]?.store_url ?? regionsConfig['us'].store_url

  const variantTotals = {}
  for (const row of aggregated) {
    for (const item of row.cartItems) {
      const vid = String(item.shopify_variant_id)
      if (!/^\d+$/.test(vid)) {
        console.warn(`[Lecka] Non-numeric variant ID "${vid}" for "${row.product?.name}" — skipping`)
        continue
      }
      variantTotals[vid] = (variantTotals[vid] || 0) + item.quantity
    }
  }

  const cartItems = Object.entries(variantTotals).map(([vid, qty]) => `${vid}:${qty}`).join(',')
  if (!cartItems) return storeUrl

  const params = []
  if (discountCode) params.push(`discount=${encodeURIComponent(discountCode)}`)
  if (utmSource)    params.push(`utm_source=${encodeURIComponent(utmSource)}`)

  const base = `${storeUrl}/cart/${cartItems}`
  return params.length ? `${base}?${params.join('&')}` : base
}

/**
 * shopify-link.js
 *
 * Builds a Shopify cart URL for a list of selected products.
 *
 * Export: buildCartURL(selectedProducts, discountCode?, utmSource?, region?) → string
 *
 * Uses the greedy pack-fill algorithm from region-utils so that multi-pack
 * regions (e.g. DE 12-pack + single unit) are handled correctly.
 */

/**
 * @param {Array}  selectedProducts  — output of selectProducts()
 * @param {string} [discountCode]    — applied as ?discount=CODE
 * @param {string} [utmSource]       — appended as &utm_source=VALUE when set
 * @param {string} [region]          — region key ('us' | 'de' | 'dk'), defaults to 'us'
 * @returns {string}
 */
export function buildCartURL(selectedProducts, discountCode = '', utmSource = '', region = 'us') {
  const storeUrl = regionsConfig[region]?.store_url ?? regionsConfig['us'].store_url

  if (!selectedProducts || selectedProducts.length === 0) {
    return storeUrl
  }

  // Accumulate total units per product, then resolve to cart line items
  const unitsByProductId = {}
  const productById = {}

  for (const item of selectedProducts) {
    const pid = item.product.id
    unitsByProductId[pid] = (unitsByProductId[pid] || 0) + item.quantity
    productById[pid] = item.product
  }

  // Resolve each product to variant line items using greedy pack-fill
  const variantTotals = {}
  for (const [pid, totalUnits] of Object.entries(unitsByProductId)) {
    const product = productById[pid]
    const lines = computeCartItems(product, region, totalUnits)

    for (const line of lines) {
      const vid = line.shopify_variant_id
      if (!/^\d+$/.test(vid)) {
        console.warn(
          `[Lecka] Invalid Shopify variant ID for "${product.name}": "${vid}" — ` +
          `expected numeric ID. Skipping from cart URL.`
        )
        continue
      }
      variantTotals[vid] = (variantTotals[vid] || 0) + line.quantity
    }
  }

  const cartItems = Object.entries(variantTotals)
    .map(([vid, qty]) => `${vid}:${qty}`)
    .join(',')

  if (!cartItems) return storeUrl

  const params = []
  if (discountCode) params.push(`discount=${encodeURIComponent(discountCode)}`)
  if (utmSource)    params.push(`utm_source=${encodeURIComponent(utmSource)}`)

  const base = `${storeUrl}/cart/${cartItems}`
  return params.length ? `${base}?${params.join('&')}` : base
}
