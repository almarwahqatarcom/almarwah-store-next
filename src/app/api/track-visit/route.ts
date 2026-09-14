import { NextRequest, NextResponse } from "next/server";
import { parseVisit, extractClientIp } from "@/lib/analytics/parse.server";
import { logVisit } from "@/lib/analytics/store.server";
import { getSiteSettings } from "@/lib/settings/store.server";

// Called (fire-and-forget, via event.waitUntil) by middleware.ts on every
// real page navigation. Same defensive posture as the Laravel backend's own
// visitor heartbeat (VisitorTrackingController::heartbeat, read while
// researching this) — always 200, never let a tracking failure become a
// visible error, and do the actual work in a try/catch so one bad request
// can't take the endpoint down for the next visitor.
export async function POST(req: NextRequest) {
  try {
    const settings = await getSiteSettings();
    if (settings.visitorTrackingEnabled === false) {
      return NextResponse.json({ ok: true, tracking_enabled: false }, { status: 200 });
    }

    const body = await req.json();
    const path = typeof body.path === "string" ? body.path.slice(0, 500) : null;
    if (!path) return NextResponse.json({ ok: false }, { status: 200 });

    const ip = extractClientIp(req.headers);
    const record = parseVisit({
      path,
      ip,
      userAgent: typeof body.userAgent === "string" ? body.userAgent : null,
      referrer: typeof body.referrer === "string" ? body.referrer : null,
      utmSource: typeof body.utmSource === "string" ? body.utmSource : null,
      utmMedium: typeof body.utmMedium === "string" ? body.utmMedium : null,
      utmCampaign: typeof body.utmCampaign === "string" ? body.utmCampaign : null,
    });
    await logVisit(record);
  } catch {
    // Never surface a tracking failure to the visitor.
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
