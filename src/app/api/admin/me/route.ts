import { NextRequest, NextResponse } from "next/server";
import { isValidSession, ADMIN_SESSION_COOKIE } from "@/lib/settings/session.server";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = await isValidSession(token);
  return NextResponse.json({ authenticated });
}
