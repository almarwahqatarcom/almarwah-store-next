import { NextRequest, NextResponse } from "next/server";
import { isValidSession, ADMIN_SESSION_COOKIE } from "@/lib/settings/session.server";
import { getSiteSettings, saveSiteSettings, type SiteSettings } from "@/lib/settings/store.server";

// Public read — every page's layout needs these overrides to render
// correctly for every visitor, not just the logged-in admin.
export async function GET() {
  const settings = await getSiteSettings();
  return NextResponse.json(settings);
}

// Write requires a valid admin session — this is the one endpoint that
// actually changes what every visitor sees, so it's the one that must be
// protected.
export async function POST(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await isValidSession(token))) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  let body: SiteSettings;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  try {
    const saved = await saveSiteSettings(body);
    return NextResponse.json(saved);
  } catch (err) {
    // saveSiteSettings throws when the Laravel backend rejects or can't be
    // reached (see that function's own comment) — surfaced here as a clear
    // message instead of a raw 500, since "nothing happened" with no
    // explanation is exactly the confusing failure mode this whole storage
    // migration exists to get rid of.
    console.error("saveSiteSettings failed:", err);
    return NextResponse.json({ message: "Couldn't save — the storage backend is unreachable or rejected the change. Try again shortly." }, { status: 502 });
  }
}
