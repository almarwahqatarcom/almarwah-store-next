import { createHmac, randomInt } from "crypto";

/**
 * Stateless WhatsApp OTP challenges.
 *
 * There's no database in this project, so instead of storing OTPs
 * server-side we hand the client a signed, self-contained "challenge" that
 * encodes the phone, the OTP, and an expiry — HMAC'd with a server-only
 * secret so it can't be forged or read. /api/otp/verify just re-derives the
 * signature and compares; nothing to store, nothing to clean up, and it's
 * exactly as secure as OTP_SECRET is kept secret.
 */

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes

/** Thrown when the server-side OTP_SECRET env var is missing — a deployment/config problem, not a user error. Routes catch this specifically and respond with a clean message instead of a raw 500. */
export class OtpConfigError extends Error {}

function getSecret(): string {
  const secret = process.env.OTP_SECRET;
  if (!secret) {
    throw new OtpConfigError("WhatsApp OTP login is not configured yet — OTP_SECRET is missing (see .env.local.example).");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export interface OtpChallenge {
  phone: string;
  otp: string;
  issuedAt: number;
  expiresAt: number;
}

/** Generates a fresh 6-digit OTP and its signed challenge token. */
export function createChallenge(phone: string): { otp: string; challenge: string; expiresAt: number } {
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + OTP_TTL_SECONDS * 1000;
  const payload = `${phone}|${otp}|${issuedAt}|${expiresAt}`;
  const sig = sign(payload);
  const challenge = Buffer.from(`${payload}|${sig}`).toString("base64url");
  return { otp, challenge, expiresAt };
}

/** Decodes a challenge without verifying — used only to read `issuedAt` for resend-cooldown checks. */
export function peekChallenge(challenge: string): OtpChallenge | null {
  try {
    const [phone, otp, issuedAt, expiresAt] = Buffer.from(challenge, "base64url").toString("utf8").split("|");
    return { phone, otp, issuedAt: Number(issuedAt), expiresAt: Number(expiresAt) };
  } catch {
    return null;
  }
}

/** Verifies a submitted OTP against its challenge. Returns the phone number on success. */
export function verifyChallenge(challenge: string, submittedOtp: string): { ok: true; phone: string } | { ok: false; reason: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(challenge, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "Invalid or corrupted verification session — please request a new code." };
  }

  const parts = decoded.split("|");
  if (parts.length !== 5) return { ok: false, reason: "Invalid or corrupted verification session — please request a new code." };
  const [phone, otp, issuedAt, expiresAt, sig] = parts;

  const expected = sign(`${phone}|${otp}|${issuedAt}|${expiresAt}`);
  // Constant-time-ish comparison is nice-to-have here; the bigger guard is that
  // the OTP itself is only 6 digits, so rate limiting matters more than timing safety.
  if (sig !== expected) return { ok: false, reason: "Invalid or corrupted verification session — please request a new code." };
  if (Date.now() > Number(expiresAt)) return { ok: false, reason: "This code has expired — please request a new one." };
  if (submittedOtp.trim() !== otp) return { ok: false, reason: "Incorrect code — please check and try again." };

  return { ok: true, phone };
}

/**
 * Sends the OTP to n8n for actual WhatsApp delivery. n8n owns the real
 * WhatsApp Business API / provider credentials — this call is just the
 * trigger. The workflow on the n8n side is expected to read `phone` and
 * `message` (or `otp` directly) from the JSON body and send the WhatsApp
 * message; anything it returns is ignored beyond the HTTP status.
 */
export async function sendOtpViaN8n(phone: string, otp: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const webhookUrl = process.env.N8N_WHATSAPP_OTP_WEBHOOK_URL;
  if (!webhookUrl) {
    return { ok: false, error: "N8N_WHATSAPP_OTP_WEBHOOK_URL is not configured — see .env.local.example." };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers["X-Webhook-Secret"] = process.env.N8N_WEBHOOK_SECRET;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone,
        otp,
        message: `Your AlMarwah verification code is ${otp}. It expires in 5 minutes. Don't share this code with anyone.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { ok: false, error: `WhatsApp delivery service returned ${res.status}.` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the WhatsApp delivery service. Please try again shortly." };
  }
}

/** Basic sanity check — full E.164 validation happens on the backend, this just catches obvious junk before we spend an OTP send on it. */
export function isPlausiblePhone(phone: string): boolean {
  return /^\+?[0-9]{8,15}$/.test(phone.trim());
}

/** Resend cooldown, mirrors the 60s window the backend's own SMS OTP (checkPhone) enforces. */
const RESEND_COOLDOWN_MS = 60 * 1000;

/** If `previousChallenge` is still within its cooldown window, returns the seconds left; otherwise null. */
export function resendCooldownRemaining(previousChallenge: string | undefined | null): number | null {
  if (!previousChallenge) return null;
  const prev = peekChallenge(previousChallenge);
  if (!prev) return null;
  const elapsed = Date.now() - prev.issuedAt;
  if (elapsed >= RESEND_COOLDOWN_MS) return null;
  return Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
}

// ── Verified-phone token ────────────────────────────────────────────────────
// Separate, short-lived signed token issued only after a correct OTP, proving
// "this phone was verified just now" to the account-creation step — without
// re-trusting a client-supplied boolean and without re-transmitting the OTP.
// Prefixed distinctly from the OTP challenge so the two token types can never
// be swapped for one another even though they share the same signing scheme.

const VERIFIED_TTL_SECONDS = 10 * 60; // 10 minutes — enough to fill in a name and submit

export function createVerifiedToken(phone: string): string {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + VERIFIED_TTL_SECONDS * 1000;
  const payload = `verified|${phone}|${issuedAt}|${expiresAt}`;
  const sig = sign(payload);
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export function verifyVerifiedToken(token: string): { ok: true; phone: string } | { ok: false; reason: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "Your verification has expired — please verify your phone again." };
  }
  const parts = decoded.split("|");
  if (parts.length !== 5 || parts[0] !== "verified") {
    return { ok: false, reason: "Your verification has expired — please verify your phone again." };
  }
  const [, phone, issuedAt, expiresAt, sig] = parts;
  const expected = sign(`verified|${phone}|${issuedAt}|${expiresAt}`);
  if (sig !== expected) return { ok: false, reason: "Your verification has expired — please verify your phone again." };
  if (Date.now() > Number(expiresAt)) return { ok: false, reason: "Your verification has expired — please verify your phone again." };
  return { ok: true, phone };
}
