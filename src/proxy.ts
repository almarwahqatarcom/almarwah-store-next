import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";

// Fires a fire-and-forget beacon to /api/track-visit on every real page
// navigation — proxy.ts (the file Next.js 16 renamed "middleware" to) runs
// for both a hard page load AND every client-side <Link> navigation in this
// app (every route here is server-rendered on demand, never fully static,
// so App Router always makes a server request for the new segment), which a
// one-shot call from the root layout Server Component would miss: the
// layout only runs once, on the very first load, not on subsequent
// client-side route changes.
//
// event.waitUntil() lets the POST keep running after this function returns
// — required because proxy must respond immediately, but the actual
// parsing + disk write happens in the API route and shouldn't add latency
// to the visitor's own navigation.
//
// The matcher below excludes framework/static assets, the API itself, and
// the admin dashboard (so the store owner's own visits to their own
// dashboard don't pollute their own visitor report).
export function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname, searchParams } = request.nextUrl;

  const payload = {
    path: pathname,
    referrer: request.headers.get("referer"),
    userAgent: request.headers.get("user-agent"),
    utmSource: searchParams.get("utm_source"),
    utmMedium: searchParams.get("utm_medium"),
    utmCampaign: searchParams.get("utm_campaign"),
  };

  const trackUrl = new URL("/api/track-visit", request.url);
  event.waitUntil(
    fetch(trackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Forwarded verbatim so the API route (running in the Node
        // runtime, where the real IP-extraction/geoip work happens) sees
        // the same client-IP signal this middleware request itself carried.
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        "x-real-ip": request.headers.get("x-real-ip") ?? "",
      },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Never let a tracking beacon failure affect the actual navigation.
    })
  );

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match every request except:
     * - /api/*        (including /api/track-visit itself — don't track the tracker)
     * - /admin*        (the store owner's own dashboard visits)
     * - /_next/static, /_next/image (framework assets)
     * - files with an extension (favicon.ico, robots.txt, sitemap.xml, images, etc.)
     */
    "/((?!api/|admin|_next/static|_next/image|.*\\..*).*)",
  ],
};
