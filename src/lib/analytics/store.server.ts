// Server-only. Visitor pageviews, persisted in Supabase (see
// src/lib/supabase.server.ts for the full rationale) instead of a local
// per-month JSON-Lines file (data/visits/YYYY-MM.jsonl) on this app's own
// disk. The file-based design — including a later SITE_DATA_DIR variant
// meant to survive a redeploy that re-clones the app folder — still
// assumed one server with one disk every request could see; this app is
// actually deployed on a serverless host where separate requests can land
// on separate, isolated instances with no shared disk between them at
// all, SITE_DATA_DIR or not. That's exactly why visits were "logged" (the
// write itself never errored) but never showed up in the admin report (a
// different instance read from, which never saw that write). A real,
// shared database every instance talks to fixes that — a write from any
// instance is immediately visible to a read from any other. Deliberately
// Next.js-only — no Laravel backend changes or deploys required.
import { getSupabase } from "@/lib/supabase.server";
import type { VisitRecord, VisitsSummary } from "./types";

const VISITS_TABLE = "storefront_visits";

// Supabase's own row shape (snake_case columns) — kept distinct from
// VisitRecord (this app's own camelCase type) so the mapping between them
// stays explicit in one place, mapRow() below.
interface VisitRow {
  visited_at: string;
  path: string;
  ip: string;
  country: string | null;
  country_name: string | null;
  city: string | null;
  referrer: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
}

function mapRow(r: VisitRow): VisitRecord {
  return {
    ts: r.visited_at,
    path: r.path,
    ip: r.ip,
    country: r.country || "XX",
    countryName: r.country_name || "Unknown",
    city: r.city,
    referrer: r.referrer,
    referrerHost: r.referrer_host,
    utmSource: r.utm_source,
    utmMedium: r.utm_medium,
    utmCampaign: r.utm_campaign,
    device: (r.device as VisitRecord["device"]) || "unknown",
    browser: r.browser || "Unknown",
    os: r.os || "Unknown",
  };
}

export async function logVisit(record: VisitRecord): Promise<void> {
  // Same defensive posture the caller (/api/track-visit) already wraps
  // this in — never let a tracking failure surface to the visitor — kept
  // here too since this is the one place that actually knows what
  // "failure" looks like for this specific call.
  try {
    await getSupabase()
      .from(VISITS_TABLE)
      .insert({
        visited_at: record.ts,
        path: record.path,
        ip: record.ip,
        country: record.country,
        country_name: record.countryName,
        city: record.city,
        referrer: record.referrer,
        referrer_host: record.referrerHost,
        utm_source: record.utmSource,
        utm_medium: record.utmMedium,
        utm_campaign: record.utmCampaign,
        device: record.device,
        browser: record.browser,
        os: record.os,
      });
  } catch {
    // never let a tracking failure surface to the visitor
  }
}

export async function queryVisits(from: Date, to: Date): Promise<VisitRecord[]> {
  try {
    const { data, error } = await getSupabase()
      .from(VISITS_TABLE)
      .select("*")
      .gte("visited_at", from.toISOString())
      .lte("visited_at", to.toISOString())
      .order("visited_at", { ascending: false })
      .limit(20000); // a generous cap — this backs an admin report, not a raw export of unbounded history
    if (error || !data) return [];
    return (data as VisitRow[]).map(mapRow);
  } catch {
    return [];
  }
}

export function summarize(rows: VisitRecord[]): VisitsSummary {
  const countryCounts = new Map<string, { label: string; count: number }>();
  const referrerCounts = new Map<string, { label: string; count: number }>();
  const deviceCounts = new Map<string, { label: string; count: number }>();
  const ips = new Set<string>();

  for (const r of rows) {
    ips.add(r.ip);

    const cKey = r.country || "XX";
    const cEntry = countryCounts.get(cKey) ?? { label: r.countryName || "Unknown", count: 0 };
    cEntry.count += 1;
    countryCounts.set(cKey, cEntry);

    const rKey = r.referrerHost || "direct";
    const rLabel = r.referrerHost || "Direct";
    const rEntry = referrerCounts.get(rKey) ?? { label: rLabel, count: 0 };
    rEntry.count += 1;
    referrerCounts.set(rKey, rEntry);

    const dKey = r.device || "unknown";
    const dEntry = deviceCounts.get(dKey) ?? { label: dKey, count: 0 };
    dEntry.count += 1;
    deviceCounts.set(dKey, dEntry);
  }

  const toSorted = (m: Map<string, { label: string; count: number }>) =>
    Array.from(m.entries())
      .map(([key, v]) => ({ key, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count);

  return {
    total: rows.length,
    uniqueIps: ips.size,
    byCountry: toSorted(countryCounts).slice(0, 10),
    byReferrer: toSorted(referrerCounts).slice(0, 10),
    byDevice: toSorted(deviceCounts),
  };
}
