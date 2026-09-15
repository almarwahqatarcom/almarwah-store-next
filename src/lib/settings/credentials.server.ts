// Server-only. Password hashing for the admin_users table (see
// supabase/schema.sql) — scrypt via Node's own built-in `crypto`, the same
// "no extra dependency" choice session.server.ts already made for HMAC
// signing. Never store or compare a plain password anywhere; this is the
// one place that touches the raw value at all, on either side.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LEN = 64;

// Stored format is "<salt-hex>:<hash-hex>" — a plain string column, no
// separate salt column needed, and immediately obvious at a glance in the
// database that it's a salted hash, not a plaintext password.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const candidate = scryptSync(password, salt, expected.length);
    // Constant-time compare — see the identical rationale in
    // session.server.ts's own timingSafeEqual use.
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  } catch {
    return false;
  }
}
