// Server-only. A tiny managed Postgres database (Supabase), reached over
// HTTPS — the actual persistent store behind admin-saved site settings
// (src/lib/settings/store.server.ts) and visitor tracking
// (src/lib/analytics/store.server.ts).
//
// This app is deployed on a serverless host with no persistent local disk
// at all: every deploy replaces the filesystem entirely, and even within
// one deploy, separate requests can land on separate, isolated instances
// with no shared disk between them — confirmed live as the reason admin
// saves (logo, app store links, theme, …) kept reverting to empty after
// every deploy, and why visitor tracking showed nothing (a visit logged by
// one instance was invisible to whichever instance served the admin
// report). Supabase is real, shared storage every instance reads and
// writes the same place, so a save survives redeploys and is visible
// everywhere immediately.
//
// Deliberately NOT routed through the Laravel backend (admin.almarwah.qa)
// — this is a separate Next.js-only concern with its own dedicated tables,
// so the Laravel codebase needs zero changes and zero deploys for any of
// this to work.
//
// Uses the `secret` key (full read/write, bypasses Row Level Security)
// rather than the public `publishable` key — this file is only ever
// imported from server-only code (API routes, layout.tsx's server
// component), never bundled into client JS, so the secret never reaches
// the browser. Never import this from a "use client" file.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY are not set — see .env.local.example.");
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
