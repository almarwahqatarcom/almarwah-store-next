"use client";

import { useEffect, useState } from "react";
import { useSiteSettings } from "@/lib/store/siteSettings";
import { useLanguage } from "@/lib/store/language";
import type { CountdownPromo } from "@/lib/settings/store.server";

// Finds the countdown promo (if any) that targets this product — directly,
// or via one of its categories — and is enabled. Doesn't check the time
// window here: that's done client-side every tick in the component below,
// since "is it currently running" needs the visitor's real clock, not the
// render time of a page that may be served from cache.
function findMatchingPromo(promos: CountdownPromo[] | undefined, productId: number, categoryIds: number[]): CountdownPromo | null {
  if (!promos) return null;
  return (
    promos.find(
      (p) => p.enabled && (p.productIds.includes(productId) || p.categoryIds.some((id) => categoryIds.includes(id)))
    ) ?? null
  );
}

function useCountdown(endAt: string) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    function tick() {
      setRemaining(Math.max(0, new Date(endAt).getTime() - Date.now()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endAt]);
  return remaining;
}

export default function CountdownPromoBanner({ productId, categoryIds }: { productId: number; categoryIds: number[] }) {
  const { countdownPromos } = useSiteSettings();
  const { t, locale } = useLanguage();
  const [copied, setCopied] = useState(false);

  const promo = findMatchingPromo(countdownPromos, productId, categoryIds);
  // A promo with no end date can never render (avoids a hook-count crash
  // from calling useCountdown conditionally) — harmless since a real promo
  // always has one, set below.
  const remaining = useCountdown(promo?.endAt ?? new Date(0).toISOString());

  if (!promo || remaining === null) return null;

  const now = Date.now();
  const started = now >= new Date(promo.startAt).getTime();
  const ended = remaining <= 0;
  if (!started || ended) return null;

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);
  const seconds = Math.floor((remaining / 1000) % 60);
  const pad = (n: number) => String(n).padStart(2, "0");

  const primary = promo.primaryText[locale] || promo.primaryText.en;
  const secondary = promo.secondaryText[locale] || promo.secondaryText.en;

  function copyCode() {
    navigator.clipboard?.writeText(promo!.couponCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const units = [
    { value: days, label: t("promo.days") },
    { value: hours, label: t("promo.hours") },
    { value: minutes, label: t("promo.minutes") },
    { value: seconds, label: t("promo.seconds") },
  ];

  const codeButton = (variant: "light" | "dark") => (
    <button
      onClick={copyCode}
      className={`mt-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12.5px] font-bold transition-colors ${
        variant === "light" ? "bg-white/20 hover:bg-white/30 text-white" : "bg-am-text/10 hover:bg-am-text/20 text-am-text"
      }`}
    >
      {copied ? `✓ ${t("promo.copied")}` : `${t("promo.useCode")}: ${promo!.couponCode}`}
    </button>
  );

  if (promo.design === 1) {
    return (
      <div
        className="rounded-2xl p-5 mb-6 text-white"
        style={{ background: "linear-gradient(135deg, #f45d7a 0%, #6a8dff 100%)" }}
      >
        <div className="font-bold text-lg">{primary}</div>
        <div className="text-[13px] opacity-90 mb-3">{secondary}</div>
        <div className="flex gap-2">
          {units.map((u) => (
            <div key={u.label} className="bg-white text-[#f45d7a] rounded-lg px-3 py-2 text-center min-w-[52px]">
              <div className="font-bold text-lg leading-none tabular-nums">{pad(u.value)}</div>
              <div className="text-[9px] font-bold uppercase tracking-wide mt-0.5">{u.label}</div>
            </div>
          ))}
        </div>
        {codeButton("light")}
      </div>
    );
  }

  if (promo.design === 2) {
    return (
      <div className="rounded-2xl p-5 mb-6 text-white bg-[#e8590c]">
        <div className="font-bold text-lg">{primary}</div>
        <div className="text-[13px] opacity-90 mb-3">{secondary}</div>
        <div className="inline-flex bg-white text-am-text rounded-lg overflow-hidden divide-x divide-am-border">
          {units.map((u) => (
            <div key={u.label} className="px-3 py-2 text-center min-w-[52px]">
              <div className="font-bold text-lg leading-none tabular-nums">{pad(u.value)}</div>
              <div className="text-[8.5px] font-bold uppercase tracking-wide mt-0.5 text-am-text-muted">{u.label}</div>
            </div>
          ))}
        </div>
        {codeButton("light")}
      </div>
    );
  }

  if (promo.design === 3) {
    return (
      <div className="rounded-2xl p-5 mb-6 text-white bg-[#0d1b2e] border border-am-success/40">
        <div className="font-bold text-lg">{primary}</div>
        <div className="text-[13px] opacity-80 mb-3">{secondary}</div>
        <div className="flex gap-2">
          {units.map((u) => (
            <div key={u.label} className="bg-[#1e5fd9] rounded-lg px-3 py-2 text-center min-w-[52px]">
              <div className="font-bold text-lg leading-none tabular-nums text-white">{pad(u.value)}</div>
              <div className="text-[9px] font-bold uppercase tracking-wide mt-0.5 text-white/80">{u.label}</div>
            </div>
          ))}
        </div>
        {codeButton("light")}
      </div>
    );
  }

  // design 4 — colon-separated digits, no individual unit boxes
  return (
    <div className="rounded-2xl p-5 mb-6 text-white bg-[#8b3fd9]">
      <div className="font-bold text-lg">{primary}</div>
      <div className="text-[13px] opacity-90 mb-3">{secondary}</div>
      <div className="flex items-center gap-1.5">
        {units.map((u, i) => (
          <div key={u.label} className="flex items-center gap-1.5">
            <div className="text-center min-w-[44px]">
              <div className="font-bold text-lg leading-none tabular-nums">{pad(u.value)}</div>
              <div className="text-[8.5px] font-bold uppercase tracking-wide mt-0.5 opacity-80">{u.label}</div>
            </div>
            {i < units.length - 1 && <span className="font-bold text-lg opacity-70 pb-3.5">:</span>}
          </div>
        ))}
      </div>
      {codeButton("light")}
    </div>
  );
}
