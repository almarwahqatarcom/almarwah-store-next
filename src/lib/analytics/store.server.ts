// Server-only. Visitor pageviews, one JSON object per line (JSON Lines —
// not a single JSON array) appended to a file per calendar month
// (data/visits/YYYY-MM.jsonl). Line-append is O(1) regardless of how big
// the file already is, unlike the single-JSON-file pattern site-settings.ts
// uses — the right tradeoff here since this file is written on nearly every
// pageview (frequent, tiny writes) rather than occasionally from an admin
// form (rare, whole-object writes). Monthly rotation also means a report
// for "this month" only ever has to read one file, not the whole history.
import { promises as fs } from "fs";
import path from "path";
import type { VisitRecord, VisitsSummary } from "./types";

const DIR = path.join(process.cwd(), "data", "visits");

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthFile(key: string): string {
  return path.join(DIR, `${key}.jsonl`);
}

// Every calendar month touched by [from, to], inclusive — usually one, two
// at the edge of a month boundary, or a handful for a wide custom range.
function monthsBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= end) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

export async function logVisit(record: VisitRecord): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const file = monthFile(monthKey(new Date(record.ts)));
  await fs.appendFile(file, JSON.stringify(record) + "\n", "utf8");
}

// Reads every month file that overlaps [from, to] and returns the rows
// actually inside that window, newest first. Malformed lines (a partial
// write from a crash mid-append, say) are skipped rather than failing the
// whole report — a broken analytics page is a worse outcome than one
// missing row.
export async function queryVisits(from: Date, to: Date): Promise<VisitRecord[]> {
  const keys = monthsBetween(from, to);
  const fromTime = from.getTime();
  const toTime = to.getTime();
  const rows: VisitRecord[] = [];

  for (const key of keys) {
    let raw: string;
    try {
      raw = await fs.readFile(monthFile(key), "utf8");
    } catch {
      continue; // no visits logged that month
    }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as VisitRecord;
        const t = new Date(rec.ts).getTime();
        if (t >= fromTime && t <= toTime) rows.push(rec);
      } catch {
        // skip malformed line
      }
    }
  }

  rows.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return rows;
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
