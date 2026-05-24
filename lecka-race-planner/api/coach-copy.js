/**
 * api/coach-copy.js — Vercel serverless function
 *
 * POST { race_type, goal_minutes, conditions, carb_per_hour, ... }
 *   Calls the Anthropic API to generate personalised coach copy.
 *   Returns { copy: string | null }
 *
 * POST ?action=checkpoint-fill { plan, segments, available_products }
 *   Returns { segments: [...] } with AI-suggested product assignments per segment.
 *
 * Public endpoint — no auth required.
 * Rate-limited: 5 requests per IP per 60s.
 */

const rateLimitMap = new Map()
const RATE_LIMIT   = 5
const WINDOW_MS    = 60_000

const TRIATHLON_RACE_TYPES = new Set(['triathlon_sprint', 'triathlon_olympic', 'triathlon_70_3', 'triathlon_140_6'])

function buildTriathlonPhaseBlock(input) {
  const { race_type, swim_minutes: sw, bike_minutes: bk, run_minutes: rn, goal_minutes } = input
  if (!TRIATHLON_RACE_TYPES.has(race_type)) return ''
  const swimMin = Number(sw)
  const bikeMin = Number(bk)
  const runMin  = Number(rn)
  if (!(swimMin > 0) || !(bikeMin > 0) || !(runMin > 0)) return ''
  const total = goal_minutes ?? swimMin + bikeMin + runMin
  return `
This is a triathlon with three distinct nutrition phases:
- Swim (0–${swimMin} min): no intake possible — the athlete arrives at T1 with depleted fast carbs
- Bike (${swimMin}–${swimMin + bikeMin} min): the primary fuelling window — highest carb absorption rate, carry enough for the full bike
- Run (${swimMin + bikeMin}–${total} min): gel-only, every 25 min, gut stress increases with run impact after hours of racing

Frame your coach notes around these three phases. Explicitly mention T1 as the start of fuelling, the bike as the opportunity to front-load carbs, and the run as the phase to keep intake light and consistent.
`
}

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

// ── Simple mode prompt builder ────────────────────────────────────────────────

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

  const triathlonBlock = buildTriathlonPhaseBlock(input)

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
${triathlonBlock}
Write 3–4 paragraphs explaining why this plan is right for this athlete and these conditions. Be specific to the numbers above.`
}

// ── Pro mode prompt builder ───────────────────────────────────────────────────

function buildProCoachPrompt(input) {
  const {
    race_type, goal_minutes, conditions, effort, carb_per_hour,
    sodium_per_hour, fluid_ml_per_hour, total_carbs, total_sodium,
    gel_count, elevation_tier, elevation_gain_m, athlete_profile,
    gender, weight_kg, caffeine_ok, has_addons, addon_carbs_ph,
    fuelling_style, selected_products,
  } = input

  const h = Math.floor(goal_minutes / 60)
  const m = goal_minutes % 60
  const goalTime = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`

  const raceLabels = {
    '5k': '5km road race', '10k': '10km road race',
    'half_marathon': 'half marathon', 'marathon': 'marathon',
    'ultra_50k': '50km ultra', 'ultra_100k': '100km+ ultra',
    'triathlon_70_3': '70.3 triathlon', 'triathlon_140_6': 'Ironman',
  }

  const conditionLabels = {
    cool: 'cool (under 15°C)', mild: 'mild (15–20°C)',
    warm: 'warm (20–26°C)', hot: 'hot (over 26°C)', humid: 'humid',
  }

  const profileLabels = {
    untrained: 'new to endurance sports',
    intermediate: 'intermediate endurance athlete',
    trained: 'trained endurance athlete',
    elite: 'elite / competitive athlete',
  }

  const elevationNote = elevation_tier && elevation_tier !== 'flat'
    ? `Course profile: ${elevation_tier.replace('_', ' ')} (${elevation_gain_m}m elevation gain).`
    : 'Course profile: flat.'

  const addonNote = has_addons
    ? `The athlete is supplementing with additional products providing ${addon_carbs_ph}g carbs/hour on top of the Lecka foundation.`
    : ''

  const triathlonBlock = buildTriathlonPhaseBlock(input)

  return `Write detailed coach notes for this athlete's race nutrition plan.

Athlete profile:
- Race: ${raceLabels[race_type] ?? race_type}, goal time ${goalTime}
- Conditions: ${conditionLabels[conditions] ?? conditions}
- Effort: ${effort}
- ${elevationNote}
- Athlete: ${profileLabels[athlete_profile] ?? athlete_profile}
- Gender: ${gender ?? 'not specified'}
- Weight: ${weight_kg ? `${Math.round(weight_kg)}kg` : 'not provided'}
- Caffeine: ${caffeine_ok ? 'yes' : 'no'}

Nutrition targets:
- Carbs: ${carb_per_hour}g/hour (${total_carbs}g total)
- Sodium: ${sodium_per_hour}mg/hour (${total_sodium}mg total)
- Fluid: ${fluid_ml_per_hour}ml/hour
- Gels in plan: ${gel_count}
- Products: ${selected_products?.join(', ') ?? 'not specified'}
- Fuelling style: ${fuelling_style ?? 'gels only'}
${addonNote}
${triathlonBlock}
Write 4–5 paragraphs of coach notes. Be specific to this athlete's exact combination of variables — explain why their targets are what they are and how the different factors interact. Reference their actual numbers. Include one paragraph specifically on execution — the most important timing or pacing cue for this race and conditions.

Then write a separate "Watch out for" section: 2–3 sentences on the one or two most likely failure modes for this specific plan. Be direct and specific — not generic warnings. Reference their actual race, conditions, and profile.

Format your response as:

COACH_NOTES:
[4–5 paragraphs here]

WATCH_OUT:
[2–3 sentences here]

Plain text only. No markdown. No bullet points. No headers within sections. Total length: 200–280 words for coach notes, 40–60 words for watch out.`
}

function parseProCoachResponse(text) {
  const coachMatch = text.match(/COACH_NOTES:\s*([\s\S]*?)(?=WATCH_OUT:|$)/)
  const watchMatch = text.match(/WATCH_OUT:\s*([\s\S]*)$/)
  return {
    coach_notes: coachMatch?.[1]?.trim() ?? text,
    watch_out:   watchMatch?.[1]?.trim() ?? null,
  }
}

// ── Checkpoint fill prompt builder ────────────────────────────────────────────

function buildCheckpointFillPrompt(plan, segments, products) {
  return `Race: ${plan.race_type}, goal ${plan.goal_minutes} min, conditions: ${plan.conditions}, athlete: ${plan.athlete_profile}.
Available products: ${products.join(', ')}.
Caffeine OK: ${plan.caffeine_ok}.

Segments:
${segments.map((s, i) => `${i + 1}. ${s.name}: ${s.distance_km}km, ${s.elevation_m}m gain, ~${s.est_minutes} min, needs ${s.carbs_needed}g carbs, ${s.sodium_needed}mg sodium. Drop bag: ${s.drop_bag ? 'YES' : 'no'}.`).join('\n')}

Return JSON in this exact format:
{
  "segments": [
    {
      "index": 0,
      "products": [
        { "name": "Energy Gel Passion Fruit", "quantity": 2 },
        { "name": "Energy Gel Coffee Cacao", "quantity": 1 }
      ],
      "note": "One sentence coaching note for this specific segment."
    }
  ]
}

Rules:
- Only use products from the available products list
- Quantities must be integers >= 0
- Total carbs from suggested products should be within 15% of carbs_needed for each segment
- Assign caffeine gels only after the 40% race mark and at most once per 60 minutes of estimated segment time
- For drop bag segments, you may suggest slightly more products (the athlete can restock here)
- Keep notes to one sentence, specific to terrain or timing`
}

// ── Checkpoint fill handler ───────────────────────────────────────────────────

async function handleCheckpointFill(req, res) {
  const { plan, segments, available_products } = req.body ?? {}
  if (!plan || !segments || !available_products) {
    return res.status(400).json({ segments: null, error: 'Missing required fields' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ segments: null, error: 'AI not configured' })
  }

  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 20000)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: `You are a race nutrition coach helping an endurance athlete plan their checkpoint-by-checkpoint nutrition for a race.

Lecka's voice: pragmatic and direct. State facts clearly. Support recommendations with brief reasoning. Be warm but never gushing. Be encouraging but never hollow. Write like a knowledgeable friend who trains hard, eats well, and genuinely wants you to have a good race.

You will receive a race plan and a list of segments with calculated nutrition needs. For each segment, suggest specific products and quantities from the athlete's plan, and add one short coaching note (1 sentence) specific to that segment's challenges.

Respond ONLY with valid JSON. No prose before or after. No markdown.`,
        messages: [{ role: 'user', content: buildCheckpointFillPrompt(plan, segments, available_products) }],
      }),
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return res.status(200).json({ segments: null, error: 'AI API error' })
    }

    const data = await response.json()
    try {
      let text = (data.content[0].text ?? '').trim()
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (fenceMatch) text = fenceMatch[1].trim()
      const json = JSON.parse(text)
      return res.status(200).json({ segments: json.segments })
    } catch {
      return res.status(200).json({ segments: null, error: 'Could not parse AI response' })
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[coach-copy/checkpoint-fill] error:', err.message)
    }
    return res.status(200).json({ segments: null, error: 'Request failed' })
  }
}

// ── Pre-fuel handler ──────────────────────────────────────────────────────────

async function handlePreFuel(req, res) {
  const { race_type, goal_minutes, conditions, carb_per_hour } = req.body ?? {}
  if (!race_type || !goal_minutes || !conditions || carb_per_hour == null) {
    return res.status(400).json({ pre_fuel: null, error: 'Missing required fields' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ pre_fuel: null, error: 'AI not configured' })
  }

  const {
    weight_kg, athlete_profile, gender,
    diet, gi_sensitivity, breakfast_time, coffee_habit, race_morning_experience,
  } = req.body

  const userPrompt = `Write a pre-race nutrition plan for this athlete.

Race: ${race_type}, goal ${goal_minutes} min, conditions: ${conditions}
Athlete: ${athlete_profile ?? 'intermediate'}, ${gender ?? 'not specified'}, ${weight_kg ? weight_kg + 'kg' : 'weight not provided'}
Carb target on race day: ${carb_per_hour}g/hour
Diet: ${diet}
GI sensitivity: ${gi_sensitivity}
Breakfast timing: ${breakfast_time} before race start
Coffee habit: ${coffee_habit}
Race morning experience: ${race_morning_experience}

Guidelines:
- 3 days out: carb-loading approach matched to their diet and GI sensitivity. Give specific food examples. Target 7–9g carbs/kg/day (use 70kg if weight unknown). Be concrete not generic.
- Day before: reduce fibre and fat, maintain carbs, hydration strategy. Give a sample dinner and evening snack.
- Race morning: specific breakfast matched to their timing preference and diet. State approximate carb grams. High GI sensitivity = simpler foods, smaller portions.
- Pre-start (0–60 min before gun): what to eat or drink in the final hour. Suggest a Lecka energy bar 30 min before start where appropriate. Include caffeine guidance based on their coffee habit and race duration.
- Watch out for: the one or two most likely pre-race nutrition mistakes for this specific athlete. 2–3 direct sentences. Reference their actual race and profile.

IMPORTANT — electrolyte guidance: Lecka does not currently sell electrolyte products. For electrolyte needs, recommend widely available options such as electrolyte tablets (e.g. Nuun, Precision Hydration tabs), sports drink powder mixed into water, or simply salted food. Do not suggest a "Lecka electrolyte" product.

Respond ONLY with this exact JSON (no markdown, no extra keys):
{
  "pre_fuel": {
    "t_minus_3_days": "...",
    "t_minus_1_day": "...",
    "race_morning": "...",
    "pre_start": "...",
    "watch_out": "..."
  }
}`

  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 8000)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: `You are a race nutrition coach writing a personalised pre-race fueling plan for an endurance athlete.

Lecka's voice: pragmatic and direct. Real food focused. No sports marketing clichés. No generic advice — be specific to this athlete's race, conditions, dietary preferences, and GI history.

Respond ONLY with valid JSON. No prose before or after. No markdown fences.`,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return res.status(200).json({ pre_fuel: null, error: 'AI API error' })
    }

    const data = await response.json()
    try {
      let text = (data.content[0].text ?? '').trim()
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (fenceMatch) text = fenceMatch[1].trim()
      const json = JSON.parse(text)
      return res.status(200).json({ pre_fuel: json.pre_fuel })
    } catch {
      return res.status(200).json({ pre_fuel: null, error: 'Could not generate plan' })
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[coach-copy/pre-fuel] error:', err.message)
    }
    return res.status(200).json({ pre_fuel: null, error: 'Request failed' })
  }
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

  // Route pre-fuel to its own handler
  if (req.query?.action === 'pre-fuel') {
    return handlePreFuel(req, res)
  }

  // Route checkpoint-fill to its own handler
  if (req.query?.action === 'checkpoint-fill') {
    return handleCheckpointFill(req, res)
  }

  const body = req.body ?? {}
  const { race_type, goal_minutes, conditions, carb_per_hour, mode } = body

  if (!race_type || !goal_minutes || !conditions || carb_per_hour == null) {
    return res.status(400).json({ error: 'Missing required fields: race_type, goal_minutes, conditions, carb_per_hour' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[coach-copy] ANTHROPIC_API_KEY not set — skipping AI copy')
    return res.status(200).json({ copy: null })
  }

  const isPro = mode === 'pro'
  const maxTokens = isPro ? 900 : 500

  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 8000)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
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
            content: isPro ? buildProCoachPrompt(body) : buildCoachPrompt(body),
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

    if (isPro) {
      const parsed = parseProCoachResponse(data.content[0].text)
      return res.status(200).json({
        copy:      parsed.coach_notes,
        watch_out: parsed.watch_out,
      })
    }

    const copy = data.content?.[0]?.text ?? null
    return res.status(200).json({ copy })
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[coach-copy] fetch error:', err.message)
    }
    return res.status(200).json({ copy: null })
  }
}
