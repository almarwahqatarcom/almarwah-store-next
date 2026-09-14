"use client";

import { useState } from "react";
import type { ExitOffer } from "@/lib/settings/store.server";
import { ExitOfferCard } from "@/components/ExitOfferCard";

export function emptyExitOffer(): ExitOffer {
  return {
    enabled: false,
    headline: { en: "Still thinking it over?", ar: "ما زلت تفكر؟" },
    body: { en: "Here's a special discount to help you complete your order.", ar: "إليك خصم خاص لمساعدتك على إتمام طلبك." },
    couponCode: "",
    discountType: "percent",
    discountValue: 10,
    triggerSeconds: 45,
  };
}

// A single "don't abandon your cart" offer — not a list, unlike Countdown
// Timers, since only one such popup makes sense to show a visitor at a
// time. It appears ON THE CHECKOUT PAGE ITSELF after `triggerSeconds` of
// sitting there without placing the order (not a sitewide exit-intent
// popup — a checkout-abandonment timer is a far stronger "about to leave
// without buying" signal than a mouse twitch anywhere on the site).
//
// Everything here (including Enabled) is held in local draft state and
// commits together with one explicit "Save Offer" click — deliberately NOT
// split between an instant-saving toggle and a deferred-until-"Save
// Changes" set of text fields, which was the exact bug a real admin hit:
// switching Enabled on saved that instantly with whatever coupon code
// existed at that moment (often still blank), while the headline/coupon
// text typed afterward sat in unsaved local state — so the popup went
// live but with no code, and looked broken. One button, one save, no
// partial state possible.
export default function ExitOfferSection({ offer, onSave }: { offer: ExitOffer; onSave: (offer: ExitOffer) => void }) {
  const [draft, setDraft] = useState<ExitOffer>(offer);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  function update<K extends keyof ExitOffer>(key: K, value: ExitOffer[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const canEnable = draft.couponCode.trim().length > 0;

  function save() {
    onSave(draft);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  }

  return (
    <section className="bg-white border border-am-border rounded-2xl p-6">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h2 className="font-bold text-am-text">Checkout Abandonment Offer</h2>
        <button
          onClick={() => update("enabled", !draft.enabled)}
          disabled={!draft.enabled && !canEnable}
          role="switch"
          aria-checked={draft.enabled}
          title={
            !draft.enabled && !canEnable
              ? "Add a coupon code below before enabling"
              : draft.enabled
                ? "Enabled — click to disable"
                : "Disabled — click to enable"
          }
          className={`relative w-9 h-5 rounded-full shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${draft.enabled ? "bg-am-success" : "bg-am-border"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${draft.enabled ? "start-[18px]" : "start-0.5"}`} />
        </button>
      </div>
      <p className="text-[12px] text-am-text-muted mb-4">
        Shown once per visit, directly on the checkout page, after a visitor has sat there this long without placing the order — a last-chance
        coupon offer, in both languages, applied immediately if they choose it. Nothing below takes effect until you click "Save Offer".
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Headline — English</label>
          <input
            type="text"
            value={draft.headline.en}
            onChange={(e) => update("headline", { ...draft.headline, en: e.target.value })}
            className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
          />
        </div>
        <div dir="rtl">
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Headline — العربية</label>
          <input
            type="text"
            value={draft.headline.ar}
            onChange={(e) => update("headline", { ...draft.headline, ar: e.target.value })}
            className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Message — English</label>
          <input
            type="text"
            value={draft.body.en}
            onChange={(e) => update("body", { ...draft.body, en: e.target.value })}
            className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
          />
        </div>
        <div dir="rtl">
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Message — العربية</label>
          <input
            type="text"
            value={draft.body.ar}
            onChange={(e) => update("body", { ...draft.body, ar: e.target.value })}
            className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
          />
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
          placeholder="e.g. COMEBACK10"
          className="w-full max-w-sm border border-am-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-am-primary"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-sm mt-4">
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Discount type (display only)</label>
          <select
            value={draft.discountType}
            onChange={(e) => update("discountType", e.target.value as "percent" | "amount")}
            className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
          >
            <option value="percent">Percent (%)</option>
            <option value="amount">Fixed amount</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Value</label>
          <input
            type="number"
            min={0}
            value={draft.discountValue}
            onChange={(e) => update("discountValue", Number(e.target.value))}
            className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
          />
        </div>
      </div>

      <div className="max-w-sm mt-4 mb-5">
        <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">
          Show after this many seconds on checkout, unpurchased
        </label>
        <input
          type="number"
          min={5}
          value={draft.triggerSeconds ?? 45}
          onChange={(e) => update("triggerSeconds", Math.max(5, Number(e.target.value)))}
          className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
        />
        <p className="text-[11px] text-am-text-faint mt-1">Cancelled automatically the moment they place the order or leave checkout.</p>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-am-border flex-wrap">
        <button
          onClick={save}
          className="bg-am-primary hover:bg-am-primary-dark text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors"
        >
          Save Offer
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="border border-am-border hover:border-am-primary text-am-text font-semibold px-5 py-2.5 rounded-full text-sm transition-colors"
        >
          👁 Preview
        </button>
        {savedAt && <span className="text-am-success text-[12.5px] font-semibold">✓ Saved.</span>}
        {!canEnable && <span className="text-[11.5px] text-am-text-faint">Add a coupon code to enable this offer.</span>}
      </div>

      {/* Shows exactly what shoppers will see — the current unsaved draft,
          not what's saved — with no timer and no sessionStorage check to
          fight. This is the reliable way to verify the offer looks right;
          the real popup on /checkout is deliberately gated (see
          CheckoutAbandonmentOffer.tsx) and can silently stay hidden in a
          tab that's already seen it. */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-[90] bg-am-text/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false);
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <span className="text-white text-[12px] font-bold uppercase tracking-wide bg-am-text/40 px-3 py-1 rounded-full">Preview — not visible to shoppers</span>
            <ExitOfferCard offer={draft} applied={false} onApply={() => {}} onClose={() => setPreviewOpen(false)} />
          </div>
        </div>
      )}
    </section>
  );
}
