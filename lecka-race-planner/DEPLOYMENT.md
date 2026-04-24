# Deployment Guide

## Overview

**Source of Truth:** `main` branch  
**Live Site:** plan.getlecka.com (Vercel production branch = `main`)

Push to `main` → Vercel auto-deploys within 30–60 seconds. That's it.

---

## Development Workflow

```bash
# 1. Start from main (always up to date)
git checkout main
git pull origin main

# 2. Create a feature branch
git checkout -b feature/your-feature-name

# 3. Make changes, test, commit
git add .
git commit -m "feat: description of changes"
git push -u origin feature/your-feature-name

# 4. Create a PR on GitHub, get review, merge to main

# 5. After merge, clean up
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

---

## Deploy to Live Site

```bash
# Push main — Vercel auto-deploys plan.getlecka.com
git push origin main
```

Vercel will build and deploy in 30–60 seconds. Verify at https://vercel.com/dashboard.

---

## Before Deploying

1. Run locally: `npm run dev` — check for console errors
2. Test the main user flows (form → plan → email)
3. Ensure all changes are committed and pushed to `main`

## After Deploying

1. Check Vercel dashboard — wait for "Ready" status
2. Test on https://plan.getlecka.com — run through the form, generate a plan, send an email

---

## Troubleshooting

**"Permission denied" when pushing** — verify Git credentials and push access.

**Deployment fails in Vercel** — check Vercel build logs; run `npm run build` locally to reproduce.

**Changes on main but not live** — check Vercel dashboard to confirm a build was triggered; wait 60s.

---

**Last Updated:** April 2026  
**Maintained By:** Development Team
