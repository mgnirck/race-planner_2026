import { sql } from '@vercel/postgres'

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

  migrated = true
}
