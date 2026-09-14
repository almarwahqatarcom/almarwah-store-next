import { NextRequest, NextResponse } from "next/server";
import { OtpConfigError, createVerifiedToken, verifyChallenge } from "@/lib/otp";

export async function POST(req: NextRequest) {
  let body: { challenge?: string; otp?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const { challenge, otp } = body;
  if (!challenge || !otp) {
    return NextResponse.json({ message: "Missing verification code." }, { status: 400 });
  }

  try {
    const result = verifyChallenge(challenge, otp);
    if (!result.ok) {
      return NextResponse.json({ message: result.reason }, { status: 400 });
    }
    const verifiedToken = createVerifiedToken(result.phone);
    return NextResponse.json({ verified_token: verifiedToken, phone: result.phone });
  } catch (err) {
    if (err instanceof OtpConfigError) {
      return NextResponse.json({ message: err.message }, { status: 500 });
    }
    throw err;
  }
}
