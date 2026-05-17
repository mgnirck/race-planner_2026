/**
 * api/coach-copy.js — Vercel serverless function
 *
 * POST { race_type, goal_minutes, conditions, carb_per_hour, ... }
 *   Calls the Anthropic API to generate personalised coach copy.
 *   Returns { copy: string | null }
 *
 * Public endpoint — no auth required.
 * Rate-limited: 5 requests per IP per 60s.
 */

const rateLimitMap = new Map()
const RATE_LIMIT   = 5
const WINDOW_MS    = 60_000

function isRateLimited(ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return false
  }
  if (entry.count >= RATE_LIMIT) return true
  entry.count++
  return false
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildCoachPrompt(input) {
  const {
    race_type, goal_minutes, conditions, carb_per_hour,
    sodium_per_hour, fluid_ml_per_hour, total_carbs,
    gel_count, elevation_tier, athlete_profile, gender,
  } = input

  const h = Math.floor(goal_minutes / 60)
  const m = goal_minutes % 60
  const goalTime = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`

  const raceLabels = {
    '5k':              '5km road race',
    '10k':             '10km road race',
    'half_marathon':   'half marathon',
    'marathon':        'marathon',
    'ultra_50k':       '50km ultra',
    'ultra_100k':      '100km+ ultra',
    'triathlon_70_3':  '70.3 triathlon',
    'triathlon_140_6': 'Ironman',
  }

  const conditionLabels = {
    cool:  'cool conditions (under 15°C)',
    mild:  'mild conditions (15–20°C)',
    warm:  'warm conditions (20–26°C)',
    hot:   'hot conditions (over 26°C)',
    humid: 'humid conditions',
  }

  const elevationNote = elevation_tier && elevation_tier !== 'flat'
    ? ` The course is ${elevation_tier.replace('_', ' ')}.` : ''

  return `Write coach copy for this athlete's race nutrition plan:

Race: ${raceLabels[race_type] ?? race_type}
Goal time: ${goalTime}
Conditions: ${conditionLabels[conditions] ?? conditions}${elevationNote}
Carb target: ${carb_per_hour}g per hour (${total_carbs}g total)
Sodium target: ${sodium_per_hour}mg per hour
Fluid target: ${fluid_ml_per_hour}ml per hour
Gels in plan: ${gel_count}
Athlete profile: ${athlete_profile ?? 'intermediate'}
Gender: ${gender ?? 'not specified'}

Write 3–4 paragraphs explaining why this plan is right for this athlete and these conditions. Be specific to the numbers above.`
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ copy: null })
  }

  const body = req.body ?? {}
  const { race_type, goal_minutes, conditions, carb_per_hour } = body

  if (!race_type || !goal_minutes || !conditions || carb_per_hour == null) {
    return res.status(400).json({ error: 'Missing required fields: race_type, goal_minutes, conditions, carb_per_hour' })
  }

  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 7000)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `You are the voice of Lecka, a real food endurance nutrition brand.
Write personalised coach copy for an athlete's race nutrition plan.

Lecka's voice: pragmatic and direct. State facts clearly. Support
recommendations with brief reasoning — not to show off the science,
but because athletes deserve to know why. Be warm but never gushing.
Be encouraging but never hollow. Avoid sports marketing clichés
("crush it", "smash your goals", "fuel your journey"). Never be
preachy. Trust the athlete to make good decisions when given good
information. Lecka believes real food is better for endurance athletes
in the long run — not as a trend, but as a conviction. That confidence
should come through without needing to be stated explicitly. Write like
a knowledgeable friend who trains hard, eats well, and genuinely wants
you to have a good race.

Format: 3–4 short paragraphs. No bullet points. No headers. No
markdown. Plain text only — the UI handles formatting. Each paragraph
should cover one of: why the carb target is what it is, why the sodium
target matters for these specific conditions, how to execute the timing
on race day, one honest note about what commonly goes wrong and how
to avoid it. Total length: 120–180 words. Do not mention Lecka by name
— the athlete already knows whose plan this is.`,
        messages: [
          {
            role:    'user',
            content: buildCoachPrompt(body),
          },
        ],
      }),
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.error('[coach-copy] Anthropic API error:', response.status)
      return res.status(200).json({ copy: null })
    }

    const data = await response.json()
    const copy = data.content?.[0]?.text ?? null
    return res.status(200).json({ copy })
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[coach-copy] fetch error:', err.message)
    }
    return res.status(200).json({ copy: null })
  }
}
