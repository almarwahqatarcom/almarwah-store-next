"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initGoogleAnalytics, trackPageView } from "@/lib/ga";

// Invisible — mirrors FacebookPixelTracker.tsx's own shape exactly. The
// measurement id is resolved server-side (admin's SEO settings — see
// layout.tsx) and passed in as a prop rather than fetched client-side.
export default function GoogleAnalyticsTracker({ gaId }: { gaId: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    initGoogleAnalytics(gaId);
  }, [gaId]);

  useEffect(() => {
    const query = searchParams.toString();
    trackPageView(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

  return null;
}
