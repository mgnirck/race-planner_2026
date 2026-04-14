/**
 * Lecka Race Planner — Shopify embed helper
 * ==========================================
 * Include this script ONCE on any Shopify page that hosts the planner iframe.
 *
 * <script src="https://YOUR_VERCEL_URL/embed.js"></script>
 * <iframe data-lecka src="https://YOUR_VERCEL_URL/?utm_source=shopify_embed"
 *         width="100%" height="600" frameborder="0" scrolling="no"></iframe>
 *
 * What this script does
 * ---------------------
 * 1. Auto-sizes every iframe[data-lecka] to match the planner's content height,
 *    eliminating scrollbars inside the embed.
 * 2. Injects utm_source=shopify_embed into any iframe[data-lecka] src that
 *    doesn't already carry a utm_source parameter.
 * 3. Listens for postMessage events from the planner:
 *    - lecka:resize       → updates iframe height
 *    - lecka:emailCapture → fires a DOM CustomEvent + pushes to GTM dataLayer
 */

(function (win, doc) {
  'use strict';

  // ── Origin safety check ─────────────────────────────────────────────────────
  // Accept messages from any *.vercel.app subdomain OR the live Lecka domain.
  // Adjust ALLOWED_ORIGINS after you set a custom domain.
  var ALLOWED_ORIGINS = [
    'https://www.getlecka.com',
    'https://getlecka.com',
  ];

  function isAllowed(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return true;
    // Accept any Vercel preview URL during staging
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
    return false;
  }

  // ── Inject utm_source into every matching iframe ────────────────────────────
  function injectUTM() {
    doc.querySelectorAll('iframe[data-lecka]').forEach(function (el) {
      if (!el.src) return;
      try {
        var url = new URL(el.src);
        if (!url.searchParams.get('utm_source')) {
          url.searchParams.set('utm_source', 'shopify_embed');
          el.src = url.toString();
        }
      } catch (_) { /* malformed URL — leave untouched */ }
    });
  }

  // ── Auto-resize a single iframe ─────────────────────────────────────────────
  function resizeAll(height) {
    var px = Math.max(height, 400) + 'px';
    doc.querySelectorAll('iframe[data-lecka]').forEach(function (el) {
      el.style.height = px;
    });
  }

  // ── Message handler ─────────────────────────────────────────────────────────
  function onMessage(event) {
    if (!isAllowed(event.origin)) return;

    var data = event.data;
    if (!data || typeof data.type !== 'string') return;

    switch (data.type) {

      case 'lecka:resize':
        if (typeof data.height === 'number') resizeAll(data.height);
        break;

      case 'lecka:emailCapture':
        // Fire a DOM event so Shopify scripts or tag managers can listen
        try {
          doc.dispatchEvent(new CustomEvent('lecka:emailCapture', {
            bubbles: true,
            detail: {
              email:     data.email     || '',
              race_type: data.race_type || '',
            },
          }));
        } catch (_) { /* IE11 fallback — CustomEvent not critical */ }

        // Google Tag Manager / GA4 dataLayer push
        if (win.dataLayer && Array.isArray(win.dataLayer)) {
          win.dataLayer.push({
            event:            'lecka_email_capture',
            lecka_race_type:  data.race_type || '',
          });
        }
        break;
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  win.addEventListener('message', onMessage);

  // Run UTM injection immediately, and again after DOM is fully loaded
  // (in case the script is in <head> and iframes haven't parsed yet)
  injectUTM();
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', injectUTM);
  }

}(window, document));
