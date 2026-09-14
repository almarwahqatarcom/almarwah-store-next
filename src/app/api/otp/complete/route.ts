import { NextRequest, NextResponse } from "next/server";
import { OtpConfigError, verifyVerifiedToken } from "@/lib/otp";
import { API_BASE } from "@/lib/api";

// Unified OTP login/signup for a phone WE have just verified via WhatsApp
// (proven by `verified_token`, signed server-side — never trust a
// client-supplied "verified" flag here). Delegates the actual account
// lookup/creation to the backend's own `/auth/otp-login` endpoint, which:
//  - logs an EXISTING customer straight into their real account (it looks
//    the phone up first, so it can never create a duplicate), or
//  - creates a new account once a name is supplied (`needs_name: true`
//    comes back first if we haven't sent one yet).
// That endpoint trusts this route via a shared secret (OTP_INTERNAL_SECRET)
// instead of re-verifying the code itself — the WhatsApp verification
// already happened above, in verifyVerifiedToken(). See README for the
// Laravel-side addition this depends on.
export async function POST(req: NextRequest) {
  let body: { verified_token?: string; name?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const { verified_token, name, email } = body;
  if (!verified_token) {
    return NextResponse.json({ message: "Missing required fields." }, { status: 400 });
  }

  let check;
  try {
    check = verifyVerifiedToken(verified_token);
  } catch (err) {
    if (err instanceof OtpConfigError) {
      return NextResponse.json({ message: err.message }, { status: 500 });
    }
    throw err;
  }
  if (!check.ok) {
    return NextResponse.json({ message: check.reason }, { status: 401 });
  }

  const internalSecret = process.env.OTP_INTERNAL_SECRET;
  if (!internalSecret) {
    return NextResponse.json(
      { message: "OTP login is not fully configured yet — OTP_INTERNAL_SECRET is missing (see .env.local.example)." },
      { status: 500 }
    );
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/otp-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-OTP-Internal-Secret": internalSecret,
      },
      body: JSON.stringify({
        phone: check.phone,
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(email?.trim() ? { email: email.trim() } : {}),
      }),
    });
  } catch {
    return NextResponse.json({ message: "Could not reach the account service. Please try again." }, { status: 502 });
  }

  if (res.status === 404) {
    // The backend endpoint hasn't been deployed yet — a real, expected state
    // during setup, not a bug. See README for the Laravel-side addition.
    return NextResponse.json(
      { message: "OTP login isn't set up on the backend yet — the /auth/otp-login endpoint is missing. See the README." },
      { status: 501 }
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "errors" in data
        ? (data as { errors?: { message?: string }[] }).errors?.[0]?.message
        : null) ?? "Could not complete sign-in. Please try again.";
    return NextResponse.json({ message }, { status: res.status });
  }

  return NextResponse.json(data);
}
