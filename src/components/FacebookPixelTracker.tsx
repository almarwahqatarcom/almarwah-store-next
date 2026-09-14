"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initFacebookPixel, trackPageView } from "@/lib/fbPixel";

// Invisible — loads the Pixel once (id resolved server-side in layout.tsx,
// since a client-side fetch of the id file is blocked by CORS — see
// src/lib/api.ts's getFacebookPixelId()) and reports every client-side
// route change as a PageView, since Next's App Router navigations don't
// trigger a real page load that fbevents.js could see on its own.
export default function FacebookPixelTracker({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    initFacebookPixel(pixelId);
  }, [pixelId]);

  useEffect(() => {
    // initFacebookPixel() already fires one PageView itself once the
    // Pixel loads — skip the redundant one for the page that was already
    // being viewed when the app first mounted.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    trackPageView();
  }, [pathname, searchParams]);

  return null;
}
