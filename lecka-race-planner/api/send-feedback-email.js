import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Simple rate limiting: max 10 requests per IP per 10 minutes
const rateMap = new Map()
function isRateLimited(ip) {
  const now = Date.now()
  const window = 10 * 60 * 1000
  const max = 10
  const entry = rateMap.get(ip) ?? { count: 0, start: now }
  if (now - entry.start > window) {
    rateMap.set(ip, { count: 1, start: now })
    return false
  }
  if (entry.count >= max) return true
  entry.count++
  rateMap.set(ip, entry)
  return false
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  const { message, page, senderEmail } = req.body ?? {}
  if (!message || typeof message !== 'string' || message.trim().length < 3) {
    return res.status(400).json({ error: 'Message is required' })
  }

  const trimmedMessage = message.trim().slice(0, 2000)
  const fromPage = page ? String(page).slice(0, 200) : 'unknown'
  const replyTo = senderEmail && senderEmail.includes('@') ? senderEmail.trim() : null

  try {
    await resend.emails.send({
      from: 'feedback@getlecka.com',
      to: 'markus@getlecka.com',
      ...(replyTo ? { replyTo } : {}),
      subject: `Feedback from Lecka Race Planner`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1B1B1B">
          <img src="https://plan.getlecka.com/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" style="height:28px;margin-bottom:24px" />
          <h2 style="font-size:18px;margin:0 0 16px">New feedback received</h2>
          <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;font-size:15px;line-height:1.6;white-space:pre-wrap">${trimmedMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          <table style="margin-top:20px;font-size:13px;color:#666;border-collapse:collapse">
            <tr><td style="padding:3px 12px 3px 0;font-weight:600">Page</td><td>${fromPage.replace(/</g, '&lt;')}</td></tr>
            ${replyTo ? `<tr><td style="padding:3px 12px 3px 0;font-weight:600">Reply-to</td><td>${replyTo.replace(/</g, '&lt;')}</td></tr>` : ''}
            <tr><td style="padding:3px 12px 3px 0;font-weight:600">Time</td><td>${new Date().toUTCString()}</td></tr>
          </table>
        </div>
      `,
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[send-feedback-email] error:', err)
    return res.status(500).json({ error: 'Failed to send feedback' })
  }
}
