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
 *   https://www.getlecka.com/cart/shopify_variant_gel_passion_fruit_box12:1,shopify_variant_bar_mango_coconut_box12:2
 *
 * Notes
 * -----
 * - Quantities are in individual units from the selector.
 * - If the same variant appears in multiple entries (e.g. bar before + bar after),
 *   quantities are summed so each variant appears once in the URL.
 * - Fractional boxes are rounded up: 13 individual units → 2 boxes of 12.
 * - The Shopify variant IDs in products.json are currently placeholder strings.
 *   Replace them with real numeric Shopify variant IDs before going live.
 */

const STORE_URL = 'https://www.getlecka.com'

export function buildCartURL(selectedProducts, discountCode = '') {
  if (!selectedProducts || selectedProducts.length === 0) {
    return STORE_URL
  }

  // Aggregate unit quantities by variant ID
  const variantTotals = {}
  for (const item of selectedProducts) {
    const vid = item.product.shopify_variant_id
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

  const base = `${STORE_URL}/cart/${cartItems}`
  return discountCode
    ? `${base}?discount=${encodeURIComponent(discountCode)}`
    : base
}
