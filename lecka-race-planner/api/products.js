/**
 * api/products.js — public product catalog
 *
 * Returns the full product catalog in the same shape as src/config/products.json,
 * reconstructed from the database (live prices, variant IDs, regional availability).
 * Falls back to the bundled JSON if the DB is empty or unreachable.
 * See api/_lib/products.js.
 *
 * Cache-Control: public, max-age=300 (5 min) — changes infrequently.
 */

import { createRequire } from 'module'
import { getProductCatalog } from './_lib/products.js'

const _require = createRequire(import.meta.url)
const REGIONS = _require('../src/config/regions.json')

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.url?.includes('/api/regions')) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    return res.status(200).json(REGIONS)
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  res.setHeader('Cache-Control', 'public, max-age=300')

  return res.status(200).json(await getProductCatalog())
}
