"use client";

// Google Analytics 4 (gtag.js) integration — same "admin sets just the id,
// this module builds the real snippet" shape as fbPixel.ts. GA4 (unlike
// Universal Analytics) needs an explicit page_view event on every
// client-side route change: App Router navigations don't reload the page,
// so gtag's own automatic pageview-on-load never fires for them — same
// underlying reason FacebookPixelTracker.tsx has to call trackPageView()
// itself on every route change instead of relying on fbevents.js alone.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let gaId: string | null = null;

function injectGaScript(id: string) {
  if (window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  // send_page_view: false — this module fires page_view itself on every
  // route change (see trackPageView below), so the automatic one gtag
  // would otherwise send for the initial load is skipped to avoid a
  // duplicate for that same first page.
  window.gtag("config", id, { send_page_view: false });
}

/** Call once, given the id from admin settings. A falsy id is a safe no-op. Idempotent. */
export function initGoogleAnalytics(id: string | null | undefined) {
  if (!id || gaId) return;
  gaId = id;
  injectGaScript(id);
}

/** Call on the initial load and on every subsequent client-side route change. */
export function trackPageView(path: string) {
  if (!gaId || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", { page_path: path });
}
