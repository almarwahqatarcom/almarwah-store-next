"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSiteSettings } from "@/lib/store/siteSettings";
import { ExitOfferCard } from "@/components/ExitOfferCard";

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
  const [visible, setVisible] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!exitOffer?.enabled || !exitOffer.couponCode.trim() || hasDiscount) return;

    // Shown at most once per browser tab per *distinct offer* — keyed to
    // the coupon/headline/seconds, not a flat boolean. A flat "shown"
    // flag was the actual cause of a real "I enabled it and tested, it
    // never opened" report: any earlier popup in that same tab (even a
    // long-since-changed offer from a previous test) permanently
    // suppressed every future one, with no visible sign why. Changing the
    // offer's content now always gets a fresh chance to show; re-testing
    // the exact same offer in the exact same tab still only shows once,
    // which is the intended behavior. The admin dashboard's own "Preview"
    // button (ExitOfferSection.tsx) is the reliable way to check the
    // current design at any time — it bypasses this storage check and the
    // timer entirely.
    const sessionKey = `am-checkout-offer-shown:${exitOffer.couponCode}:${exitOffer.headline.en}:${exitOffer.triggerSeconds}`;

    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(sessionKey) === "1";
    } catch {
      // Private-browsing/storage-blocked contexts throw on access — treat
      // as "not shown yet" rather than breaking the whole feature over it.
    }
    if (alreadyShown) return;

    const seconds = exitOffer.triggerSeconds > 0 ? exitOffer.triggerSeconds : 45;
    const timer = setTimeout(() => {
      setVisible(true);
      try {
        sessionStorage.setItem(sessionKey, "1");
      } catch {
        // Same as above — a failed write just means it may show again
        // this session, not a broken feature.
      }
    }, seconds * 1000);

    return () => clearTimeout(timer);
  }, [exitOffer, hasDiscount]);

  if (!visible || !exitOffer) return null;

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
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <ExitOfferCard offer={exitOffer} applied={applied} onApply={applyNow} onClose={close} />
    </div>,
    document.body
  );
}
