"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/lib/store/language";

// A real acknowledgment dialog for messages that matter enough to require
// an explicit "OK" — e.g. "this item is already in your cart" — instead of
// an inline error line that fades on its own and can go unnoticed.
export default function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
  const { t } = useLanguage();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal straight to <body> — rendered inline, this would sit inside
  // whatever page called it, and a page root wrapped in the site's
  // `am-fade-in` class (nearly every page) leaves a non-`none` `transform`
  // behind once that animation finishes (animation-fill-mode: both keeps
  // the final keyframe's value applied). A `transform` on an ancestor
  // becomes the containing block for `position: fixed` descendants per the
  // CSS spec, so "fixed to the viewport" silently became "fixed to that
  // page's own container" instead — offset and undersized rather than
  // truly centered on screen. The portal sidesteps the whole problem.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-am-text/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-[360px] w-full p-6 text-center am-fade-in">
        <p className="text-[14px] text-am-text leading-relaxed mb-5">{message}</p>
        <button
          onClick={onClose}
          autoFocus
          className="w-full bg-am-primary hover:bg-am-primary-dark text-white font-bold py-2.5 rounded-full text-[14px] transition-colors"
        >
          {t("common.ok")}
        </button>
      </div>
    </div>,
    document.body
  );
}
