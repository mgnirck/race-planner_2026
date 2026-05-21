import { sql, ensureMigrated } from './db.js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()

  try {
    await ensureMigrated()

    const { rows } = await sql`
      SELECT p.id, p.race_name, p.race_date, p.race_type, p.inputs,
             u.email
      FROM plans p
      JOIN users u ON u.id = p.user_id
      WHERE p.fuel_reminder_date = CURRENT_DATE
        AND p.fuel_reminder_sent = false
        AND u.email IS NOT NULL
      LIMIT 50
    `

    let sent = 0

    for (const plan of rows) {
      try {
        const raceName = plan.race_name || plan.race_type?.replace(/_/g, ' ') || 'your race'
        const raceDate = plan.race_date
          ? new Date(plan.race_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : ''

        await resend.emails.send({
          from: 'Lecka <info@getlecka.com>',
          to: [plan.email],
          subject: `Reminder: order your fuel for ${raceName}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
              <img src="https://plan.getlecka.com/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" style="height:28px;margin-bottom:24px" />
              <p style="font-size:16px;color:#111">Hey! You set a reminder to order your fuel for <strong>${raceName}</strong>${raceDate ? ` on ${raceDate}` : ''}.</p>
              <a href="https://plan.getlecka.com/plan/${plan.id}"
                 style="display:inline-block;margin:24px 0;padding:14px 28px;background:#1D9E75;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
                View my plan →
              </a>
              <p style="font-size:13px;color:#666">Real food. Real performance.</p>
            </div>
          `,
        })

        await sql`
          UPDATE plans SET fuel_reminder_sent = true WHERE id = ${plan.id}
        `
        sent++
      } catch (err) {
        console.error(`[send-reminder] plan ${plan.id} failed:`, err.message)
      }
    }

    return res.status(200).json({ ok: true, sent })
  } catch (err) {
    console.error('[send-reminder] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
