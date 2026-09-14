// Server-only. A deliberately minimal session mechanism for the one-user
// admin dashboard — no user table, no password hashing library dependency
// beyond Node's own `crypto` (already built in).
//
// Stateless signed token, NOT a server-side session store: the cookie
// value itself is `${expiresAt}.${hmac}`, where the HMAC is computed over
// expiresAt with ADMIN_SESSION_SECRET. Validating just means recomputing
// that HMAC and checking it matches — there is nothing to read or write on
// disk/in a database at all, so there's nothing for a redeploy to wipe.
// This replaces an earlier design (a JSON file of issued tokens, later a
// SITE_DATA_DIR variant of the same idea) that assumed one server with one
// persistent disk; this app is actually deployed on a serverless host
// where that file was wiped on every deploy, silently signing every admin
// back out. The real, if minor, tradeoff of going stateless: logout can
// only make the browser forget the cookie, not truly invalidate the token
// early — a copy of it made before logout would still work until its own
// 7-day expiry. For a single-admin dashboard already gated by
// ADMIN_EMAIL/ADMIN_PASSWORD and only ever handed out as an httpOnly
// cookie, that's a reasonable, common trade for "never silently logged out
// by infrastructure you don't control the disk of" — worth knowing about,
// not worth the complexity of a real revocation list for this use case.
import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const ADMIN_SESSION_COOKIE = "am-admin-session";

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? "";
}

function sign(expiresAt: number): string {
  return createHmac("sha256", secret()).update(String(expiresAt)).digest("hex");
}

// Constant-time comparison — a plain `===` on credentials leaks how many
// leading characters matched via response-time differences (a real, if
// minor, timing side-channel), which `timingSafeEqual` avoids. Both
// buffers must be equal length for it to run at all, so length is checked
// first (that check itself doesn't leak anything useful to an attacker).
export function verifyCredentials(email: string, password: string): boolean {
  const expectedEmail = process.env.ADMIN_EMAIL ?? "";
  const expectedPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!expectedEmail || !expectedPassword) return false;

  const emailBuf = Buffer.from(email);
  const expectedEmailBuf = Buffer.from(expectedEmail);
  const passwordBuf = Buffer.from(password);
  const expectedPasswordBuf = Buffer.from(expectedPassword);

  const emailMatches = emailBuf.length === expectedEmailBuf.length && timingSafeEqual(emailBuf, expectedEmailBuf);
  const passwordMatches = passwordBuf.length === expectedPasswordBuf.length && timingSafeEqual(passwordBuf, expectedPasswordBuf);
  return emailMatches && passwordMatches;
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
