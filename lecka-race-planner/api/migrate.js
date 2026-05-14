import { sql } from './db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
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

    return res.status(200).json({ ok: true, message: 'Migration complete' })
  } catch (err) {
    console.error('[migrate] error:', err)
    return res.status(500).json({ error: 'Migration failed', detail: err.message })
  }
}
