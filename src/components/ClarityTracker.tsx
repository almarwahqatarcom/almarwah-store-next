"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initClarity, identifyClarityUser } from "@/lib/clarity";
import { useAuthStore } from "@/lib/store/auth";

// Invisible — mirrors GoogleAnalyticsTracker.tsx/FacebookPixelTracker.tsx's
// own shape, with one deliberate difference: "only for the front end" was
// asked for explicitly, so this never initializes Clarity while the
// CURRENT route is /admin. Honest limitation, not silently glossed over:
// this is a client-side check on a route that can be reached by an
// in-app <Link> navigation (no full page reload) from the storefront —
// if Clarity already started recording on a storefront page in this same
// browser tab, then the admin navigates to /admin without closing the
// tab, that already-running session keeps recording (Clarity has no
// official "stop" API to call here). What this reliably prevents is the
// far more common case: a browser tab that opens directly on /admin
// (a bookmark, a fresh tab) never starts a Clarity session at all.
export default function ClarityTracker({ clarityId }: { clarityId: string | null }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (isAdminRoute) return;
    initClarity(clarityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clarityId, isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute || !userId) return;
    // An opaque real account id only — see identifyClarityUser()'s own
    // docblock for why this is never a name/phone/email.
    identifyClarityUser(String(userId));
  }, [isAdminRoute, userId]);

  return null;
}
