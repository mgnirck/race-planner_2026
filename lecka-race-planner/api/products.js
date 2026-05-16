/**
 * api/products.js — public product catalog
 *
 * Returns the full product catalog in the same shape as src/config/products.json,
 * reconstructed from the database (live prices, variant IDs, regional availability).
 * Falls back to the bundled JSON if the DB is empty or unreachable.
 *
 * Cache-Control: public, max-age=300 (5 min) — changes infrequently.
 */

import { sql } from './db.js'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)
const FALLBACK_PRODUCTS = _require('../src/config/products.json')
const staticById = Object.fromEntries(FALLBACK_PRODUCTS.map(p => [p.id, p]))

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  res.setHeader('Cache-Control', 'public, max-age=300')

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

    if (rows.length === 0) {
      return res.status(200).json(FALLBACK_PRODUCTS)
    }

    // Merge DB live data (availability, variants) with static metadata from
    // products.json (nutrition facts, lab reports, etc. not stored in DB).
    const productMap = new Map()

    for (const row of rows) {
      if (!productMap.has(row.id)) {
        productMap.set(row.id, {
          ...(staticById[row.id] ?? {}),
          id: row.id,
          name: row.name,
          type: row.type,
          carbs_per_unit: Number(row.carbs_per_unit),
          sodium_per_unit: Number(row.sodium_per_unit),
          caffeine: row.caffeine,
          caffeine_mg: row.caffeine_mg,
          dual_transporter: row.dual_transporter,
          net_weight_g: row.net_weight_g ? Number(row.net_weight_g) : null,
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

    const products = [...productMap.values()].sort((a, b) => a.sort_order - b.sort_order)
    return res.status(200).json(products)
  } catch (err) {
    console.error('[products] DB error, returning bundled JSON:', err.message)
    return res.status(200).json(FALLBACK_PRODUCTS)
  }
}
