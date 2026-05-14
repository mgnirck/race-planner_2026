import { randomBytes } from 'crypto'
import { Resend } from 'resend'
import { sql } from '../db.js'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' })
  }

  const normalised = email.toLowerCase().trim()

  try {
    // Upsert user so the row exists before the magic link is verified
    await sql`
      INSERT INTO users (email) VALUES (${normalised})
      ON CONFLICT (email) DO NOTHING
    `

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    await sql`
      INSERT INTO magic_links (email, token, expires_at)
      VALUES (${normalised}, ${token}, ${expiresAt.toISOString()})
    `

    const verifyUrl = `https://plan.getlecka.com/auth/verify?token=${token}`

    await resend.emails.send({
      from: 'info@getlecka.com',
      to: normalised,
      subject: 'Your Lecka login link',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <img src="https://plan.getlecka.com/logo.svg" alt="Lecka" style="height:36px;margin-bottom:24px" />
          <p style="font-size:16px;color:#111">Click the button below to sign in to the Lecka Race Nutrition Planner. This link expires in 15 minutes.</p>
          <a href="${verifyUrl}"
             style="display:inline-block;margin:24px 0;padding:14px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px">
            Sign in to Lecka
          </a>
          <p style="font-size:13px;color:#666">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[send-magic-link] error:', err)
    return res.status(500).json({ error: 'Failed to send magic link' })
  }
}
