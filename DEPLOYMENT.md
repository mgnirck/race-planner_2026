# Deployment Guide

## Overview

**Source of Truth:** `main` branch  
**Live Site:** plan.getlecka.com (deployed from `claude/setup-lecka-planner-e7kO0`)

All development happens on `main`. When ready to deploy, a single command syncs the code to the deployment branch, and Vercel auto-deploys within 30-60 seconds.

---

## Deployment Workflow

### For Daily Development

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

# 4. Create a PR on GitHub for review
#    (request review from team, ensure tests pass)

# 5. Merge to main (via GitHub UI or CLI)
git checkout main
git pull origin main
git merge feature/your-feature-name
git push origin main

# 6. Delete the feature branch (keep repo clean)
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

### Deploy to Live Site

```bash
# When main is ready for production, sync to deployment branch
git push origin main:claude/setup-lecka-planner-e7kO0

# Done! Vercel will:
# 1. See the push to claude/setup-lecka-planner-e7kO0
# 2. Build your code
# 3. Deploy to plan.getlecka.com in 30-60 seconds
# 4. You can verify at https://vercel.com/dashboard
```

---

## Important Notes

### Before Deploying

1. **Pull latest from main** to avoid out-of-sync issues:
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Test thoroughly** before pushing the sync command
   - Run locally: `npm run dev`
   - Check for console errors
   - Test the main user flows

3. **Verify on main branch** that all changes are committed and pushed

### After Deploying

1. **Check Vercel dashboard** (https://vercel.com/dashboard)
   - Wait for "Ready" status
   - Verify deployment is from `claude/setup-lecka-planner-e7kO0`

2. **Test on live site** (https://plan.getlecka.com)
   - Go through the form
   - Generate a plan
   - Send an email to verify PDF works

---

## Branch Structure

```
main
  ├── Source of truth for all code
  ├── All PRs merge here
  └── Syncs to claude/setup-lecka-planner-e7kO0 for deployment

claude/setup-lecka-planner-e7kO0
  ├── Deployment branch (Vercel watches this)
  ├── Kept in sync with main via: git push origin main:claude/setup-lecka-planner-e7kO0
  └── Do NOT commit directly here
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start developing | `git checkout main && git pull origin main` |
| Create feature | `git checkout -b feature/name` |
| Deploy to live | `git push origin main:claude/setup-lecka-planner-e7kO0` |
| Sync before deploy | `git checkout main && git pull origin main` |
| Clean up branches | `git branch -d branch-name` |

---

## Troubleshooting

### "Permission denied" when pushing
- Verify you have push access to the repository
- Check your Git credentials

### Deployment fails in Vercel
- Check Vercel logs at https://vercel.com/dashboard
- Verify the code builds locally: `npm run build`
- Check that all environment variables are set in Vercel

### Code on main but not deploying
- Verify you ran: `git push origin main:claude/setup-lecka-planner-e7kO0`
- Check Vercel dashboard to see if it received the push
- Wait 30-60 seconds for auto-deploy to complete

---

## CI/CD Future Enhancement

When you're ready to automate deployments, consider:
- GitHub Actions to run tests automatically on PRs
- Auto-deploy from `main` (contact Vercel support to enable "main" branch selection)
- Automated email notifications on deployment success/failure

For now, the manual sync is simple, safe, and transparent.

---

**Last Updated:** April 2026  
**Maintained By:** Development Team
