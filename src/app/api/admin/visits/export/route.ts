import { NextRequest, NextResponse } from "next/server";
import { isValidSession, ADMIN_SESSION_COOKIE } from "@/lib/settings/session.server";
import { queryVisits } from "@/lib/analytics/store.server";
import type { VisitRecord } from "@/lib/analytics/types";

const COLUMNS: { key: keyof VisitRecord; label: string }[] = [
  { key: "ts", label: "Date/Time (UTC)" },
  { key: "ip", label: "IP Address" },
  { key: "country", label: "Country Code" },
  { key: "countryName", label: "Country" },
  { key: "city", label: "City" },
  { key: "device", label: "Device" },
  { key: "browser", label: "Browser" },
  { key: "os", label: "OS" },
  { key: "path", label: "Page" },
  { key: "referrer", label: "Referrer URL" },
  { key: "referrerHost", label: "Referrer Source" },
  { key: "utmSource", label: "UTM Source" },
  { key: "utmMedium", label: "UTM Medium" },
  { key: "utmCampaign", label: "UTM Campaign" },
];

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Full, unpaginated CSV for the filtered date range — a real export needs
// every row, not just whatever page the on-screen table happens to be
// showing (see /api/admin/visits for the paginated view used there).
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await isValidSession(token))) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  if (!fromParam || !toParam) {
    return NextResponse.json({ message: "from and to are required (ISO datetimes)." }, { status: 400 });
  }
  const from = new Date(fromParam);
  const to = new Date(toParam);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ message: "Invalid from/to." }, { status: 400 });
  }

  const rows = await queryVisits(from, to);
  const lines = [
    COLUMNS.map((c) => csvEscape(c.label)).join(","),
    ...rows.map((r) => COLUMNS.map((c) => csvEscape(r[c.key])).join(",")),
  ];
  const csv = "﻿" + lines.join("\r\n"); // BOM so Excel opens UTF-8 correctly

  const filename = `visitors_${fromParam.slice(0, 10)}_to_${toParam.slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
