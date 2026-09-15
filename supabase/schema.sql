-- Run this once in the Supabase SQL editor (Project → SQL Editor → New
-- query) after creating the project. Backs src/lib/settings/store.server.ts
-- and src/lib/analytics/store.server.ts — see .env.local.example for the
-- full setup steps and src/lib/supabase.server.ts for why this exists at
-- all (this app has no persistent local disk to store this in).

-- One row per named settings blob — in practice exactly one row
-- (key = 'site_settings'), holding the whole admin-configurable site
-- settings object (logo, app links, theme, SEO ids, promo popups, policy
-- pages, …) as a single jsonb value. This backend never needs to know or
-- validate that value's shape — src/lib/settings/store.server.ts owns it.
create table if not exists storefront_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- One row per pageview on the storefront, logged by
-- src/app/api/track-visit's route via logVisit() in
-- src/lib/analytics/store.server.ts. Column names mirror that app's own
-- VisitRecord type (src/lib/analytics/types.ts) so the mapping in
-- store.server.ts stays a straight field-for-field translation.
create table if not exists storefront_visits (
  id bigint generated always as identity primary key,
  visited_at timestamptz not null,
  path text not null,
  ip text not null,
  country text, -- ISO 3166-1 alpha-2, or null when unresolved
  country_name text,
  city text,
  referrer text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text default 'unknown',
  browser text,
  os text,
  created_at timestamptz not null default now()
);

create index if not exists storefront_visits_visited_at_idx on storefront_visits (visited_at);

-- The admin dashboard's own login (see src/lib/settings/credentials.server.ts
-- and session.server.ts) — replaces the earlier ADMIN_EMAIL/ADMIN_PASSWORD
-- plaintext env vars, which meant "changing the admin password" required
-- editing and redeploying, and meant the real password sat in plaintext in
-- an env file. password_hash is never the plain password — see
-- credentials.server.ts for the scrypt format (`salt:hash`, hex-encoded).
-- Multiple rows work fine (more than one admin) even though today's login
-- route only ever looks up one.
create table if not exists admin_users (
  email text primary key,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security stays ON (Supabase's default for new tables) with NO
-- policies defined for any of these. That means the public `anon` key can
-- do nothing here at all — every read/write in this app goes through the
-- `service_role` key instead (see src/lib/supabase.server.ts), which
-- bypasses RLS entirely by design. Nothing further to configure.
alter table storefront_settings enable row level security;
alter table storefront_visits enable row level security;
alter table admin_users enable row level security;
