"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSiteSettings } from "@/lib/store/siteSettings";
import { useLanguage } from "@/lib/store/language";
import { formatCurrency } from "@/lib/api";
import { useStoreConfig } from "@/lib/store/config";

// Shown at most once per browser tab session — a visitor who dismisses it,
// or comes back to checkout again later in the same session, won't be
// nagged a second time.
const SESSION_KEY = "am-checkout-offer-shown";

// A "don't abandon your cart" popup mounted directly on the checkout page
// (see checkout/page.tsx). Fires a plain setTimeout for
// `exitOffer.triggerSeconds` after mount; navigating away from checkout —
// including a successful purchase — unmounts this component and cancels
// the timer via the effect's own cleanup, so it can only ever fire while
// genuinely still sitting on checkout, unpurchased. `hasDiscount` (already
// applied a coupon) also cancels/suppresses it — no reason to nag someone
// who's already got a discount.
export default function CheckoutAbandonmentOffer({ onApply, hasDiscount }: { onApply: (code: string) => void; hasDiscount: boolean }) {
  const { exitOffer } = useSiteSettings();
  const { config } = useStoreConfig();
  const { t, locale } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!exitOffer?.enabled || !exitOffer.couponCode.trim() || hasDiscount) return;

    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // Private-browsing/storage-blocked contexts throw on access — treat
      // as "not shown yet" rather than breaking the whole feature over it.
    }
    if (alreadyShown) return;

    const seconds = exitOffer.triggerSeconds > 0 ? exitOffer.triggerSeconds : 45;
    const timer = setTimeout(() => {
      setVisible(true);
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Same as above — a failed write just means it may show again
        // this session, not a broken feature.
      }
    }, seconds * 1000);

    return () => clearTimeout(timer);
  }, [exitOffer, hasDiscount]);

  if (!visible || !exitOffer) return null;

  const headline = exitOffer.headline[locale] || exitOffer.headline.en;
  const body = exitOffer.body[locale] || exitOffer.body.en;
  const discountLabel = exitOffer.discountType === "amount" ? formatCurrency(exitOffer.discountValue, config) : `${exitOffer.discountValue}%`;

  function close() {
    setVisible(false);
  }

  function applyNow() {
    onApply(exitOffer!.couponCode.trim());
    setApplied(true);
    setTimeout(() => setVisible(false), 1600);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[85] bg-am-text/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={headline}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-[440px] w-full p-8 text-center relative am-fade-in">
        <button
          onClick={close}
          aria-label={t("common.close")}
          className="absolute top-4 end-4 w-8 h-8 rounded-full flex items-center justify-center text-am-text-muted hover:bg-am-bg hover:text-am-text transition-colors"
        >
          ✕
        </button>

        {!applied ? (
          <>
            <div className="text-4xl mb-4">🎁</div>
            <h2 className="text-xl font-bold text-am-text mb-2">{headline}</h2>
            <p className="text-[13.5px] text-am-text-muted mb-6 leading-relaxed">{body}</p>

            <div className="bg-am-bg border-2 border-dashed border-am-primary rounded-2xl py-4 mb-6">
              <div className="text-[11px] font-bold uppercase tracking-wide text-am-error mb-1">
                {discountLabel} {t("exitOffer.off")}
              </div>
              <div className="font-mono text-lg font-bold text-am-primary-dark tracking-wider">{exitOffer.couponCode}</div>
            </div>

            <button
              onClick={applyNow}
              className="w-full bg-am-primary hover:bg-am-primary-dark text-white font-bold py-3.5 rounded-full transition-colors shadow-[0_8px_20px_rgba(196,154,60,0.3)] mb-3"
            >
              {t("exitOffer.applyAtCheckout")}
            </button>
            <button onClick={close} className="text-am-text-muted hover:text-am-primary-dark font-semibold text-[13px] transition-colors">
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
    </div>,
    document.body
  );
}
