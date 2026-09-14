import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, createSession, ADMIN_SESSION_COOKIE } from "@/lib/settings/session.server";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";

  if (!verifyCredentials(email, password)) {
    // Same message either way — not confirming whether the email itself
    // was recognized avoids handing an attacker a free way to enumerate
    // valid admin emails one guess at a time.
    return NextResponse.json({ message: "Invalid email or password." }, { status: 401 });
  }

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
