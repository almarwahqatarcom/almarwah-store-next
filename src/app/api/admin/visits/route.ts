import { NextRequest, NextResponse } from "next/server";
import { isValidSession, ADMIN_SESSION_COOKIE } from "@/lib/settings/session.server";
import { queryVisits, summarize } from "@/lib/analytics/store.server";

// Visitor report data for the admin dashboard's Visitors tab — paginated
// rows plus aggregates over the full filtered range (not just the current
// page), so the summary cards stay accurate regardless of page size.
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

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize")) || 50));

  const rows = await queryVisits(from, to);
  const summary = summarize(rows);
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return NextResponse.json({
    rows: pageRows,
    total: rows.length,
    page,
    pageSize,
    summary,
  });
}
