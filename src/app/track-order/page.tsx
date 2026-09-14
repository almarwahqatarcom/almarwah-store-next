"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/lib/store/language";
import { useStoreConfig } from "@/lib/store/config";
import * as api from "@/lib/api";
import { normalizeQatarPhone } from "@/lib/phone";
import OrderProgressTracker from "@/components/OrderProgressTracker";
import InvoiceDocument, { type InvoiceItem, type InvoiceOrder } from "@/components/InvoiceDocument";
import { playChime } from "@/lib/chime";
import type { TimeSlot } from "@/lib/types";

// Public, no-account order tracking — the visitor supplies the order number
// + the phone number used to place it, nothing else. Backed by
// OrderController::getOrderDetails()'s own `phone` branch (see
// api.getOrderDetailsByPhone()'s docblock): a real, working lookup path
// that needs no token and no guest-id header, confirmed by reading the
// Laravel source and by a live (order-not-found) call against it.
//
// "Real-time... without refreshing the page" is implemented as polling
// (setInterval, same pattern as the existing visitor-tracking heartbeat) —
// there is no WebSocket/broadcast infrastructure on the backend
// (BROADCAST_DRIVER=log, confirmed earlier), so a genuine push-based live
// feed isn't something this backend can offer.
const POLL_INTERVAL_MS = 10000;

// Extends the shared invoice contract (InvoiceDocument.tsx) rather than
// re-declaring it — getOrderDetailsByPhone hits the exact same backend
// endpoint as the authenticated getOrderDetails() (just phone instead of
// token, confirmed in api.ts), so the raw response already carries every
// field a real invoice needs; this page just wasn't reading them before
// "Download Invoice" existed.
type OrderItemDetail = InvoiceItem;

type OrderSummary = InvoiceOrder & {
  order_status?: string;
  updated_at?: string;
  delivery_date?: string;
  time_slot_id?: number;
  delivery_man?: { f_name?: string; l_name?: string; phone?: string; image?: string | null } | null;
};

// The two shapes actually seen on real customer addresses in this backend:
// a registered customer's own phone is always normalized to "+974XXXXXXXX"
// at registration time (see register/page.tsx), but a guest checkout's
// contact_person_number is stored exactly as typed on the address form —
// raw, with no normalization applied there (confirmed by reading
// checkout/page.tsx's saveNewAddress()). Since this page can't know in
// advance which of those produced the order being looked up, it tries the
// phone exactly as entered first, then the normalized "+974…" form, so a
// visitor never has to guess which format to type.
function phoneCandidates(input: string): string[] {
  const trimmed = input.trim();
  const normalized = normalizeQatarPhone(trimmed);
  return Array.from(new Set([trimmed, normalized]));
}

export default function TrackOrderPage() {
  const { t, locale } = useLanguage();
  const { config } = useStoreConfig();

  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [items, setItems] = useState<OrderItemDetail[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);

  // What actually worked — reused by the polling effect so it doesn't have
  // to re-guess the phone format on every refresh.
  const trackedRef = useRef<{ orderId: number; phone: string } | null>(null);
  // The status as of the last poll — compared on every subsequent poll to
  // detect a genuine change (never fires on the very first load, only on
  // an actual transition noticed while the visitor is already watching).
  const lastStatusRef = useRef<string | null>(null);

  // For turning `time_slot_id` (a bare id on the order row — the
  // getOrderDetails()/track() endpoints don't eager-load the relation)
  // into an actual human time window for "Expected Delivery". Public and
  // cheap (revalidated hourly), so fetching it unconditionally here is
  // fine even before an order is looked up.
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  useEffect(() => {
    api.getTimeSlots().then(setTimeSlots).catch(() => setTimeSlots([]));
  }, []);

  async function attemptTrack(orderId: number, phoneToTry: string): Promise<{ order: OrderSummary; items: OrderItemDetail[] } | null> {
    try {
      const res = await api.getOrderDetailsByPhone(orderId, phoneToTry);
      const list = (Array.isArray(res) ? res : []) as (OrderItemDetail & { order?: OrderSummary })[];
      if (list.length === 0 || !list[0].order) return null;
      const order = list[0].order;

      // /customer/order/details (above) never eager-loads delivery_man at
      // all — confirmed by reading OrderController::getOrderDetails(), it
      // simply isn't in any of that endpoint's `with([...])` calls, in any
      // of its three branches — so an admin-assigned driver would silently
      // never show here no matter what. The separate /customer/order/track
      // endpoint (OrderLogic::track_order()) DOES eager-load it, and
      // accepts the exact same public order_id+phone lookup, so it's
      // fetched in parallel purely to pull that one field across.
      try {
        const trackRes = (await api.trackOrder(orderId, phoneToTry)) as { delivery_man?: OrderSummary["delivery_man"] };
        if (trackRes?.delivery_man?.f_name) order.delivery_man = trackRes.delivery_man;
      } catch {
        // A dropped/failed call here just means the driver-assigned card
        // doesn't show this refresh — never worth failing the whole lookup
        // over, since every other field already came back fine above.
      }

      return { order, items: list };
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const orderId = Number(orderNumber.trim());
    if (!orderId || !phone.trim()) {
      setError(t("track.errorMissingFields"));
      return;
    }

    setLoading(true);
    let found: { order: OrderSummary; items: OrderItemDetail[] } | null = null;
    let matchedPhone = "";
    for (const candidate of phoneCandidates(phone)) {
      found = await attemptTrack(orderId, candidate);
      if (found) {
        matchedPhone = candidate;
        break;
      }
    }
    setLoading(false);

    if (!found) {
      setError(t("track.notFound"));
      return;
    }

    trackedRef.current = { orderId, phone: matchedPhone };
    lastStatusRef.current = found.order.order_status ?? null;
    setOrder(found.order);
    setItems(found.items);
    setLastUpdated(new Date());
  }

  function reset() {
    trackedRef.current = null;
    setOrder(null);
    setItems([]);
    setError("");
    setOrderNumber("");
    setPhone("");
  }

  // Silent background refresh — no spinner, no error surfaced (a single
  // dropped poll shouldn't flash an error over a result that's already
  // showing); it just quietly tries again next tick. A genuine status
  // change (confirmed → processing, etc.) additionally chimes and shows a
  // toast, since that's the one thing on this page truly worth
  // interrupting the visitor for.
  useEffect(() => {
    if (!order) return;
    const interval = setInterval(async () => {
      const tracked = trackedRef.current;
      if (!tracked) return;
      const refreshed = await attemptTrack(tracked.orderId, tracked.phone);
      if (refreshed) {
        const newStatus = refreshed.order.order_status ?? null;
        if (lastStatusRef.current && newStatus && newStatus !== lastStatusRef.current) {
          playChime();
          setStatusToast(newStatus);
          setTimeout(() => setStatusToast(null), 6000);
        }
        lastStatusRef.current = newStatus;
        setOrder(refreshed.order);
        setItems(refreshed.items);
        setLastUpdated(new Date());
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const total = items.reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity ?? 1), 0);

  // `time_slot_id` on the order is a bare id — the actual start/end times
  // live in a separate, public /timeSlot list (already used by checkout),
  // fetched once above and matched here purely for display.
  const matchedSlot = order && order.time_slot_id ? timeSlots.find((s) => s.id === order.time_slot_id) : undefined;
  const expectedDeliveryText =
    order?.delivery_date
      ? `${new Date(order.delivery_date).toLocaleDateString(locale === "ar" ? "ar" : undefined, { weekday: "short", month: "short", day: "numeric" })}${
          matchedSlot ? ` · ${matchedSlot.start_time.slice(0, 5)}–${matchedSlot.end_time.slice(0, 5)}` : ""
        }`
      : null;

  const statusLabel = (status: string): string => {
    switch (status) {
      case "pending":
        return t("track.stepPending");
      case "confirmed":
        return t("track.stepConfirmed");
      case "processing":
        return t("track.stepProcessing");
      case "out_for_delivery":
        return t("track.stepOutForDelivery");
      case "delivered":
        return t("track.stepDelivered");
      case "canceled":
      case "cancelled":
        return t("track.stepCancelled");
      case "returned":
        return t("track.stepReturned");
      case "failed":
        return t("track.stepFailed");
      default:
        return status.replace(/_/g, " ");
    }
  };

  return (
    <div className="max-w-[640px] mx-auto px-5 py-12 am-fade-in">
      {statusToast &&
        createPortal(
          <div className="fixed top-4 inset-x-0 z-[90] flex justify-center px-4 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-3 bg-white border border-am-success/30 shadow-2xl rounded-2xl px-5 py-3.5 max-w-sm am-fade-in">
              <span className="text-xl shrink-0">🔔</span>
              <p className="text-[13.5px] text-am-text">
                <span className="font-bold text-am-success">{t("track.statusUpdatedTo")}</span> {statusLabel(statusToast)}
              </p>
            </div>
          </div>,
          document.body
        )}
      {showInvoice &&
        order &&
        createPortal(
          <div
            className="fixed inset-0 z-[95] bg-am-text/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto print:static print:inset-auto print:bg-transparent print:backdrop-blur-none print:p-0 print:block"
            role="dialog"
            aria-modal="true"
            aria-label={t("track.downloadInvoice")}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowInvoice(false);
            }}
          >
            {/* Printing normally prints the whole document, including this
                overlay's own backdrop and the storefront chrome behind it —
                this rule scopes @media print to show ONLY the invoice
                itself, the standard "print just this element" technique
                (hide everything, then re-reveal just the target subtree). */}
            <style>{`@media print {
              body * { visibility: hidden; }
              #invoice-print-area, #invoice-print-area * { visibility: visible; }
              #invoice-print-area { position: absolute; inset: 0; width: 100%; }
            }`}</style>
            <div className="w-full max-w-[850px] my-4 sm:my-0 print:my-0 print:max-w-none">
              <div className="flex items-center justify-between mb-3 print:hidden">
                <span className="text-white text-[12px] font-bold uppercase tracking-wide bg-white/10 px-3 py-1.5 rounded-full">{t("track.invoicePreview")}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 bg-am-primary hover:bg-am-primary-dark text-white text-[13px] font-bold px-5 py-2.5 rounded-full transition-colors shadow-[0_8px_20px_rgba(196,154,60,0.35)]"
                  >
                    {t("order.printInvoice")}
                  </button>
                  <button
                    onClick={() => setShowInvoice(false)}
                    aria-label={t("common.close")}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div id="invoice-print-area">
                <InvoiceDocument order={order} items={items} />
              </div>
            </div>
          </div>,
          document.body
        )}
      {!order ? (
        <>
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">📍</div>
            <h1 className="text-xl font-bold text-am-text mb-2">{t("track.title")}</h1>
            <p className="text-[13.5px] text-am-text-muted leading-relaxed">{t("track.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white border border-am-border rounded-2xl p-7 flex flex-col gap-4">
            {error && (
              <div className="bg-am-error/10 text-am-error text-[13px] rounded-lg px-4 py-2.5">
                <p>{error}</p>
                <p className="mt-1 opacity-90">{t("track.orderNotFoundHint")}</p>
              </div>
            )}

            <div>
              <label className="block text-[12px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("track.orderNumberLabel")}</label>
              <input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder={t("track.orderNumberPlaceholder")}
                inputMode="numeric"
                className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("track.phoneLabel")}</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("track.phonePlaceholder")}
                className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-full transition-colors mt-2"
            >
              {loading ? t("track.tracking") : t("track.submit")}
            </button>
          </form>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-xl font-bold text-am-text">{t("track.orderNumber")} #{order.id}</h1>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-am-success">
              <span className="w-1.5 h-1.5 rounded-full bg-am-success animate-pulse" />
              {t("track.liveUpdating")}
            </span>
          </div>

          <div className="bg-white border border-am-border rounded-2xl p-6">
            <OrderProgressTracker status={order.order_status} createdAt={order.created_at} updatedAt={order.updated_at} />
          </div>

          {order.delivery_man?.f_name && (
            <div className="bg-am-success/5 border border-am-success/30 rounded-2xl p-5 flex items-center gap-4">
              {(() => {
                const photo = api.imageUrl(config.base_urls, "delivery_man_image_url", order.delivery_man?.image);
                return photo ? (
                  <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 relative border-2 border-white shadow-sm">
                    <Image src={photo} alt="" fill sizes="48px" className="object-cover" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-am-success/15 flex items-center justify-center text-2xl shrink-0">🛵</div>
                );
              })()}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-am-success mb-0.5">{t("track.driverAssigned")}</div>
                <div className="text-[15px] font-bold text-am-text truncate">
                  {`${order.delivery_man.f_name} ${order.delivery_man.l_name ?? ""}`.trim()}
                </div>
              </div>
              {order.delivery_man.phone && (
                <a
                  href={`tel:${order.delivery_man.phone}`}
                  className="shrink-0 inline-flex items-center gap-1.5 bg-am-success text-white text-[12.5px] font-bold px-4 py-2.5 rounded-full hover:bg-am-success/90 transition-colors"
                >
                  📞 {order.delivery_man.phone}
                </a>
              )}
            </div>
          )}

          <div className="bg-white border border-am-border rounded-2xl p-6 flex flex-col gap-3">
            <Row label={t("track.placedOn")} value={order.created_at ? new Date(order.created_at).toLocaleString() : "—"} />
            {expectedDeliveryText && <Row label={t("track.expectedDelivery")} value={expectedDeliveryText} />}
            <Row label={t("track.paymentMethod")} value={(order.payment_method ?? "—").replace(/_/g, " ")} />
            <Row label={t("track.paymentStatus")} value={order.payment_status ?? "—"} />
            <div className="pt-3 border-t border-am-border">
              <span className="text-[11px] font-bold uppercase tracking-wider text-am-text-faint">
                {order.order_type === "self_pickup" ? t("track.selfPickupOrder") : t("track.deliveredTo")}
              </span>
              {order.order_type !== "self_pickup" && order.delivery_address && (
                <div className="text-[13.5px] text-am-text mt-1.5 leading-relaxed">
                  {order.delivery_address.contact_person_name && <div className="font-semibold">{order.delivery_address.contact_person_name}</div>}
                  {order.delivery_address.address && <div className="text-am-text-muted">{order.delivery_address.address}</div>}
                </div>
              )}
            </div>
            <div className="flex justify-between pt-3 border-t border-am-border font-bold">
              <span>{t("track.total")}</span>
              <span className="text-am-primary-dark">{api.formatCurrency(order.order_amount ?? total, config)}</span>
            </div>
            <button
              onClick={() => setShowInvoice(true)}
              className="flex items-center justify-center gap-2 border border-am-primary/40 text-am-primary-dark hover:bg-am-primary/5 font-bold text-[13.5px] py-3 rounded-xl transition-colors mt-1"
            >
              🧾 {t("track.downloadInvoice")}
            </button>
          </div>

          {items.length > 0 && (
            <div className="bg-white border border-am-border rounded-2xl p-6">
              <h2 className="font-bold text-am-text mb-3 text-sm">{t("track.items")}</h2>
              <div className="flex flex-col gap-2.5">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-am-text">
                      {item.product_details?.name ?? "Item"} <span className="text-am-text-muted">× {item.quantity ?? 1}</span>
                    </span>
                    <span className="font-semibold">{api.formatCurrency((item.price ?? 0) * (item.quantity ?? 1), config)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lastUpdated && (
            <p className="text-center text-[11.5px] text-am-text-faint">
              {t("track.lastUpdated")}: {lastUpdated.toLocaleTimeString(locale === "ar" ? "ar" : undefined)}
            </p>
          )}

          <div className="flex justify-center gap-4 mt-2">
            <button onClick={reset} className="text-[13px] font-semibold text-am-primary-dark hover:underline">
              {t("track.trackAnother")}
            </button>
            <Link href="/" className="text-[13px] font-semibold text-am-text-muted hover:underline">
              {t("common.continueShopping")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-am-text-muted">{label}</span>
      <span className="font-semibold capitalize">{value}</span>
    </div>
  );
}
