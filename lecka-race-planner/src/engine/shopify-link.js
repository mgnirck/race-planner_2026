import regionsConfig from '../config/regions.json'

/**
 * shopify-link.js
 *
 * Builds a Shopify cart URL for a list of selected products.
 *
 * Export: buildCartURL(selectedProducts, discountCode?) → string
 *
 * Inputs
 * ------
 * selectedProducts : Array returned by selectProducts()
 * discountCode     : string (optional) — applied as ?discount=CODE
 *
 * Returns
 * -------
 * Full URL string, e.g.:
 *   https://www.getlecka.com/cart/shopify_variant_gel_passion_fruit_box12:1,...?discount=RACE10&utm_source=shopify_embed
 *
 * Notes
 * -----
 * - Quantities are in individual units from the selector.
 * - If the same variant appears in multiple entries (e.g. bar before + bar after),
 *   quantities are summed so each variant appears once in the URL.
 * - Fractional boxes are rounded up: 13 individual units → 2 boxes of 12.
 * - Variant ID validation: expects numeric Shopify variant IDs (e.g. "43249546526767").
 *   Non-numeric IDs trigger a console.warn and are skipped from the cart URL.
 *   Ensure all products in products.json have real numeric variant IDs.
 */

/**
 * @param {Array}  selectedProducts  — output of selectProducts()
 * @param {string} [discountCode]    — applied as ?discount=CODE
 * @param {string} [utmSource]       — appended as &utm_source=VALUE when set
 * @param {string} [region]          — region key ('us' | 'de' | 'dk'), defaults to 'us'
 * @returns {string}
 *
 * Variant ID validation: logs console.warn and skips any product with non-numeric
 * shopify_variant_id. This guards against stale placeholder IDs in products.json.
 */
export function buildCartURL(selectedProducts, discountCode = '', utmSource = '', region = 'us') {
  const storeUrl = regionsConfig[region]?.store_url ?? regionsConfig['us'].store_url

  if (!selectedProducts || selectedProducts.length === 0) {
    return storeUrl
  }

  // Aggregate unit quantities by variant ID, validating each variant
  const variantTotals = {}
  for (const item of selectedProducts) {
    const vid = item.product.regions?.[region]?.shopify_variant_id
                ?? item.product.shopify_variant_id

    // Validate: variant ID should be a numeric string
    if (!/^\d+$/.test(vid)) {
      console.warn(
        `[Lecka] Invalid Shopify variant ID for "${item.product.name}": "${vid}" — ` +
        `expected numeric ID. Skipping from cart URL. ` +
        `Update shopify_variant_id in products.json with real numeric ID from Shopify Admin.`
      )
      continue
    }

    variantTotals[vid] = (variantTotals[vid] || 0) + item.quantity
  }

  // Convert individual units → boxes, rounding up
  const cartItems = Object.entries(variantTotals)
    .map(([vid, units]) => {
      const product = selectedProducts.find(i => i.product.shopify_variant_id === vid)?.product
      const perBox  = product?.units_per_box ?? 1
      const boxes   = Math.ceil(units / perBox)
      return `${vid}:${boxes}`
    })
    .join(',')

  const params = []
  if (discountCode) params.push(`discount=${encodeURIComponent(discountCode)}`)
  if (utmSource)    params.push(`utm_source=${encodeURIComponent(utmSource)}`)

  const base = `${storeUrl}/cart/${cartItems}`
  return params.length ? `${base}?${params.join('&')}` : base
}
