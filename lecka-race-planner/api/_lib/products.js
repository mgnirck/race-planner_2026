/**
 * api/_lib/products.js — product catalog loader
 *
 * Builds the full product catalog in the same shape as src/config/products.json,
 * reconstructed from the database (live prices, variant IDs, regional availability).
 * Falls back to the bundled JSON if the DB is empty or unreachable.
 *
 * Shared by api/products.js (public endpoint) and api/send-plan.js (PDF/email),
 * so server code reads the DB directly instead of calling its own HTTP endpoint.
 */

import { sql } from './db.js'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)
export const FALLBACK_PRODUCTS = _require('../../src/config/products.json')
const staticById = Object.fromEntries(FALLBACK_PRODUCTS.map(p => [p.id, p]))

export async function getProductCatalog() {
  try {
    const { rows } = await sql`
      SELECT
        pc.id, pc.name, pc.type, pc.carbs_per_unit, pc.sodium_per_unit,
        pc.caffeine, pc.caffeine_mg, pc.dual_transporter, pc.net_weight_g,
        pc.sort_order,
        pr.region, pr.available,
        pv.shopify_variant_id, pv.units_per_pack, pv.price,
        pv.sort_order AS variant_sort
      FROM product_catalog pc
      LEFT JOIN product_regions pr ON pr.product_id = pc.id
      LEFT JOIN product_variants pv
        ON pv.product_id = pc.id AND pv.region = pr.region
      ORDER BY pc.sort_order, pr.region, pv.sort_order
    `

    if (rows.length === 0) return FALLBACK_PRODUCTS

    // Merge DB live data (availability, variants) with static metadata from
    // products.json (nutrition facts, lab reports, etc.). Nutrition facts come
    // from products.json, which follows the Lecka product master; the DB copies
    // are only used for products that are not in products.json.
    const productMap = new Map()

    for (const row of rows) {
      if (!productMap.has(row.id)) {
        const staticProduct = staticById[row.id]
        productMap.set(row.id, {
          id: row.id,
          name: row.name,
          type: row.type,
          carbs_per_unit: Number(row.carbs_per_unit),
          sodium_per_unit: Number(row.sodium_per_unit),
          caffeine: row.caffeine,
          caffeine_mg: row.caffeine_mg,
          dual_transporter: row.dual_transporter,
          net_weight_g: row.net_weight_g ? Number(row.net_weight_g) : null,
          ...(staticProduct ?? {}),
          ...(staticProduct ? { name: row.name, type: row.type } : {}),
          regions: {},
        })
      }

      const product = productMap.get(row.id)

      if (row.region) {
        if (!product.regions[row.region]) {
          product.regions[row.region] = { variants: [] }
        }
        if (row.available && row.shopify_variant_id) {
          product.regions[row.region].variants.push({
            shopify_variant_id: row.shopify_variant_id,
            units_per_pack: row.units_per_pack,
            price: Number(row.price),
          })
        }
      }
    }

    // For any product whose DB rows produced no available variants in a region,
    // fall back to the static region data from products.json so those products
    // remain purchasable (e.g. ultra gels not yet in product_regions table).
    for (const product of productMap.values()) {
      const staticRegions = staticById[product.id]?.regions ?? {}
      for (const [region, staticData] of Object.entries(staticRegions)) {
        if (!product.regions[region] || product.regions[region].variants.length === 0) {
          product.regions[region] = staticData
        }
      }
    }

    return [...productMap.values()].sort((a, b) => a.sort_order - b.sort_order)
  } catch (err) {
    console.error('[products] DB error, returning bundled JSON:', err.message)
    return FALLBACK_PRODUCTS
  }
}
