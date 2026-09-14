"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DateRangeKey, VisitRecord, VisitsSummary } from "@/lib/analytics/types";

const PAGE_SIZE = 50;

const PRESETS: { key: Exclude<DateRangeKey, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// All computed in the browser's own local time, matching what "today" /
// "this week" intuitively mean to whoever is looking at the dashboard —
// converted to real Date instants only when sent to the API.
function presetRange(key: Exclude<DateRangeKey, "custom">): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (key === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (key === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (key === "week") {
    // Week starts Monday — matches the Flutter app's own delivery-slot week convention elsewhere in this codebase.
    const day = (now.getDay() + 6) % 7; // 0 = Monday
    const monday = new Date(now);
    monday.setDate(monday.getDate() - day);
    return { from: startOfDay(monday), to: endOfDay(now) };
  }
  // month
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: startOfDay(first), to: endOfDay(now) };
}

const DEVICE_ICON: Record<string, string> = { mobile: "📱", tablet: "📟", desktop: "🖥️", unknown: "❔" };

export default function VisitorsSection() {
  const [rangeKey, setRangeKey] = useState<DateRangeKey>("today");
  const today = useMemo(() => new Date(), []);
  const [customFrom, setCustomFrom] = useState(toDateInputValue(today));
  const [customTo, setCustomTo] = useState(toDateInputValue(today));
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<VisitRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<VisitsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { from, to } = useMemo(() => {
    if (rangeKey === "custom") {
      const f = new Date(`${customFrom}T00:00:00`);
      const t = new Date(`${customTo}T23:59:59.999`);
      return { from: f, to: t };
    }
    return presetRange(rangeKey);
  }, [rangeKey, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/admin/visits?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.rows);
      setTotal(data.total);
      setSummary(data.summary);
    } catch {
      setError("Couldn't load the visitor report. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [rangeKey, customFrom, customTo]);

  const exportHref = `/api/admin/visits/export?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      {/* Range picker */}
      <section className="bg-white border border-am-border rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-bold text-am-text">Visitor Report</h2>
          <a
            href={exportHref}
            className="bg-am-primary hover:bg-am-primary-dark text-white text-[13px] font-bold px-4 py-2 rounded-full transition-colors"
          >
            ⬇ Export CSV
          </a>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setRangeKey(p.key)}
              className={`text-[13px] font-semibold px-3.5 py-2 rounded-full border transition-colors ${
                rangeKey === p.key ? "border-am-primary bg-am-primary/10 text-am-primary-dark" : "border-am-border text-am-text-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setRangeKey("custom")}
            className={`text-[13px] font-semibold px-3.5 py-2 rounded-full border transition-colors ${
              rangeKey === "custom" ? "border-am-primary bg-am-primary/10 text-am-primary-dark" : "border-am-border text-am-text-muted"
            }`}
          >
            Custom Range
          </button>
        </div>
        {rangeKey === "custom" && (
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div>
              <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1">From</label>
              <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="border border-am-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1">To</label>
              <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className="border border-am-border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        )}
      </section>

      {error && <div className="bg-am-error/10 text-am-error text-[13px] rounded-lg px-4 py-2.5">{error}</div>}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total Visits" value={summary.total.toLocaleString()} />
          <SummaryCard label="Unique Visitors" value={summary.uniqueIps.toLocaleString()} />
          <SummaryCard label="Top Country" value={summary.byCountry[0]?.label ?? "—"} sub={summary.byCountry[0] ? `${summary.byCountry[0].count.toLocaleString()} visits` : undefined} />
          <SummaryCard label="Top Referrer" value={summary.byReferrer[0]?.label ?? "—"} sub={summary.byReferrer[0] ? `${summary.byReferrer[0].count.toLocaleString()} visits` : undefined} />
        </div>
      )}

      {/* Breakdown by country / referrer / device */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <BreakdownCard title="By Country" rows={summary.byCountry} total={summary.total} />
          <BreakdownCard title="By Referrer" rows={summary.byReferrer} total={summary.total} />
          <BreakdownCard
            title="By Device"
            rows={summary.byDevice.map((d) => ({ ...d, label: `${DEVICE_ICON[d.key] ?? ""} ${d.label}` }))}
            total={summary.total}
          />
        </div>
      )}

      {/* Table */}
      <section className="bg-white border border-am-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-am-bg text-am-text-muted text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-start px-4 py-3 font-bold">Time</th>
                <th className="text-start px-4 py-3 font-bold">IP</th>
                <th className="text-start px-4 py-3 font-bold">Country</th>
                <th className="text-start px-4 py-3 font-bold">Device</th>
                <th className="text-start px-4 py-3 font-bold">Referrer</th>
                <th className="text-start px-4 py-3 font-bold">Page</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-am-text-muted">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-am-text-muted">No visits in this range.</td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="border-t border-am-border">
                    <td className="px-4 py-2.5 whitespace-nowrap text-am-text-muted">{new Date(r.ts).toLocaleString()}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[12px]">{r.ip}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.countryName}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {DEVICE_ICON[r.device] ?? ""} {r.browser} · {r.os}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.referrerHost ?? "Direct"}</td>
                    <td className="px-4 py-2.5 max-w-[220px] truncate">{r.path}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-am-border text-[13px]">
            <span className="text-am-text-muted">
              Page {page} of {totalPages} · {total.toLocaleString()} visits
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg border border-am-border disabled:opacity-40 font-semibold">
                ← Prev
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg border border-am-border disabled:opacity-40 font-semibold">
                Next →
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-am-border rounded-2xl p-4">
      <div className="text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-bold text-am-text truncate" title={value}>{value}</div>
      {sub && <div className="text-[12px] text-am-text-faint mt-0.5">{sub}</div>}
    </div>
  );
}

function BreakdownCard({ title, rows, total }: { title: string; rows: { key: string; label: string; count: number }[]; total: number }) {
  return (
    <div className="bg-white border border-am-border rounded-2xl p-4">
      <div className="text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-3">{title}</div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-am-text-faint">No data.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.slice(0, 6).map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[12.5px] mb-0.5">
                  <span className="truncate">{r.label}</span>
                  <span className="text-am-text-muted shrink-0 ms-2">{r.count.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-am-bg rounded-full overflow-hidden">
                  <div className="h-full bg-am-primary rounded-full" style={{ width: `${total > 0 ? (r.count / total) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
