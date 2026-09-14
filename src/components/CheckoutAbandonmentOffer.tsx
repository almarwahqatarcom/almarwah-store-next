"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSiteSettings } from "@/lib/store/siteSettings";
import { useAdminSessionStore } from "@/lib/store/adminSession";
import { ExitOfferCard } from "@/components/ExitOfferCard";

// A "don't abandon your cart" popup mounted directly on the checkout page
// (see checkout/page.tsx). Fires a plain setTimeout for
// `exitOffer.triggerSeconds` after mount; navigating away from checkout —
// including a successful purchase — unmounts this component and cancels
// the timer via the effect's own cleanup, so it can only ever fire while
// genuinely still sitting on checkout, unpurchased. `hasDiscount` (already
// applied a coupon) also cancels/suppresses it — no reason to nag someone
// who's already got a discount.
function sessionKeyFor(offer: { couponCode: string; headline: { en: string }; triggerSeconds: number }): string {
  // Shown at most once per browser tab per *distinct offer* — keyed to the
  // coupon/headline/seconds, not a flat boolean. A flat "shown" flag was
  // the actual cause of a real "I enabled it and tested, it never opened"
  // report: any earlier popup in that same tab (even a long-since-changed
  // offer from a previous test) permanently suppressed every future one,
  // with no visible sign why. Changing the offer's content now always
  // gets a fresh chance to show; re-testing the exact same offer in the
  // exact same tab still only shows once, which is the intended behavior
  // for a real customer — see the admin-only "show it now" control below
  // for testing that without needing to wait out that restriction.
  return `am-checkout-offer-shown:${offer.couponCode}:${offer.headline.en}:${offer.triggerSeconds}`;
}

export default function CheckoutAbandonmentOffer({ onApply, hasDiscount }: { onApply: (code: string) => void; hasDiscount: boolean }) {
  const { exitOffer } = useSiteSettings();
  const isAdmin = useAdminSessionStore((s) => s.isAdmin);
  const [visible, setVisible] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!exitOffer?.enabled || !exitOffer.couponCode.trim() || hasDiscount) return;

    const sessionKey = sessionKeyFor(exitOffer);

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

  // A small, admin-only shortcut for exactly the confusion that led here:
  // "I enabled it, waited on checkout, nothing showed" is very often just
  // the once-per-tab restriction above silently doing its job from an
  // earlier test — with nothing on screen explaining why. Only ever
  // rendered for a browser signed into /admin (useAdminSessionStore — the
  // same shared session Header.tsx's own Dashboard/Logout link uses), so
  // a real customer never sees it and it can't be used to spam the offer.
  if (isAdmin && exitOffer?.enabled && exitOffer.couponCode.trim() && !hasDiscount && !visible) {
    return (
      <button
        onClick={() => {
          try {
            sessionStorage.removeItem(sessionKeyFor(exitOffer));
          } catch {
            // ignore
          }
          setVisible(true);
        }}
        className="fixed bottom-4 end-4 z-[80] flex items-center gap-2 bg-am-text text-white text-[12px] font-bold px-4 py-2.5 rounded-full shadow-lg hover:bg-am-text/90 transition-colors"
      >
        🔧 Admin: show offer now
      </button>
    );
  }

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
