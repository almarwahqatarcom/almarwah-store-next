import { NextRequest, NextResponse } from "next/server";
import { OtpConfigError, createChallenge, isPlausiblePhone, resendCooldownRemaining, sendOtpViaN8n } from "@/lib/otp";

export async function POST(req: NextRequest) {
  let body: { phone?: string; previousChallenge?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const phone = (body.phone ?? "").trim();
  if (!isPlausiblePhone(phone)) {
    return NextResponse.json({ message: "Please enter a valid phone number." }, { status: 400 });
  }

  const cooldown = resendCooldownRemaining(body.previousChallenge);
  if (cooldown) {
    return NextResponse.json(
      { message: `Please wait ${cooldown}s before requesting another code.`, retry_after: cooldown },
      { status: 429 }
    );
  }

  try {
    const { otp, challenge, expiresAt } = createChallenge(phone);
    const sent = await sendOtpViaN8n(phone, otp);
    if (!sent.ok) {
      return NextResponse.json({ message: sent.error }, { status: 502 });
    }
    return NextResponse.json({ challenge, expires_at: expiresAt });
  } catch (err) {
    if (err instanceof OtpConfigError) {
      return NextResponse.json({ message: err.message }, { status: 500 });
    }
    throw err;
  }
}
