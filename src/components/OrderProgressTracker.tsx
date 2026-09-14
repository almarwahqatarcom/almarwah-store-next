"use client";

import { useLanguage } from "@/lib/store/language";

// A 4-stage visual tracker (Pending → Confirmed → Packed & Processed →
// Delivered), matching the step-by-step design the user asked for.
//
// Honest limitation, not silently glossed over: the real Laravel backend
// has no status-history/audit-log table at all (confirmed by searching the
// codebase for one) — an order row carries only ONE `updated_at`, whichever
// status change happened most recently, not a timestamp per step. So this
// shows the real placement time under the first step and the real
// "last updated" time under whichever step is current, rather than
// fabricating a distinct time for every step the way a full status-history
// system would.
const STEPS = [
  { key: "pending", icon: "📄", labelKey: "track.stepPending" as const },
  { key: "confirmed", icon: "🛒", labelKey: "track.stepConfirmed" as const },
  { key: "processing", icon: "📦", labelKey: "track.stepProcessing" as const },
  { key: "delivered", icon: "🚚", labelKey: "track.stepDelivered" as const },
];

function stepIndexForStatus(status: string | undefined): number {
  switch (status) {
    case "pending":
      return 0;
    case "confirmed":
      return 1;
    case "processing":
    case "out_for_delivery":
      return 2;
    case "delivered":
      return 3;
    default:
      return -1; // canceled / returned / failed / unrecognized
  }
}

export default function OrderProgressTracker({
  status,
  createdAt,
  updatedAt,
}: {
  status: string | undefined;
  createdAt?: string;
  updatedAt?: string;
}) {
  const { t, locale } = useLanguage();
  const currentIndex = stepIndexForStatus(status);

  if (currentIndex === -1) {
    // canceled / returned / failed — a linear stepper implies steady
    // forward progress, which would misrepresent an order that stopped;
    // a plain status message is the honest thing to show instead.
    const label =
      status === "returned" ? t("track.orderReturned") : status === "failed" ? t("track.orderFailed") : t("track.orderCancelled");
    return (
      <div className="bg-am-error/10 text-am-error rounded-xl px-4 py-3.5 text-sm font-semibold text-center">{label}</div>
    );
  }

  return (
    <div>
      <div className="flex">
        {STEPS.map((step, i) => {
          const done = i <= currentIndex;
          const current = i === currentIndex;
          return (
            // `relative` + `flex-1` on every column (equal widths) is what
            // makes the connecting-line math below work: each circle sits
            // dead-center of its own column, so a line anchored to `end-1/2`
            // (this column's own center) with `w-full` (one full column's
            // width) reaches exactly the PREVIOUS column's center — i.e.
            // exactly from one circle's middle to the next one's, never
            // drifting off toward whichever side happens to have more
            // content below it (the bug in the previous version: the line
            // lived *inside* the circle's own row, stealing width from that
            // row and pushing the circle to one side while the icon/label
            // below stayed centered on the full column).
            <div key={step.key} className="relative flex-1 flex flex-col items-center px-1">
              {i > 0 && (
                <div
                  aria-hidden
                  className={`absolute end-1/2 top-[18px] w-full h-[3px] -z-10 rounded-full transition-colors ${
                    i <= currentIndex ? "bg-am-success" : "bg-am-border"
                  }`}
                />
              )}
              <div
                className={`relative w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[13px] transition-all ${
                  done ? "bg-am-success shadow-[0_4px_10px_rgba(34,153,84,0.35)]" : "bg-white border-2 border-am-border text-am-text-faint"
                } ${current ? "ring-4 ring-am-success/20" : ""}`}
              >
                {done ? "✓" : i + 1}
              </div>
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl mt-3 shadow-sm transition-colors ${
                  done ? "bg-am-success/10" : "bg-am-bg"
                }`}
              >
                {step.icon}
              </div>
              <div className={`text-[11.5px] font-bold text-center mt-2 leading-tight ${done ? "text-am-success" : "text-am-text-faint"}`}>
                {t(step.labelKey)}
              </div>
              {current && (createdAt || updatedAt) && (
                <div className="text-[10px] text-am-text-muted text-center mt-1 leading-tight max-w-[100px]">
                  {new Date((i === 0 ? createdAt : updatedAt) ?? createdAt ?? "").toLocaleString(locale === "ar" ? "ar" : undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {status === "out_for_delivery" && (
        <p className="text-center text-[12px] font-semibold text-am-primary-dark mt-4">🚚 {t("track.outForDelivery")}</p>
      )}
    </div>
  );
}
