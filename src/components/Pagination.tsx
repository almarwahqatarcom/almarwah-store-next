"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const searchParams = useSearchParams();
  if (totalPages <= 1) return null;

  function hrefFor(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const linkCls = "px-3.5 py-2 rounded-lg text-[13px] font-semibold border transition-colors";
  const normal = `${linkCls} border-am-border text-am-text hover:border-am-primary hover:text-am-primary-dark`;
  const current = `${linkCls} bg-am-primary text-white border-am-primary`;
  const disabled = `${linkCls} border-am-border/60 text-am-text-faint cursor-not-allowed`;

  return (
    <div className="flex justify-center items-center gap-2 flex-wrap py-8">
      {page > 1 ? <Link href={hrefFor(page - 1)} className={normal}>← Prev</Link> : <span className={disabled}>← Prev</span>}
      {start > 1 && (
        <>
          <Link href={hrefFor(1)} className={normal}>1</Link>
          {start > 2 && <span className="px-1 text-am-text-faint">…</span>}
        </>
      )}
      {pages.map((p) => (p === page ? <span key={p} className={current}>{p}</span> : <Link key={p} href={hrefFor(p)} className={normal}>{p}</Link>))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-am-text-faint">…</span>}
          <Link href={hrefFor(totalPages)} className={normal}>{totalPages}</Link>
        </>
      )}
      {page < totalPages ? <Link href={hrefFor(page + 1)} className={normal}>Next →</Link> : <span className={disabled}>Next →</span>}
    </div>
  );
}
