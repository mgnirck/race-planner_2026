#!/usr/bin/env node
/**
 * scripts/check-variants.mjs — verify products.json against the live Shopify stores.
 *
 * Usage:  node scripts/check-variants.mjs
 *
 * For every Shopify region in src/config/regions.json, fetches the store's public
 * /products.json and checks each variant in src/config/products.json:
 *   DEAD     — variant ID does not exist on the store (cart link would fail)
 *   SOLDOUT  — variant exists but is not available
 *   PRICE    — planner price differs from store price
 *
 * Exits with code 1 if any DEAD variant is found. No dependencies (Node 18+ fetch).
 * Stores that don't expose /products.json (e.g. password-protected) are skipped.
 */
import { readFileSync } from 'node:fs'

const products = JSON.parse(readFileSync(new URL('../src/config/products.json', import.meta.url)))
const regions  = JSON.parse(readFileSync(new URL('../src/config/regions.json',  import.meta.url)))

async function fetchStore(storeUrl) {
  const variants = new Map()
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(`${storeUrl}/products.json?limit=250&page=${page}`, {
      headers: { 'User-Agent': 'LeckaVariantCheck/1.0 (info@getlecka.com)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { products: list } = await res.json()
    if (!list?.length) break
    for (const p of list) for (const v of p.variants) {
      variants.set(String(v.id), { title: `${p.title} / ${v.title}`, price: Number(v.price), available: v.available })
    }
  }
  return variants
}

let dead = 0, warnings = 0
for (const [region, cfg] of Object.entries(regions)) {
  if (cfg.type !== 'shopify') continue
  let live
  try { live = await fetchStore(cfg.store_url) }
  catch (err) { console.log(`SKIP     ${region}  ${cfg.store_url} (${err.message})`); continue }

  for (const p of products) {
    for (const v of p.regions?.[region]?.variants ?? []) {
      const vid = String(v.shopify_variant_id ?? '')
      const hit = live.get(vid)
      if (!hit) { dead++; console.log(`DEAD     ${region}  ${p.id}  ${vid} (${v.units_per_pack}-pack)`); continue }
      if (!hit.available) { warnings++; console.log(`SOLDOUT  ${region}  ${p.id}  ${hit.title}`) }
      if (Math.abs(hit.price - Number(v.price)) > 0.01) {
        warnings++; console.log(`PRICE    ${region}  ${p.id}  ${v.units_per_pack}-pack  planner ${v.price} / store ${hit.price}`)
      }
    }
  }
  console.log(`OK       ${region}  ${live.size} store variants checked`)
}

console.log(`\n${dead} dead variant(s), ${warnings} warning(s)`)
process.exit(dead > 0 ? 1 : 0)
