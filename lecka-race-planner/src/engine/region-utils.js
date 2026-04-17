/**
 * region-utils.js
 *
 * Shared helpers for region-aware product logic.
 * All cart/price computation should go through these functions so that
 * multi-pack architectures (e.g. DE 12-pack + single unit) are handled
 * consistently across product-selector, shopify-link, ResultsPage, and
 * the send-plan serverless function.
 */

/**
 * Returns the variants array for a product in the given region.
 * Falls back to US if the region is unknown.
 * @param {object} product
 * @param {string} region  e.g. 'us' | 'de' | 'dk'
 * @returns {Array<{shopify_variant_id: string, units_per_pack: number, price: number}>}
 */
export function getRegionVariants(product, region) {
  return product.regions?.[region]?.variants ?? product.regions?.['us']?.variants ?? []
}

/**
 * Returns true when the product has at least one variant in the given region.
 * @param {object} product
 * @param {string} region
 * @returns {boolean}
 */
export function isAvailableInRegion(product, region) {
  return getRegionVariants(product, region).length > 0
}

/**
 * Greedy pack-fill algorithm.
 * Given the variants available for a region (sorted largest-pack-first),
 * returns the minimal-cost list of {shopify_variant_id, quantity} line items
 * that cover `totalUnits` units exactly.
 *
 * Strategy:
 *   1. Sort variants by units_per_pack descending.
 *   2. Fill as many large packs as possible without overshooting.
 *   3. For the remainder use the smallest pack (single unit if available,
 *      otherwise the next pack that covers the remainder).
 *
 * @param {object} product
 * @param {string} region
 * @param {number} totalUnits  how many individual units are needed
 * @returns {Array<{shopify_variant_id: string, units_per_pack: number, price: number, quantity: number}>}
 */
export function computeCartItems(product, region, totalUnits) {
  const variants = getRegionVariants(product, region)
  if (!variants.length || totalUnits <= 0) return []

  // Sort largest pack first
  const sorted = [...variants].sort((a, b) => b.units_per_pack - a.units_per_pack)
  const smallest = sorted[sorted.length - 1]

  const lines = []
  let remaining = totalUnits

  for (const variant of sorted) {
    if (remaining <= 0) break
    // Only use this pack size if it's not the smallest, or if it's the only option
    if (variant.units_per_pack === smallest.units_per_pack && sorted.length > 1) continue
    const count = Math.floor(remaining / variant.units_per_pack)
    if (count > 0) {
      lines.push({ ...variant, quantity: count })
      remaining -= count * variant.units_per_pack
    }
  }

  // Fill remainder with smallest pack
  if (remaining > 0) {
    const packsNeeded = Math.ceil(remaining / smallest.units_per_pack)
    const existing = lines.find(l => l.shopify_variant_id === smallest.shopify_variant_id)
    if (existing) {
      existing.quantity += packsNeeded
    } else {
      lines.push({ ...smallest, quantity: packsNeeded })
    }
  }

  return lines
}

/**
 * Returns the total price for `totalUnits` of a product in the given region,
 * using the greedy pack-fill algorithm.
 * @param {object} product
 * @param {string} region
 * @param {number} totalUnits
 * @returns {number}
 */
export function computeLinePrice(product, region, totalUnits) {
  const items = computeCartItems(product, region, totalUnits)
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

/**
 * Returns the per-unit display price for a product in a given region.
 * Uses the single-unit variant if available, otherwise divides the
 * smallest-pack price by its units_per_pack.
 * @param {object} product
 * @param {string} region
 * @returns {number}
 */
export function getUnitPrice(product, region) {
  const variants = getRegionVariants(product, region)
  if (!variants.length) return product.price_usd
  const singleUnit = variants.find(v => v.units_per_pack === 1)
  if (singleUnit) return singleUnit.price
  const sorted = [...variants].sort((a, b) => a.units_per_pack - b.units_per_pack)
  return sorted[0].price / sorted[0].units_per_pack
}
