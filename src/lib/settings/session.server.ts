// Server-only. A deliberately minimal session mechanism for the one-user
// admin dashboard.
//
// Stateless signed token, NOT a server-side session store: the cookie
// value itself is `${expiresAt}.${hmac}`, where the HMAC is computed over
// expiresAt with ADMIN_SESSION_SECRET. Validating just means recomputing
// that HMAC and checking it matches — there is nothing to read or write on
// disk/in a database at all for the SESSION itself, so there's nothing for
// a redeploy to wipe. This replaces an earlier design (a JSON file of
// issued tokens, later a SITE_DATA_DIR variant of the same idea) that
// assumed one server with one persistent disk; this app is actually
// deployed on a serverless host where that file was wiped on every
// deploy, silently signing every admin back out. The real, if minor,
// tradeoff of going stateless: logout can only make the browser forget
// the cookie, not truly invalidate the token early — a copy of it made
// before logout would still work until its own 7-day expiry. For a
// single-admin dashboard already gated by a real credential check and
// only ever handed out as an httpOnly cookie, that's a reasonable, common
// trade for "never silently logged out by infrastructure you don't
// control the disk of" — worth knowing about, not worth the complexity of
// a real revocation list for this use case.
//
// The credential CHECK itself (verifyCredentials, below) is different —
// unlike the session token, that identity needs to actually persist and
// be changeable without a redeploy, so it lives in Supabase's admin_users
// table (see credentials.server.ts and supabase/schema.sql) instead of the
// ADMIN_EMAIL/ADMIN_PASSWORD plaintext env vars this used to check
// directly.
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabase } from "@/lib/supabase.server";
import { verifyPasswordHash } from "./credentials.server";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const ADMIN_SESSION_COOKIE = "am-admin-session";

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? "";
}

function sign(expiresAt: number): string {
  return createHmac("sha256", secret()).update(String(expiresAt)).digest("hex");
}

// Looks the email up in admin_users and checks the password against its
// stored scrypt hash (verifyPasswordHash is itself constant-time — see
// credentials.server.ts). A missing row and a wrong password take the same
// path (return false) and the login route already replies with the same
// "Invalid email or password" either way, so this doesn't hand out any
// extra timing signal beyond what a real database lookup already costs.
export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) return false;

  try {
    const { data, error } = await getSupabase()
      .from("admin_users")
      .select("password_hash")
      .eq("email", trimmedEmail)
      .maybeSingle();
    if (error || !data) return false;
    return verifyPasswordHash(password, data.password_hash);
  } catch {
    return false;
  }
}

export async function createSession(): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token || !secret()) return false;

  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expiresAtStr = token.slice(0, dot);
  const givenSig = token.slice(dot + 1);

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const expectedSig = sign(expiresAt);
  const givenBuf = Buffer.from(givenSig);
  const expectedBuf = Buffer.from(expectedSig);
  return givenBuf.length === expectedBuf.length && timingSafeEqual(givenBuf, expectedBuf);
}

// Nothing to actually revoke server-side (see the file docblock) — kept as
// an async no-op so the login/logout routes calling it don't need to
// change at all.
export async function destroySession(token: string | undefined): Promise<void> {
  void token;
}
