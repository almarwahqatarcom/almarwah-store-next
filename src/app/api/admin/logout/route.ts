import { NextRequest, NextResponse } from "next/server";
import { destroySession, ADMIN_SESSION_COOKIE } from "@/lib/settings/session.server";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_SESSION_COOKIE);
  return res;
}
