// Server-only. Turns the raw request bits middleware.ts forwards (path,
// user-agent, referer, client IP) into a stored VisitRecord — IP geolocation
// via geoip-lite (a bundled, offline country/city database — no external
// API call per pageview, no rate limit, works even if the visitor's own
// internet is otherwise fine but this server's outbound network isn't) and
// device/browser/OS via ua-parser-js.
import { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";
import type { VisitRecord } from "./types";

// A small, well-known table rather than a dependency just for this — only
// used to turn geoip-lite's ISO country code into a human-readable label
// for the admin's report. Codes geoip-lite can return that aren't in here
// (rare — it uses standard ISO 3166-1 alpha-2) just fall back to the raw code.
const COUNTRY_NAMES: Record<string, string> = {
  QA: "Qatar", SA: "Saudi Arabia", AE: "United Arab Emirates", KW: "Kuwait",
  BH: "Bahrain", OM: "Oman", EG: "Egypt", JO: "Jordan", LB: "Lebanon",
  IQ: "Iraq", SY: "Syria", YE: "Yemen", US: "United States", GB: "United Kingdom",
  IN: "India", PK: "Pakistan", BD: "Bangladesh", PH: "Philippines", NP: "Nepal",
  LK: "Sri Lanka", ID: "Indonesia", MY: "Malaysia", CN: "China", FR: "France",
  DE: "Germany", CA: "Canada", AU: "Australia", TR: "Turkey", RU: "Russia",
};

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip === "unknown"
  );
}

export function extractClientIp(headers: { get(name: string): string | null }): string {
  // x-forwarded-for can carry a chain ("client, proxy1, proxy2") — the
  // first entry is the original client. Falls back to x-real-ip (common
  // with a plain nginx/Apache reverse proxy, which is what this app runs
  // behind — see store.server.ts's own "single always-on Node process"
  // framing), then a literal "unknown" if neither is set (e.g. requests
  // hitting the Node process directly with no proxy in front).
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function parseVisit(input: {
  path: string;
  ip: string;
  userAgent: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}): VisitRecord {
  const ua = new UAParser(input.userAgent ?? "").getResult();
  const deviceType = ua.device.type; // "mobile" | "tablet" | "console" | "smarttv" | "wearable" | "embedded" | undefined
  const device: VisitRecord["device"] = deviceType === "mobile" ? "mobile" : deviceType === "tablet" ? "tablet" : deviceType ? "unknown" : "desktop";

  let country = "XX";
  let countryName = "Unknown";
  let city: string | null = null;
  if (!isPrivateIp(input.ip)) {
    const geo = geoip.lookup(input.ip);
    if (geo) {
      country = geo.country || "XX";
      countryName = COUNTRY_NAMES[country] || country;
      city = geo.city || null;
    }
  }

  let referrerHost: string | null = null;
  if (input.referrer) {
    try {
      referrerHost = new URL(input.referrer).hostname.replace(/^www\./, "");
    } catch {
      referrerHost = null;
    }
  }

  return {
    ts: new Date().toISOString(),
    path: input.path,
    ip: input.ip,
    country,
    countryName,
    city,
    referrer: input.referrer,
    referrerHost,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    device,
    browser: ua.browser.name || "Unknown",
    os: ua.os.name || "Unknown",
  };
}
