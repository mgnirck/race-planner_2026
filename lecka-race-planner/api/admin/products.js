/**
 * api/admin/products.js — all admin product CRUD operations
 *
 * GET  /api/admin/products            → full catalog with regions + variants
 * GET  /api/admin/products?op=audit   → audit log (last 100, ?offset=N for pagination)
 * PATCH  ?op=availability             → toggle product availability for a region
 * PATCH  ?op=variant                  → update a variant's price or shopify_variant_id
 * POST   ?op=variant                  → add a new variant
 * DELETE ?op=variant                  → remove a variant
 * POST   ?op=seed                     → re-seed product_catalog from bundled products.json
 *
 * Auth: X-Admin-Password header on all requests.
 */

import { sql, ensureMigrated } from '../db.js'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)
const PRODUCTS_JSON = _require('../../src/config/products.json')
const REGIONS_JSON  = _require('../../src/config/regions.json')

const PRODUCT_REGIONS = ['us', 'de', 'dk', 'ch', 'vn']

function checkAuth(req) {
  const adminPassword = process.env.VITE_ADMIN_PASSWORD
  const provided = req.headers['x-admin-password'] ?? ''
  return !!(adminPassword && provided === adminPassword)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' })

  try { await ensureMigrated() } catch (e) { console.error('[admin/products] migrate:', e) }

  const op = req.query?.op ?? null
  const method = req.method

  try {
    if (method === 'GET' && !op)              return getCatalog(req, res)
    if (method === 'GET' && op === 'audit')   return getAudit(req, res)
    if (method === 'PATCH' && op === 'availability') return patchAvailability(req, res)
    if (method === 'PATCH' && op === 'variant')      return patchVariant(req, res)
    if (method === 'POST'  && op === 'variant')      return addVariant(req, res)
    if (method === 'DELETE' && op === 'variant')     return deleteVariant(req, res)
    if (method === 'POST'  && op === 'seed')         return seedProducts(req, res)
    return res.status(400).json({ error: 'Unknown operation' })
  } catch (err) {
    console.error('[admin/products] unhandled error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ── GET catalog ────────────────────────────────────────────────────────────────

async function getCatalog(req, res) {
  const { rows } = await sql`
    SELECT
      pc.id, pc.name, pc.type, pc.carbs_per_unit, pc.sodium_per_unit,
      pc.caffeine, pc.caffeine_mg, pc.dual_transporter, pc.net_weight_g,
      pc.sort_order,
      json_agg(
        json_build_object(
          'region', pr.region,
          'available', pr.available,
          'variants', (
            SELECT json_agg(
              json_build_object(
                'id', pv.id,
                'shopify_variant_id', pv.shopify_variant_id,
                'units_per_pack', pv.units_per_pack,
                'price', pv.price,
                'sort_order', pv.sort_order
              ) ORDER BY pv.sort_order
            )
            FROM product_variants pv
            WHERE pv.product_id = pc.id AND pv.region = pr.region
          )
        ) ORDER BY pr.region
      ) AS regions
    FROM product_catalog pc
    LEFT JOIN product_regions pr ON pr.product_id = pc.id
    GROUP BY pc.id, pc.name, pc.type, pc.carbs_per_unit, pc.sodium_per_unit,
      pc.caffeine, pc.caffeine_mg, pc.dual_transporter, pc.net_weight_g, pc.sort_order
    ORDER BY pc.sort_order
  `
  return res.status(200).json(rows)
}

// ── GET audit log ──────────────────────────────────────────────────────────────

async function getAudit(req, res) {
  const offset = Math.max(0, parseInt(req.query?.offset ?? '0', 10) || 0)
  const { rows } = await sql`
    SELECT * FROM product_audit
    ORDER BY changed_at DESC
    LIMIT 100 OFFSET ${offset}
  `
  return res.status(200).json(rows)
}

// ── PATCH availability ─────────────────────────────────────────────────────────

async function patchAvailability(req, res) {
  const { product_id, region, available } = req.body ?? {}
  if (!product_id || !region || typeof available !== 'boolean') {
    return res.status(400).json({ error: 'product_id, region, and available (boolean) are required' })
  }

  const { rows: cur } = await sql`
    SELECT available FROM product_regions
    WHERE product_id = ${product_id} AND region = ${region} LIMIT 1
  `
  if (cur.length === 0) return res.status(404).json({ error: 'Product region not found' })
  const oldValue = cur[0].available?.toString() ?? null

  await sql`
    UPDATE product_regions SET available = ${available}, updated_at = NOW()
    WHERE product_id = ${product_id} AND region = ${region}
  `
  await sql`
    INSERT INTO product_audit (product_id, region, field_changed, old_value, new_value)
    VALUES (${product_id}, ${region}, 'available', ${oldValue}, ${available.toString()})
  `
  return res.status(200).json({ ok: true })
}

// ── PATCH variant field ────────────────────────────────────────────────────────

async function patchVariant(req, res) {
  const { variant_id, field, value } = req.body ?? {}

  const ALLOWED = ['price', 'shopify_variant_id']
  if (!variant_id || !field || !ALLOWED.includes(field)) {
    return res.status(400).json({ error: 'variant_id and field (price|shopify_variant_id) required' })
  }

  if (field === 'price') {
    if (typeof value !== 'number' || value <= 0) {
      return res.status(400).json({ error: 'price must be a positive number' })
    }
  } else {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      return res.status(400).json({ error: 'shopify_variant_id must be a numeric string' })
    }
  }

  const { rows: cur } = await sql`
    SELECT product_id, region, price, shopify_variant_id
    FROM product_variants WHERE id = ${variant_id} LIMIT 1
  `
  if (cur.length === 0) return res.status(404).json({ error: 'Variant not found' })
  const v = cur[0]
  const oldValue = v[field]?.toString() ?? null

  if (field === 'price') {
    await sql`UPDATE product_variants SET price = ${value}, updated_at = NOW() WHERE id = ${variant_id}`
  } else {
    await sql`UPDATE product_variants SET shopify_variant_id = ${value}, updated_at = NOW() WHERE id = ${variant_id}`
  }

  await sql`
    INSERT INTO product_audit (product_id, region, field_changed, old_value, new_value)
    VALUES (${v.product_id}, ${v.region}, ${field}, ${oldValue}, ${value.toString()})
  `
  return res.status(200).json({ ok: true, updated: { variant_id, field, value } })
}

// ── POST add variant ───────────────────────────────────────────────────────────

async function addVariant(req, res) {
  const { product_id, region, shopify_variant_id, units_per_pack, price } = req.body ?? {}

  if (!product_id || !region || !shopify_variant_id || !units_per_pack || price == null) {
    return res.status(400).json({ error: 'product_id, region, shopify_variant_id, units_per_pack, price required' })
  }
  if (!/^\d+$/.test(String(shopify_variant_id))) {
    return res.status(400).json({ error: 'shopify_variant_id must be numeric' })
  }
  if (typeof price !== 'number' || price <= 0) {
    return res.status(400).json({ error: 'price must be a positive number' })
  }
  if (!Number.isInteger(units_per_pack) || units_per_pack <= 0) {
    return res.status(400).json({ error: 'units_per_pack must be a positive integer' })
  }

  const { rows: cntRows } = await sql`
    SELECT COUNT(*)::int AS count FROM product_variants
    WHERE product_id = ${product_id} AND region = ${region}
  `
  const sortOrder = cntRows[0].count

  const { rows: newV } = await sql`
    INSERT INTO product_variants
      (product_id, region, shopify_variant_id, units_per_pack, price, sort_order)
    VALUES (${product_id}, ${region}, ${String(shopify_variant_id)}, ${units_per_pack}, ${price}, ${sortOrder})
    RETURNING *
  `
  await sql`
    INSERT INTO product_audit (product_id, region, field_changed, old_value, new_value)
    VALUES (${product_id}, ${region}, 'variant_added', null,
      ${JSON.stringify({ shopify_variant_id, units_per_pack, price })})
  `
  return res.status(200).json({ ok: true, variant: newV[0] })
}

// ── DELETE variant ─────────────────────────────────────────────────────────────

async function deleteVariant(req, res) {
  const { variant_id } = req.body ?? {}
  if (!variant_id) return res.status(400).json({ error: 'variant_id required' })

  const { rows: varRows } = await sql`
    SELECT * FROM product_variants WHERE id = ${variant_id} LIMIT 1
  `
  if (varRows.length === 0) return res.status(404).json({ error: 'Variant not found' })
  const v = varRows[0]

  // Guard: don't orphan an available region
  const { rows: countRows } = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM product_variants
       WHERE product_id = ${v.product_id} AND region = ${v.region}) AS variant_count,
      pr.available
    FROM product_regions pr
    WHERE pr.product_id = ${v.product_id} AND pr.region = ${v.region}
  `
  if (countRows[0]?.variant_count <= 1 && countRows[0]?.available) {
    return res.status(400).json({
      error: 'Cannot delete the last variant for an available product in this region. Set availability to false first.',
    })
  }

  await sql`DELETE FROM product_variants WHERE id = ${variant_id}`
  await sql`
    INSERT INTO product_audit (product_id, region, field_changed, old_value, new_value)
    VALUES (${v.product_id}, ${v.region}, 'variant_deleted', ${JSON.stringify(v)}, null)
  `
  return res.status(200).json({ ok: true })
}

// ── POST seed from products.json ───────────────────────────────────────────────

async function seedProducts(req, res) {
  let inserted = 0

  for (let i = 0; i < PRODUCTS_JSON.length; i++) {
    const p = PRODUCTS_JSON[i]

    await sql`
      INSERT INTO product_catalog
        (id, name, type, carbs_per_unit, sodium_per_unit, caffeine, caffeine_mg,
         dual_transporter, net_weight_g, ideal_time, sort_order)
      VALUES (
        ${p.id}, ${p.name}, ${p.type},
        ${p.carbs_per_unit ?? null}, ${p.sodium_per_unit ?? null},
        ${p.caffeine ?? false}, ${p.caffeine_mg ?? 0},
        ${p.dual_transporter ?? false}, ${p.net_weight_g ?? null},
        ${p.ideal_time ?? null}, ${i}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type,
        carbs_per_unit = EXCLUDED.carbs_per_unit,
        sodium_per_unit = EXCLUDED.sodium_per_unit,
        caffeine = EXCLUDED.caffeine, caffeine_mg = EXCLUDED.caffeine_mg,
        dual_transporter = EXCLUDED.dual_transporter,
        net_weight_g = EXCLUDED.net_weight_g,
        ideal_time = EXCLUDED.ideal_time,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
    `

    for (const region of PRODUCT_REGIONS) {
      const variants = p.regions?.[region]?.variants ?? []
      const available = variants.length > 0

      await sql`
        INSERT INTO product_regions (product_id, region, available)
        VALUES (${p.id}, ${region}, ${available})
        ON CONFLICT (product_id, region) DO UPDATE SET
          available = EXCLUDED.available, updated_at = NOW()
      `

      // Re-seed variants: delete existing then re-insert
      await sql`DELETE FROM product_variants WHERE product_id = ${p.id} AND region = ${region}`
      for (let j = 0; j < variants.length; j++) {
        const v = variants[j]
        await sql`
          INSERT INTO product_variants
            (product_id, region, shopify_variant_id, units_per_pack, price, sort_order)
          VALUES (${p.id}, ${region}, ${v.shopify_variant_id}, ${v.units_per_pack}, ${v.price}, ${j})
        `
      }
    }

    inserted++
  }

  return res.status(200).json({ ok: true, inserted })
}
