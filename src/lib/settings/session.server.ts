// Server-only. A deliberately minimal session mechanism for the one-user
// admin dashboard — no user table, no password hashing library dependency
// beyond Node's own `crypto` (already built in), just a random opaque
// token mapped to an expiry, stored server-side (never derivable from the
// token itself) and handed to the browser only as an httpOnly cookie the
// client-side JS can never read. This keeps the actual admin password out
// of the browser entirely: it's compared once, server-side, in the login
// route, against ADMIN_EMAIL/ADMIN_PASSWORD env vars that are never bundled
// into client JS (only NEXT_PUBLIC_* vars are).
import { promises as fs } from "fs";
import path from "path";
import { randomBytes, timingSafeEqual } from "crypto";

const FILE_PATH = path.join(process.cwd(), "data", "admin-sessions.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const ADMIN_SESSION_COOKIE = "am-admin-session";

interface Session {
  token: string;
  expiresAt: number;
}

async function readSessions(): Promise<Session[]> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const list = JSON.parse(raw) as Session[];
    // Prune expired entries on every read so this file never grows
    // unbounded across repeated logins.
    return list.filter((s) => s.expiresAt > Date.now());
  } catch {
    return [];
  }
}

async function writeSessions(sessions: Session[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(sessions, null, 2), "utf8");
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
  const token = randomBytes(32).toString("hex");
  const sessions = await readSessions();
  sessions.push({ token, expiresAt: Date.now() + SESSION_TTL_MS });
  await writeSessions(sessions);
  return token;
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const sessions = await readSessions();
  return sessions.some((s) => s.token === token);
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const sessions = await readSessions();
  await writeSessions(sessions.filter((s) => s.token !== token));
}
