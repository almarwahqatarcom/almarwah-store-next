#!/usr/bin/env node
// Creates or updates one row in Supabase's admin_users table (see
// supabase/schema.sql and src/lib/settings/credentials.server.ts) — this is
// how you set the admin dashboard's login now that it's no longer the
// ADMIN_EMAIL/ADMIN_PASSWORD env vars. Run it any time you want to add an
// admin or change a password; no redeploy needed since it writes straight
// to Supabase.
//
// Usage (from the project root, with .env.local already filled in):
//   node scripts/seed-admin.mjs "email@example.com" "the new password"
//
// Reads SUPABASE_URL / SUPABASE_SECRET_KEY from .env.local automatically —
// or export them yourself first if you're running this somewhere else.
import { readFileSync, existsSync } from "fs";
import { createRequire } from "module";
import { scryptSync, randomBytes } from "crypto";

const require = createRequire(import.meta.url);

function loadEnvLocal() {
  const path = new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  loadEnvLocal();

  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: node scripts/seed-admin.mjs "email@example.com" "password"');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL / SUPABASE_SECRET_KEY are not set (checked .env.local and the environment).");
    process.exit(1);
  }

  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const password_hash = hashPassword(password);
  const { error } = await supabase.from("admin_users").upsert(
    { email: email.trim(), password_hash, updated_at: new Date().toISOString() },
    { onConflict: "email" }
  );

  if (error) {
    console.error("Failed to save admin credentials:", error.message);
    process.exit(1);
  }

  console.log(`✓ Admin credentials saved for ${email.trim()}.`);
}

main();
