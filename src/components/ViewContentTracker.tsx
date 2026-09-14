"use client";

import { useEffect } from "react";
import { trackViewContent } from "@/lib/fbPixel";

// Product detail pages are server components (they fetch data at request
// time), so the Pixel's ViewContent event — which needs the browser's
// window.fbq — is fired from this tiny client child instead of inline in
// the page itself.
export default function ViewContentTracker({ id, name, value }: { id: number; name: string; value: number }) {
  useEffect(() => {
    trackViewContent({ content_ids: [id], content_name: name, value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return null;
}
