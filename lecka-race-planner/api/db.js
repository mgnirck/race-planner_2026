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

  migrated = true
}
