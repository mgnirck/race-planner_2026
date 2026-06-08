import { Resend } from 'resend'
import { sql, ensureMigrated } from './_db.js'

const resend = new Resend(process.env.RESEND_API_KEY)

// Rate limiting for unauthenticated widget submissions: 10 req / IP / 10 min
const rateMap = new Map()
function isRateLimited(ip) {
  const now = Date.now()
  const window = 10 * 60 * 1000
  const max = 10
  const entry = rateMap.get(ip) ?? { count: 0, start: now }
  if (now - entry.start > window) { rateMap.set(ip, { count: 1, start: now }); return false }
  if (entry.count >= max) return true
  entry.count++
  rateMap.set(ip, entry)
  return false
}

async function getUser(req) {
  const auth = req.headers.authorization ?? ''
  const userId = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
  if (!userId) return null
  const { rows } = await sql`SELECT id FROM users WHERE id = ${userId} LIMIT 1`
  return rows[0] ?? null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password')

  if (req.method === 'OPTIONS') return res.status(204).end()

  // ── GET — admin list ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const adminPassword = process.env.VITE_ADMIN_PASSWORD
    const provided = req.headers['x-admin-password'] ?? ''
    if (!adminPassword || provided !== adminPassword) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      await ensureMigrated()
      const { rows } = await sql`
        SELECT
          f.id, f.submitted_at, f.rating, f.hit_carb_target,
          f.gi_issues, f.plan_felt_right, f.notes,
          p.race_type, p.conditions, p.goal_minutes, p.region, p.race_date
        FROM feedback f
        JOIN plans p ON p.id = f.plan_id
        ORDER BY f.submitted_at DESC
      `
      return res.status(200).json(rows)
    } catch (err) {
      console.error('[feedback] list error:', err)
      return res.status(500).json({ error: 'Failed to list feedback' })
    }
  }

  // ── POST ────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { planId, rating, hit_carb_target, gi_issues, plan_felt_right, notes, message, page, senderEmail } = req.body ?? {}

    // ── Widget feedback — unauthenticated, sends email to Markus ─────────────
    if (message !== undefined) {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown'
      if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests' })

      const trimmed = typeof message === 'string' ? message.trim().slice(0, 2000) : ''
      if (trimmed.length < 3) return res.status(400).json({ error: 'Message is required' })

      const fromPage  = page        ? String(page).slice(0, 200)        : 'unknown'
      const replyTo   = senderEmail && String(senderEmail).includes('@') ? String(senderEmail).trim() : null

      try {
        await resend.emails.send({
          from:    'info@getlecka.com',
          to:      'markus@getlecka.com',
          ...(replyTo ? { replyTo } : {}),
          subject: 'Feedback from Lecka Race Planner',
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1B1B1B">
              <img src="https://plan.getlecka.com/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" style="height:28px;margin-bottom:24px" />
              <h2 style="font-size:18px;margin:0 0 16px">New feedback received</h2>
              <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;font-size:15px;line-height:1.6;white-space:pre-wrap">${trimmed.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
              <table style="margin-top:20px;font-size:13px;color:#666;border-collapse:collapse">
                <tr><td style="padding:3px 12px 3px 0;font-weight:600">Page</td><td>${fromPage.replace(/</g,'&lt;')}</td></tr>
                ${replyTo ? `<tr><td style="padding:3px 12px 3px 0;font-weight:600">Reply-to</td><td>${replyTo.replace(/</g,'&lt;')}</td></tr>` : ''}
                <tr><td style="padding:3px 12px 3px 0;font-weight:600">Time</td><td>${new Date().toUTCString()}</td></tr>
              </table>
            </div>
          `,
        })
        return res.status(200).json({ ok: true })
      } catch (err) {
        console.error('[feedback] email error:', err)
        return res.status(500).json({ error: 'Failed to send feedback' })
      }
    }

    // ── Plan feedback — authenticated, saves to DB ────────────────────────────
    try {
      await ensureMigrated()
      const user = await getUser(req)
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      if (!planId) return res.status(400).json({ error: 'planId is required' })
      if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be 1–5' })

      const { rows: planRows } = await sql`
        SELECT id FROM plans WHERE id = ${planId} AND user_id = ${user.id} LIMIT 1
      `
      if (planRows.length === 0) return res.status(404).json({ error: 'Plan not found' })

      await sql`
        INSERT INTO feedback (plan_id, rating, hit_carb_target, gi_issues, plan_felt_right, notes)
        VALUES (${planId}, ${rating}, ${hit_carb_target ?? null}, ${gi_issues ?? null}, ${plan_felt_right ?? null}, ${notes ?? null})
      `
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('[feedback] save error:', err)
      return res.status(500).json({ error: 'Failed to save feedback' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
