# Lecka Race Nutrition Planner — Shopify Embed Instructions

Add the planner to any Shopify page in under 5 minutes using a **Custom HTML** section.

---

## Step 1 — Deploy the planner to Vercel

```bash
cd lecka-race-planner
npx vercel --prod
```

Note the deployment URL, e.g. `https://lecka-race-planner.vercel.app`.  
If you have a custom domain point it at the deployment (e.g. `plan.getlecka.com`).

Set these environment variables in the Vercel dashboard before deploying:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | Your Resend API key |
| `SHOPIFY_ACCESS_TOKEN` | Shopify Admin API token |
| `SHOPIFY_STORE_URL` | `getlecka.myshopify.com` |
| `VITE_ADMIN_PASSWORD` | Password for /admin stats page |

---

## Step 2 — Add a Custom HTML section in Shopify

1. Go to **Online Store → Pages** (or **Themes → Customize** for a section on the home page).
2. Click **Add section → Custom HTML**.
3. Paste the universal snippet below.

```html
<!-- Lecka Race Nutrition Planner — universal embed -->
<!-- Works for all regions. Athletes select their region and language
     within the planner. No per-market configuration needed. -->
<script src="https://plan.getlecka.com/embed.js"></script>
<div style="width:100%; overflow:hidden;">
  <iframe
    data-lecka
    src="https://plan.getlecka.com/"
    width="100%"
    height="700"
    frameborder="0"
    scrolling="no"
    title="Lecka Race Nutrition Planner"
    style="display:block; border:none; width:100%; min-height:600px;"
  ></iframe>
</div>
```

4. Click **Save**.

The `embed.js` script will:
- Auto-resize the iframe height to match the planner content (no scrollbars)
- Add `utm_source=shopify_embed` to all Shopify cart links the planner generates
- Fire a `lecka:emailCapture` DOM event and GTM `dataLayer` push when an athlete submits their email

---

## Language and region

The planner defaults to English. Athletes can select their language using the language switcher visible in the planner header. They can select their region (for local pricing and store links) on the results page. No embed configuration is required for either — these are athlete-facing choices.

---

## Step 3 — Optional: Listen for the email capture event

Add this snippet to your Shopify theme or a Custom HTML block to hook into the email event:

```html
<script>
  document.addEventListener('lecka:emailCapture', function (e) {
    console.log('[Lecka] Email captured for', e.detail.race_type);
    // e.g. trigger a Klaviyo or Mailchimp subscribe call here
  });
</script>
```

---

## Step 4 — Optional: Haravan cart handler (Vietnam)

For Vietnamese storefronts using Haravan, listen for the cart event to add products directly to the Haravan cart:

```html
<script>
  document.addEventListener('lecka:haravanCart', function (e) {
    // e.detail.items — array of { id, quantity }
    // e.detail.discount — discount code string
    // Add your Haravan cart logic here
  });
</script>
```

---

## Step 5 — Check admin stats

Visit `https://YOUR_VERCEL_URL/admin` and enter your `VITE_ADMIN_PASSWORD` to see:
- Total plans generated this month
- Most popular race type

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Iframe shows "Refused to display in a frame" | Make sure the Shopify page domain is listed in `vercel.json` → `frame-ancestors` |
| Cart links open inside the iframe | This is expected — `embed.js` does not intercept navigation, only the height and email events |
| Height doesn't auto-adjust | Confirm `embed.js` loaded before the iframe (check browser console for errors) |
| Email not sending | Verify `RESEND_API_KEY` is set in Vercel and the from address `info@getlecka.com` is verified in your Resend account |
