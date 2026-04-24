import regionsConfig from './config/regions.json'

/**
 * src/embed.js — app-side embed utilities
 *
 * Detects whether the planner is running inside a Shopify iframe and
 * provides helpers for communicating back to the parent page.
 *
 * Called by:
 *   - main.jsx  (ResizeObserver setup)
 *   - ResultsPage / EmailCapture (email notification + cart URL)
 */

// ── Embed detection ───────────────────────────────────────────────────────────

/**
 * True when the app is running inside an iframe OR the utm_source param
 * equals 'shopify_embed'. Evaluated once at module load.
 */
export const isEmbedded = (() => {
  try {
    if (window.self !== window.top) return true
  } catch {
    // SecurityError when parent is cross-origin — we're definitely embedded
    return true
  }
  return new URLSearchParams(window.location.search).get('utm_source') === 'shopify_embed'
})()

/**
 * The origin we target for postMessage calls to the parent frame.
 *
 * When running inside an iframe, document.referrer is the URL of the
 * embedding page (e.g. https://getlecka.myshopify.com/...), so we extract
 * its origin and use that as the postMessage target — restricting messages
 * to the actual parent page rather than broadcasting to any origin ('*').
 *
 * Falls back to '*' only when referrer is absent (rare: parent sent
 * Referrer-Policy: no-referrer) or unparseable.
 */
const parentOrigin = (() => {
  try {
    return document.referrer ? new URL(document.referrer).origin : '*'
  } catch {
    return '*'
  }
})()

// ── Parent communication ──────────────────────────────────────────────────────

/**
 * Send the current document scroll height to the parent frame so it can
 * resize the iframe element. Safe to call when not embedded (no-op).
 */
export function notifyResize() {
  if (!isEmbedded) return
  const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 500)
  window.parent.postMessage({ type: 'lecka:resize', height }, parentOrigin)
}

/**
 * Set up all three automatic height-sync triggers:
 *   1. On initial load
 *   2. On window resize
 *   3. Via ResizeObserver when content changes (React step transitions, etc.)
 *
 * Call once at app startup. Safe no-op when not embedded.
 */
export function initHeightSync() {
  if (!isEmbedded) return

  // 1. On initial load
  window.addEventListener('load', notifyResize)

  // 2. On window resize
  window.addEventListener('resize', notifyResize)

  // 3. When content changes dynamically (React state changes, step transitions)
  const ro = new ResizeObserver(notifyResize)
  ro.observe(document.body)
}

/**
 * Notify the parent page that the athlete submitted their email.
 * The parent embed.js fires a DOM CustomEvent + GTM push.
 *
 * @param {string} email
 * @param {string} race_type   — engine key, e.g. 'half_marathon'
 */
export function notifyEmailCapture(email, race_type) {
  if (!isEmbedded) return
  window.parent.postMessage({ type: 'lecka:emailCapture', email, race_type }, parentOrigin)
}

// ── Cart URL helper ───────────────────────────────────────────────────────────

/**
 * For Haravan (VN) storefronts: send cart items to the parent page so that
 * embed.js can add them via the Haravan AJAX cart API (/cart/add.js) and
 * then redirect the parent to /cart?discount=CODE.
 *
 * @param {Array<{id: string, quantity: number}>} items
 * @param {string} discountCode
 */
export function notifyHaravanCart(items, discountCode) {
  if (!isEmbedded) return
  window.parent.postMessage({ type: 'lecka:haravanCart', items, discount: discountCode }, parentOrigin)
}

/**
 * Append utm_source=shopify_embed to a Shopify cart URL when embedded.
 * Pass-through (unchanged) when not embedded.
 *
 * @param {string} url
 * @returns {string}
 */
export function embedCartURL(url) {
  if (!isEmbedded) return url
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', 'shopify_embed')
    return u.toString()
  } catch {
    return url
  }
}

// ── Region detection ──────────────────────────────────────────────────────────

/**
 * Detected region key ('us' | 'de' | 'dk'). Evaluated once at module load.
 * Checks ?region= URL param first, then matches document.referrer hostname
 * against each region's referrer_hosts list. Defaults to 'us'.
 */
export const detectRegion = (() => {
  try {
    const param = new URLSearchParams(window.location.search).get('region')
    if (param && regionsConfig[param]) return param

    if (document.referrer) {
      const hostname = new URL(document.referrer).hostname.toLowerCase()
      for (const [key, config] of Object.entries(regionsConfig)) {
        if (config.referrer_hosts.includes(hostname)) return key
      }
    }
  } catch {
    // ignore parse errors
  }
  return 'us'
})()

/**
 * Returns the region config object for the given region key.
 * Falls back to the 'us' config if the key is not found.
 *
 * @param {string} region — 'us' | 'de' | 'dk'
 * @returns {object}
 */
export function getRegionConfig(region) {
  return regionsConfig[region] ?? regionsConfig['us']
}
