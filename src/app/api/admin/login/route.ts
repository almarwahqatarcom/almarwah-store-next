import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, createSession, ADMIN_SESSION_COOKIE } from "@/lib/settings/session.server";

// There's exactly one admin account and no lockout/2FA on it, so the login
// endpoint itself is the only thing standing between a leaked/guessed
// password and the whole dashboard — worth throttling by IP even with a
// simple, in-memory, reset-on-restart limiter (same tradeoff as
// track-visit's own rate limiter: a real deterrent at this store's scale,
// not a substitute for a proper WAF/rate-limiting layer in front of
// production). Only failed attempts count, so a legitimate admin typing
// their own correct password never gets blocked by their own past typos.
const LOCKOUT_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 8;
const failedAttemptsByIp = new Map<string, number[]>();

function extractIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = extractIp(req);
  const now = Date.now();
  const recentFailures = (failedAttemptsByIp.get(ip) ?? []).filter((t) => now - t < LOCKOUT_WINDOW_MS);

  if (recentFailures.length >= MAX_FAILED_ATTEMPTS) {
    return NextResponse.json({ message: "Too many attempts. Please try again in a few minutes." }, { status: 429 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";

  if (!verifyCredentials(email, password)) {
    recentFailures.push(now);
    failedAttemptsByIp.set(ip, recentFailures);
    // Same message either way — not confirming whether the email itself
    // was recognized avoids handing an attacker a free way to enumerate
    // valid admin emails one guess at a time.
    return NextResponse.json({ message: "Invalid email or password." }, { status: 401 });
  }

  failedAttemptsByIp.delete(ip);

  const token = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
