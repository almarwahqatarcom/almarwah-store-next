"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { Category, Product } from "@/lib/types";
import type { CountdownPromo } from "@/lib/settings/store.server";

const DESIGN_PREVIEWS: Record<CountdownPromo["design"], { name: string; className: string; boxClassName: string }> = {
  1: { name: "Exclusive Deals (Gradient)", className: "bg-gradient-to-br from-[#f45d7a] to-[#6a8dff]", boxClassName: "bg-white text-[#f45d7a]" },
  2: { name: "Exclusive Deals (Orange)", className: "bg-[#e8590c]", boxClassName: "bg-white text-am-text" },
  3: { name: "Premium Collection", className: "bg-[#0d1b2e] border border-am-success/40", boxClassName: "bg-[#1e5fd9] text-white" },
  4: { name: "Elite Selection", className: "bg-[#8b3fd9]", boxClassName: "" },
};

function emptyPromo(): CountdownPromo {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: `promo_${Date.now()}`,
    enabled: true,
    productIds: [],
    categoryIds: [],
    startAt: now.toISOString().slice(0, 16),
    endAt: in7Days.toISOString().slice(0, 16),
    couponCode: "",
    discountType: "percent",
    discountValue: 10,
    design: 1,
    primaryText: { en: "Exclusive Deal", ar: "عرض حصري" },
    secondaryText: { en: "Available for a limited time only!", ar: "متوفر لفترة محدودة فقط!" },
  };
}

// A tiny live preview of one design, at the size it renders in the editor —
// same 4 layouts as CountdownPromoBanner.tsx, just non-interactive and with
// fixed placeholder digits (02:23:55:05) instead of a real ticking clock.
function DesignPreview({ design, primary, secondary }: { design: CountdownPromo["design"]; primary: string; secondary: string }) {
  const units = [
    { value: "02", label: "DAYS" },
    { value: "23", label: "HOURS" },
    { value: "55", label: "MINUTES" },
    { value: "05", label: "SECONDS" },
  ];
  const preview = DESIGN_PREVIEWS[design];
  return (
    <div className={`rounded-xl p-3.5 text-white text-left ${preview.className}`}>
      <div className="font-bold text-[13px]">{primary || "Exclusive Deal"}</div>
      <div className="text-[10.5px] opacity-90 mb-2">{secondary || "Available for a limited time only!"}</div>
      {design === 4 ? (
        <div className="flex items-center gap-1">
          {units.map((u, i) => (
            <div key={u.label} className="flex items-center gap-1">
              <div className="text-center min-w-[28px]">
                <div className="font-bold text-[13px] leading-none">{u.value}</div>
              </div>
              {i < units.length - 1 && <span className="text-[13px] opacity-70">:</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className={`flex gap-1 ${design === 2 ? "inline-flex rounded-md overflow-hidden divide-x divide-am-border" : ""}`}>
          {units.map((u) => (
            <div key={u.label} className={`rounded-md px-1.5 py-1 text-center min-w-[30px] ${preview.boxClassName}`}>
              <div className="font-bold text-[12px] leading-none">{u.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductPicker({ selected, onChange }: { selected: number[]; onChange: (ids: number[]) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Loads display names for already-selected ids once (e.g. when editing
    // an existing promo) — otherwise the chips below would only show bare
    // numbers until the admin happens to search for them again.
    const missing = selected.filter((id) => !selectedProducts[id]);
    if (missing.length === 0) return;
    Promise.all(missing.map((id) => api.getProductDetails(id).catch(() => null))).then((products) => {
      setSelectedProducts((prev) => {
        const next = { ...prev };
        products.forEach((p, i) => {
          if (p) next[missing[i]] = p.name;
        });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      api
        .searchProducts(query.trim(), 15, 1)
        .then((r) => setResults(r.products))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  function toggle(product: Product) {
    setSelectedProducts((prev) => ({ ...prev, [product.id]: product.name }));
    if (selected.includes(product.id)) {
      onChange(selected.filter((id) => id !== product.id));
    } else {
      onChange([...selected, product.id]);
    }
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products by name…"
        className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary mb-2"
      />
      {loading && <p className="text-[11.5px] text-am-text-muted mb-2">Searching…</p>}
      {results.length > 0 && (
        <div className="border border-am-border rounded-lg max-h-40 overflow-y-auto mb-2">
          {results.map((p) => (
            <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-am-bg cursor-pointer border-b border-am-border last:border-0">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p)} />
              {p.name}
            </label>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 bg-am-primary-light text-am-primary-dark text-[11.5px] font-semibold px-2.5 py-1 rounded-full">
              {selectedProducts[id] ?? `#${id}`}
              <button onClick={() => onChange(selected.filter((x) => x !== id))} aria-label="Remove" className="hover:text-am-error">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryPicker({ selected, onChange }: { selected: number[]; onChange: (ids: number[]) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="border border-am-border rounded-lg max-h-40 overflow-y-auto">
      {categories.map((c) => (
        <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-am-bg cursor-pointer border-b border-am-border last:border-0">
          <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
          {c.name}
        </label>
      ))}
    </div>
  );
}

function PromoForm({ promo, onSave, onCancel }: { promo: CountdownPromo; onSave: (p: CountdownPromo) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<CountdownPromo>(promo);

  function update<K extends keyof CountdownPromo>(key: K, value: CountdownPromo[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const canSave = draft.couponCode.trim().length > 0 && (draft.productIds.length > 0 || draft.categoryIds.length > 0);

  return (
    <div className="border border-am-primary/40 rounded-xl p-5 bg-am-primary-light/20 flex flex-col gap-4">
      <div>
        <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Select Countdown Design</label>
        <div className="grid grid-cols-2 gap-3">
          {([1, 2, 3, 4] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => update("design", d)}
              className={`text-left rounded-xl transition-all ${draft.design === d ? "ring-2 ring-am-primary" : "opacity-80 hover:opacity-100"}`}
            >
              <DesignPreview design={d} primary={draft.primaryText.en} secondary={draft.secondaryText.en} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Headline — English</label>
          <input type="text" value={draft.primaryText.en} onChange={(e) => update("primaryText", { ...draft.primaryText, en: e.target.value })} className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary" />
        </div>
        <div dir="rtl">
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Headline — العربية</label>
          <input type="text" value={draft.primaryText.ar} onChange={(e) => update("primaryText", { ...draft.primaryText, ar: e.target.value })} className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Subtext — English</label>
          <input type="text" value={draft.secondaryText.en} onChange={(e) => update("secondaryText", { ...draft.secondaryText, en: e.target.value })} className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary" />
        </div>
        <div dir="rtl">
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Subtext — العربية</label>
          <input type="text" value={draft.secondaryText.ar} onChange={(e) => update("secondaryText", { ...draft.secondaryText, ar: e.target.value })} className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Start date & time</label>
          <input type="datetime-local" value={draft.startAt.slice(0, 16)} onChange={(e) => update("startAt", e.target.value)} className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">End date & time</label>
          <input type="datetime-local" value={draft.endAt.slice(0, 16)} onChange={(e) => update("endAt", e.target.value)} className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary" />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">
          Coupon code — must already exist as a real coupon in the admin.almarwah.qa panel
        </label>
        <input
          type="text"
          value={draft.couponCode}
          onChange={(e) => update("couponCode", e.target.value.toUpperCase())}
          placeholder="e.g. FLASH20"
          className="w-full border border-am-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-am-primary"
        />
        <p className="text-[11px] text-am-text-muted mt-1">
          This dashboard cannot create backend coupons — it can only advertise one and restrict it to the product(s)/category(ies) below at checkout on this website.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-sm">
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Discount type (display only)</label>
          <select value={draft.discountType} onChange={(e) => update("discountType", e.target.value as "percent" | "amount")} className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary">
            <option value="percent">Percent (%)</option>
            <option value="amount">Fixed amount</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Value</label>
          <input type="number" min={0} value={draft.discountValue} onChange={(e) => update("discountValue", Number(e.target.value))} className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Applies to products</label>
          <ProductPicker selected={draft.productIds} onChange={(ids) => update("productIds", ids)} />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Applies to categories</label>
          <CategoryPicker selected={draft.categoryIds} onChange={(ids) => update("categoryIds", ids)} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px] font-semibold">
        <input type="checkbox" checked={draft.enabled} onChange={(e) => update("enabled", e.target.checked)} />
        Enabled (visible on the site)
      </label>

      <div className="flex items-center gap-3 pt-2 border-t border-am-border">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => onSave(draft)}
          className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors"
        >
          Save Countdown
        </button>
        <button type="button" onClick={onCancel} className="text-am-text-muted text-sm font-semibold hover:underline">
          Cancel
        </button>
        {!canSave && <span className="text-[11.5px] text-am-error">Coupon code and at least one product or category are required.</span>}
      </div>
    </div>
  );
}

export default function CountdownPromosSection({ promos, onChange }: { promos: CountdownPromo[]; onChange: (promos: CountdownPromo[]) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftForNew, setDraftForNew] = useState<CountdownPromo | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [siteOrigin, setSiteOrigin] = useState("");

  useEffect(() => {
    setSiteOrigin(window.location.origin);
  }, []);

  function startNew() {
    const p = emptyPromo();
    setDraftForNew(p);
    setEditingId(p.id);
  }

  function save(updated: CountdownPromo) {
    const exists = promos.some((p) => p.id === updated.id);
    onChange(exists ? promos.map((p) => (p.id === updated.id ? updated : p)) : [...promos, updated]);
    setEditingId(null);
    setDraftForNew(null);
  }

  function remove(id: string) {
    onChange(promos.filter((p) => p.id !== id));
  }

  // Flips enabled/disabled straight from the summary card — no need to
  // open the edit form just to pause or resume a promo.
  function toggleEnabled(id: string) {
    onChange(promos.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  }

  // The one link worth copying for a given promo: its first specific
  // product if it targets any, otherwise its first category page. A promo
  // with neither can't happen — PromoForm requires at least one before it
  // can be saved.
  function linkFor(p: CountdownPromo): string | null {
    if (p.productIds[0] != null) return `/product/${p.productIds[0]}`;
    if (p.categoryIds[0] != null) return `/category/${p.categoryIds[0]}`;
    return null;
  }

  function copyLink(id: string, href: string) {
    navigator.clipboard?.writeText(`${siteOrigin}${href}`).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <section className="bg-white border border-am-border rounded-2xl p-6">
      <h2 className="font-bold text-am-text mb-1">Countdown Timer</h2>
      <p className="text-[12px] text-am-text-muted mb-4">
        Customize a countdown timer + coupon code shown on a single product page. Create as many as you need — each targets its own product(s)/category(ies).
      </p>

      <div className="flex flex-col gap-3 mb-4">
        {promos.map((p) => (
          <div key={p.id}>
            {editingId === p.id ? (
              <PromoForm promo={p} onSave={save} onCancel={() => setEditingId(null)} />
            ) : (
              <div className="flex items-center justify-between gap-3 border border-am-border rounded-xl p-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => toggleEnabled(p.id)}
                      role="switch"
                      aria-checked={p.enabled}
                      title={p.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${p.enabled ? "bg-am-success" : "bg-am-border"}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${p.enabled ? "start-[18px]" : "start-0.5"}`} />
                    </button>
                    <span className={`text-[10.5px] font-bold ${p.enabled ? "text-am-success" : "text-am-text-muted"}`}>{p.enabled ? "Enabled" : "Disabled"}</span>
                    <span className="font-semibold text-sm text-am-text truncate">{p.primaryText.en || "(no headline)"}</span>
                    <span className="font-mono text-[12px] text-am-primary-dark">{p.couponCode}</span>
                  </div>
                  <p className="text-[11.5px] text-am-text-muted mt-1">
                    {p.productIds.length} product(s), {p.categoryIds.length} categor{p.categoryIds.length === 1 ? "y" : "ies"} · {new Date(p.startAt).toLocaleString()} → {new Date(p.endAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {linkFor(p) && (
                    <button
                      onClick={() => copyLink(p.id, linkFor(p)!)}
                      className={`text-[12px] font-bold px-3.5 py-2 rounded-full transition-colors ${
                        copiedId === p.id ? "bg-am-success/10 text-am-success" : "bg-am-primary-light text-am-primary-dark hover:bg-am-primary hover:text-white"
                      }`}
                    >
                      {copiedId === p.id ? "✓ Copied" : "🔗 Copy Link"}
                    </button>
                  )}
                  <button onClick={() => setEditingId(p.id)} className="text-[12.5px] font-semibold text-am-primary-dark hover:underline">
                    Edit
                  </button>
                  <button onClick={() => remove(p.id)} className="text-[12.5px] font-semibold text-am-error hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {editingId && draftForNew && editingId === draftForNew.id ? (
        <PromoForm promo={draftForNew} onSave={save} onCancel={() => { setEditingId(null); setDraftForNew(null); }} />
      ) : (
        <button onClick={startNew} className="text-[13px] font-semibold text-am-primary-dark hover:underline">
          + Add Countdown Timer
        </button>
      )}
    </section>
  );
}
