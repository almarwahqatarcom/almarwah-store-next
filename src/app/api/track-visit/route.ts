import { NextRequest, NextResponse } from "next/server";
import { parseVisit, extractClientIp } from "@/lib/analytics/parse.server";
import { logVisit } from "@/lib/analytics/store.server";
import { getSiteSettings } from "@/lib/settings/store.server";

// A public, unauthenticated beacon (anyone can POST here directly, not just
// this app's own proxy.ts) — cap how often any one IP can actually cause a
// disk write, so someone hammering the endpoint can grow the visit log at
// most this fast rather than unboundedly. Deliberately simple: an in-memory
// map, reset on every server restart/deploy — good enough as a deterrent
// for a store at this scale, not meant to replace a real rate-limiting
// layer (a CDN/WAF in front of production would be the real fix for that).
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 20;
const hitsByIp = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  hitsByIp.set(ip, hits);
  // Opportunistic cleanup so this map doesn't grow forever across many
  // distinct IPs — cheap enough to do on a small fraction of requests.
  if (hitsByIp.size > 5000 && Math.random() < 0.01) {
    for (const [k, v] of hitsByIp) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hitsByIp.delete(k);
    }
  }
  return hits.length > RATE_LIMIT_MAX;
}

function capString(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.slice(0, max) : null;
}

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

    const ip = extractClientIp(req.headers);
    if (rateLimited(ip)) return NextResponse.json({ ok: true }, { status: 200 });

    const body = await req.json();
    const path = capString(body.path, 500);
    if (!path) return NextResponse.json({ ok: false }, { status: 200 });

    const record = parseVisit({
      path,
      ip,
      userAgent: capString(body.userAgent, 300),
      referrer: capString(body.referrer, 500),
      utmSource: capString(body.utmSource, 150),
      utmMedium: capString(body.utmMedium, 150),
      utmCampaign: capString(body.utmCampaign, 150),
    });
    await logVisit(record);
  } catch {
    // Never surface a tracking failure to the visitor.
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
