// Server-only. Visitor pageviews, persisted through the real Laravel
// backend (StorefrontController::logVisit/getVisits — see that
// controller's docblock) instead of a local per-month JSON-Lines file
// (data/visits/YYYY-MM.jsonl) on this app's own disk. The file-based
// design — including a later SITE_DATA_DIR variant meant to survive a
// redeploy that re-clones the app folder — still assumed one server with
// one disk every request could see; this app is actually deployed on a
// serverless host where separate requests can land on separate, isolated
// instances with no shared disk between them at all, SITE_DATA_DIR or not.
// That's exactly why visits were "logged" (the write itself never
// errored) but never showed up in the admin report (a different instance
// read from, which never saw that write). Routing through the backend's
// own database — one real, shared store every instance talks to — fixes
// that: a write from any instance is immediately visible to a read from
// any other.
import { API_BASE } from "@/lib/api";
import type { VisitRecord, VisitsSummary } from "./types";

const STOREFRONT_API_SECRET = process.env.STOREFRONT_API_SECRET ?? "";

function authHeaders(): Record<string, string> {
  return { "X-Storefront-Internal-Secret": STOREFRONT_API_SECRET };
}

export async function logVisit(record: VisitRecord): Promise<void> {
  // Same defensive posture the caller (/api/track-visit) already wraps
  // this in — never let a tracking failure surface to the visitor — kept
  // here too since logVisit is the one place that actually knows what
  // "failure" looks like for this specific call.
  await fetch(`${API_BASE}/storefront/visits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
    cache: "no-store",
  });
}

// Backend returns rows already in VisitRecord's own field shape (see
// StorefrontController::getVisits), newest first — no reshaping needed
// here, just the HTTP round trip the local-file version used to do as a
// directory read.
export async function queryVisits(from: Date, to: Date): Promise<VisitRecord[]> {
  try {
    const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    const res = await fetch(`${API_BASE}/storefront/visits?${qs}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as VisitRecord[];
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
