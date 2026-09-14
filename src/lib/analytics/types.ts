// One row per page view, appended by the tracking pipeline — see
// middleware.ts (captures the request) -> /api/track-visit (parses +
// persists it) -> store.server.ts (the JSON-lines file it lands in).
export interface VisitRecord {
  ts: string; // ISO timestamp
  path: string;
  ip: string;
  country: string; // ISO 3166-1 alpha-2 code, or "XX" when it can't be resolved (private/local IP, lookup miss)
  countryName: string; // human-readable, or "Unknown"
  city: string | null;
  referrer: string | null; // raw Referer header, or null for direct traffic
  referrerHost: string | null; // hostname only, for grouping ("google.com", "instagram.com", …) — null for direct
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  device: "mobile" | "tablet" | "desktop" | "unknown";
  browser: string; // e.g. "Chrome", "Safari" — "Unknown" if unparseable
  os: string; // e.g. "iOS", "Windows" — "Unknown" if unparseable
}

export type DateRangeKey = "today" | "yesterday" | "week" | "month" | "custom";

export interface VisitsSummary {
  total: number;
  uniqueIps: number;
  byCountry: { key: string; label: string; count: number }[];
  byReferrer: { key: string; label: string; count: number }[];
  byDevice: { key: string; label: string; count: number }[];
}
