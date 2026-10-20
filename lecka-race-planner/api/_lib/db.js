import { sql } from '@vercel/postgres'
import { createHash, randomBytes } from 'crypto'

export { sql }

let migrated = false

export async function ensureMigrated() {
  if (migrated) return

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      weight_kg NUMERIC,
      weight_unit TEXT DEFAULT 'kg',
      gender TEXT,
      athlete_profile TEXT DEFAULT 'intermediate',
      caffeine_ok BOOLEAN DEFAULT true,
      dist_unit TEXT DEFAULT 'km'
    )
  `
  await sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS preferred_region TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS preferred_lang TEXT DEFAULT 'en'
  `
  await sql`
    CREATE TABLE IF NOT EXISTS plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      race_name TEXT,
      race_date DATE,
      race_type TEXT,
      goal_minutes INTEGER,
      conditions TEXT,
      effort TEXT,
      inputs JSONB,
      targets JSONB,
      selection JSONB,
      region TEXT DEFAULT 'us',
      lang TEXT DEFAULT 'en'
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      hit_carb_target TEXT,
      gi_issues TEXT,
      plan_felt_right TEXT,
      notes TEXT
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS magic_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS plan_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      race_type TEXT NOT NULL,
      region TEXT DEFAULT 'us'
    )
  `
  await sql`
    ALTER TABLE plan_events
      ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'simple'
  `
  await sql`
    CREATE TABLE IF NOT EXISTS product_catalog (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      carbs_per_unit NUMERIC,
      sodium_per_unit NUMERIC,
      caffeine BOOLEAN DEFAULT false,
      caffeine_mg INTEGER DEFAULT 0,
      dual_transporter BOOLEAN DEFAULT false,
      net_weight_g NUMERIC,
      ideal_time TEXT[],
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS product_regions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id TEXT NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
      region TEXT NOT NULL,
      available BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (product_id, region)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS product_variants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id TEXT NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
      region TEXT NOT NULL,
      shopify_variant_id TEXT NOT NULL,
      units_per_pack INTEGER NOT NULL,
      price NUMERIC NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS product_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      changed_at TIMESTAMPTZ DEFAULT NOW(),
      product_id TEXT NOT NULL,
      region TEXT,
      field_changed TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT DEFAULT 'admin'
    )
  `

  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS race_city TEXT`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS race_lat NUMERIC`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS race_lng NUMERIC`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS race_start_time TEXT`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS weather_estimated_temp TEXT`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS weather_live_temp_c NUMERIC`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS weather_last_fetched TIMESTAMPTZ`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS weather_confirmed BOOLEAN DEFAULT false`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS fuel_reminder_date DATE`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS fuel_reminder_sent BOOLEAN DEFAULT FALSE`
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS post_race_log_sent BOOLEAN DEFAULT FALSE`
  await sql`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS product_log JSONB`

  // Email send log for abuse limits — stores a SHA-256 hash, never the address itself
  await sql`
    CREATE TABLE IF NOT EXISTS email_sends (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      recipient_hash TEXT NOT NULL,
      ip TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS email_sends_recipient_idx ON email_sends (recipient_hash, created_at)`
  await sql`CREATE INDEX IF NOT EXISTS email_sends_ip_idx ON email_sends (ip, created_at)`

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash   TEXT UNIQUE NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL,
      revoked_at   TIMESTAMPTZ
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)`

  migrated = true
}

/**
 * Durable abuse limit for outgoing emails (plan emails, login links).
 * Returns true and logs the send if the recipient and IP are under their hourly
 * limits; returns false if either limit is reached. In-memory limits reset on
 * every cold start, so this one is stored in Postgres.
 *
 * Fails open: if the database is unavailable, the email is allowed (a real
 * athlete should never be blocked by an outage).
 *
 * @param {'plan'|'magic_link'} kind
 * @param {string} recipient  lower-cased email address
 * @param {string} ip
 * @param {{ perRecipientPerHour: number, perIpPerHour: number }} limits
 */
export async function allowEmailSend(kind, recipient, ip, { perRecipientPerHour, perIpPerHour }) {
  try {
    await ensureMigrated()
    const recipientHash = createHash('sha256').update(recipient).digest('hex')

    const { rows } = await sql`
      SELECT
        COUNT(*) FILTER (WHERE recipient_hash = ${recipientHash}) AS by_recipient,
        COUNT(*) FILTER (WHERE ip = ${ip})                        AS by_ip
      FROM email_sends
      WHERE kind = ${kind}
        AND created_at > NOW() - INTERVAL '1 hour'
        AND (recipient_hash = ${recipientHash} OR ip = ${ip})
    `
    if (Number(rows[0].by_recipient) >= perRecipientPerHour) return false
    if (Number(rows[0].by_ip)        >= perIpPerHour)        return false

    await sql`INSERT INTO email_sends (kind, recipient_hash, ip) VALUES (${kind}, ${recipientHash}, ${ip})`

    // Housekeeping: occasionally drop rows older than 2 days
    if (Math.random() < 0.02) {
      await sql`DELETE FROM email_sends WHERE created_at < NOW() - INTERVAL '2 days'`
    }
    return true
  } catch (err) {
    console.error('[allowEmailSend] failed open:', err.message)
    return true
  }
}

// ── Shared: insert a plan row (used by api/plans.js POST and api/send-plan.js) ──
export async function insertPlan({ userId, inputs = {}, targets = {}, selection = [], region = 'us', lang = 'en' }) {
  const { rows } = await sql`
    INSERT INTO plans (
      user_id, race_name, race_date, race_type,
      goal_minutes, conditions, effort,
      inputs, targets, selection, region, lang
    ) VALUES (
      ${userId},
      ${inputs.race_name || null},
      ${inputs.race_date || null},
      ${targets.race_type ?? inputs.race_type ?? null},
      ${targets.total_duration_minutes ?? null},
      ${inputs.conditions ?? targets.conditions ?? null},
      ${inputs.effort ?? targets.effort ?? null},
      ${JSON.stringify(inputs)}::jsonb,
      ${JSON.stringify(targets)}::jsonb,
      ${JSON.stringify(selection ?? [])}::jsonb,
      ${region},
      ${lang}
    )
    RETURNING id
  `
  const planId = rows[0].id

  // Populate weather_estimated_temp from conditions choice (non-fatal)
  const condToTempC   = { cool: '8', mild: '15', warm: '22', hot: '30' }
  const estimatedTemp = condToTempC[inputs.conditions ?? inputs.temperature] ?? null

  if (inputs.race_city?.trim() || estimatedTemp) {
    try {
      let lat = null, lon = null
      if (inputs.race_city?.trim()) {
        const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputs.race_city)}&format=json&limit=1`
        const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'LeckaRacePlanner/1.0 (info@getlecka.com)' } })
        if (geoRes.ok) {
          const geoData = await geoRes.json()
          if (geoData.length > 0) { lat = parseFloat(geoData[0].lat); lon = parseFloat(geoData[0].lon) }
        }
      }
      await sql`
        UPDATE plans SET
          race_city              = ${inputs.race_city?.trim() || null},
          race_lat               = ${lat},
          race_lng               = ${lon},
          race_start_time        = ${inputs.race_start_time ?? null},
          weather_estimated_temp = ${estimatedTemp}
        WHERE id = ${planId}
      `
    } catch (geoErr) {
      console.error('[insertPlan] geocoding failed (non-fatal):', geoErr.message)
    }
  }

  return planId
}

// ── Sessions ──────────────────────────────────────────────────────────────────
//
// The browser holds a random 64-hex-char token; the DB stores only its SHA-256.
// Sessions last 90 days and slide forward (at most one UPDATE per day) while used.
// Raw user UUIDs are NOT accepted as bearer tokens.

const SESSION_TOKEN_RE = /^[a-f0-9]{64}$/

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function readBearer(req) {
  const auth  = req.headers?.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  return SESSION_TOKEN_RE.test(token) ? token : null
}

/** Create a session for userId. Returns the raw token (only time it exists in plain form). */
export async function createSession(userId) {
  await ensureMigrated()
  const token = randomBytes(32).toString('hex')
  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hashSessionToken(token)}, NOW() + INTERVAL '90 days')
  `
  // Housekeeping: occasionally drop sessions dead for 30+ days
  if (Math.random() < 0.02) {
    try {
      await sql`
        DELETE FROM sessions
        WHERE expires_at < NOW() - INTERVAL '30 days'
           OR revoked_at < NOW() - INTERVAL '30 days'
      `
    } catch {}
  }
  return token
}

/**
 * Resolve the request's bearer session token to { id, email }, or null if
 * missing / malformed / expired / revoked. DB errors are THROWN (caller returns
 * 500) — never turned into null, so an outage doesn't look like a logout.
 */
export async function getUserFromRequest(req) {
  const token = readBearer(req)
  if (!token) return null
  await ensureMigrated()
  const { rows } = await sql`
    SELECT s.id AS session_id, s.last_used_at, u.id, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashSessionToken(token)}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null

  // Sliding expiry — at most once per day per session
  if (Date.now() - new Date(row.last_used_at).getTime() > 24 * 60 * 60 * 1000) {
    try {
      await sql`
        UPDATE sessions
        SET last_used_at = NOW(), expires_at = NOW() + INTERVAL '90 days'
        WHERE id = ${row.session_id}
      `
    } catch (err) {
      console.error('[getUserFromRequest] slide failed (non-fatal):', err.message)
    }
  }
  return { id: row.id, email: row.email }
}

/** Revoke the request's session. Idempotent; returns true if a live session was revoked. */
export async function revokeSession(req) {
  const token = readBearer(req)
  if (!token) return false
  await ensureMigrated()
  const { rows } = await sql`
    UPDATE sessions SET revoked_at = NOW()
    WHERE token_hash = ${hashSessionToken(token)} AND revoked_at IS NULL
    RETURNING id
  `
  return rows.length > 0
}
