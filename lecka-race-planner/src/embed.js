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

// ── Parent communication ──────────────────────────────────────────────────────

/**
 * Send the current document scroll height to the parent frame so it can
 * resize the iframe element. Safe to call when not embedded (no-op).
 */
export function notifyResize() {
  if (!isEmbedded) return
  const height = Math.max(document.documentElement.scrollHeight, 500)
  window.parent.postMessage({ type: 'lecka:resize', height }, '*')
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
  window.parent.postMessage({ type: 'lecka:emailCapture', email, race_type }, '*')
}

// ── Cart URL helper ───────────────────────────────────────────────────────────

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
