"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { startVisitorTracking, updateVisitorCurrentPage } from "@/lib/visitorTracking";

// Invisible — starts the heartbeat loop once for the whole site and reports
// every route change. See src/lib/visitorTracking.ts for the full mechanism.
export default function VisitorTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    startVisitorTracking();
  }, []);

  useEffect(() => {
    const query = searchParams.toString();
    updateVisitorCurrentPage(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

  return null;
}
