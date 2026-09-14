"use client";

import { useLanguage } from "@/lib/store/language";
import { formatCurrency } from "@/lib/api";
import { useStoreConfig } from "@/lib/store/config";
import type { ExitOffer } from "@/lib/settings/store.server";

// The actual visual card — extracted so the real runtime popup
// (CheckoutAbandonmentOffer.tsx, timer + sessionStorage + portal) and the
// admin dashboard's instant "Preview" (ExitOfferSection.tsx, no timer, no
// storage, just the current draft) render pixel-identically. Before this
// split, the only way for an admin to see what they'd built was to visit
// checkout and wait — and sessionStorage would silently suppress a second
// look, which is exactly what made a real "I enabled it, it didn't open"
// report so confusing to debug.
export function ExitOfferCard({
  offer,
  applied,
  onApply,
  onClose,
}: {
  offer: Pick<ExitOffer, "headline" | "body" | "couponCode" | "discountType" | "discountValue">;
  applied: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const { config } = useStoreConfig();
  const { t, locale } = useLanguage();

  const headline = offer.headline[locale] || offer.headline.en;
  const body = offer.body[locale] || offer.body.en;
  const discountLabel = offer.discountType === "amount" ? formatCurrency(offer.discountValue, config) : `${offer.discountValue}%`;

  return (
    <div className="bg-white rounded-3xl shadow-2xl max-w-[440px] w-full p-8 text-center relative am-fade-in">
      <button
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute top-4 end-4 w-8 h-8 rounded-full flex items-center justify-center text-am-text-muted hover:bg-am-bg hover:text-am-text transition-colors"
      >
        ✕
      </button>

      {!applied ? (
        <>
          <div className="text-4xl mb-4">🎁</div>
          <h2 className="text-xl font-bold text-am-text mb-2">{headline || "—"}</h2>
          <p className="text-[13.5px] text-am-text-muted mb-6 leading-relaxed">{body || "—"}</p>

          <div className="bg-am-bg border-2 border-dashed border-am-primary rounded-2xl py-4 mb-6">
            <div className="text-[11px] font-bold uppercase tracking-wide text-am-error mb-1">
              {discountLabel} {t("exitOffer.off")}
            </div>
            <div className="font-mono text-lg font-bold text-am-primary-dark tracking-wider">{offer.couponCode || "—"}</div>
          </div>

          <button
            onClick={onApply}
            className="w-full bg-am-primary hover:bg-am-primary-dark text-white font-bold py-3.5 rounded-full transition-colors shadow-[0_8px_20px_rgba(196,154,60,0.3)] mb-3"
          >
            {t("exitOffer.applyAtCheckout")}
          </button>
          <button onClick={onClose} className="text-am-text-muted hover:text-am-primary-dark font-semibold text-[13px] transition-colors">
            {t("exitOffer.noThanks")}
          </button>
        </>
      ) : (
        <div className="py-6">
          <div className="text-4xl mb-3">✓</div>
          <p className="font-bold text-am-success">{t("exitOffer.appliedConfirmation")}</p>
        </div>
      )}
    </div>
  );
}
