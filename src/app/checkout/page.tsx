"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/store/cart";
import { useAuthStore } from "@/lib/store/auth";
import { useStoreConfig } from "@/lib/store/config";
import * as api from "@/lib/api";
import { trackInitiateCheckout, trackPurchase } from "@/lib/fbPixel";
import { useLanguage } from "@/lib/store/language";
import { useSiteSettings } from "@/lib/store/siteSettings";
import CheckoutAccountModal from "@/components/CheckoutAccountModal";
import CheckoutAbandonmentOffer from "@/components/CheckoutAbandonmentOffer";
import { AddressTypeSelector } from "@/components/AddressLocationFields";
import MapLocationPicker from "@/components/MapLocationPicker";
import type { Address, BranchDeliveryFeeInfo, TimeSlot } from "@/lib/types";

type OrderType = "delivery" | "self_pickup";
// Real payment methods are dynamic — "cash_on_delivery" plus whichever
// gateways are configured (config.active_payment_method_list), each
// identified by its own literal gateway key (e.g. "sadad"). There is no
// generic "digital_payment" method the backend recognizes.
type PaymentMethod = string;

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Mirrors the Flutter app's own cutoff (OrderProvider.validateSlot): a slot
// for "today" is no longer offerable once its end time, minus 30 minutes,
// has already passed. Slots for any later date are never elapsed.
function isSlotElapsed(slot: TimeSlot, dateIndex: number): boolean {
  if (dateIndex !== 0) return false;
  const [h, m, s] = slot.end_time.split(":").map(Number);
  const end = new Date();
  end.setHours(h, m, s || 0, 0);
  end.setMinutes(end.getMinutes() - 30);
  return end.getTime() < Date.now();
}

function formatSlotTime(t: string): string {
  const [hStr, m] = t.split(":");
  let h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export default function CheckoutPage() {
  const { config } = useStoreConfig();
  const { items, totalAmount, clear } = useCartStore();
  const { token, user, setUser } = useAuthStore();
  const router = useRouter();
  const { t } = useLanguage();
  const { countdownPromos } = useSiteSettings();

  // Gateway payments (Sadad etc.) go through a real two-step quote-then-
  // confirm flow, distinct from Cash on Delivery's single-step order/place
  // — see the note above placeOrder() and src/lib/api.ts's
  // quoteDigitalPayment/confirmDigitalPayment for the full trace through
  // the actual backend source. Sadad is the store's preferred method, so
  // it's selected by default whenever configured — same behavior as the
  // Flutter app (CheckOutHelper.autoSelectPaymentMethod).
  const defaultGateway = config.active_payment_method_list?.[0];

  const [orderType, setOrderType] = useState<OrderType>(config.self_pickup ? "self_pickup" : "delivery");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  // Once an address is selected, collapse the picker down to a compact
  // "here's where we're delivering, tap Change to pick another" summary
  // instead of always showing every saved address expanded — "Change"
  // re-reveals the full radio list. Starts open (false) since there's
  // nothing selected yet to summarize.
  const [changingAddress, setChangingAddress] = useState(false);
  // Non-null while the "+ Add a new address" form is actually editing an
  // existing saved address in place (via the real PUT
  // /customer/address/update/{id} endpoint) rather than creating a new
  // one — set by the pencil "Edit" button on the selected-address summary.
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [newAddress, setNewAddress] = useState({ address_type: "Home", address: "", latitude: "", longitude: "", contact_person_number: "", contact_person_name: "" });
  // The account-choice popup (Sign In / Create Account / Continue as Guest)
  // — shown instead of the old hard redirect to /login, since guest
  // checkout is a real, working backend flow (is_guest/guest_id on
  // /customer/order/place, confirmed by reading the Laravel source) that
  // was simply unreachable from this UI before. Guest addresses/orders are
  // identified by the cart's own guestId (the same one already used for
  // guest carts), via the `guest-id` header — see api.getAddressesFor().
  const [guestCheckoutChosen, setGuestCheckoutChosen] = useState(false);
  const guestId = useCartStore((s) => s.guestId);
  const ensureGuest = useCartStore((s) => s.ensureGuest);
  // The popup itself only opens once the customer actually tries to place
  // the order (see validateBeforePlacing()) — not the instant the page
  // loads, so there's room to review items/pricing/payment method first.
  // `showAccountModal` still gates the RENDER (not just the open request):
  // the moment either branch resolves (token set, or guestCheckoutChosen),
  // this goes false on its own and the modal disappears without needing an
  // explicit close.
  const [modalRequested, setModalRequested] = useState(false);
  const needsAccountChoice = orderType === "delivery" && !token && !guestCheckoutChosen;
  const showAccountModal = modalRequested && needsAccountChoice;
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultGateway?.gateway ?? "cash_on_delivery");
  const [orderNote, setOrderNote] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [addrSaving, setAddrSaving] = useState(false);

  // Delivery time slots — an unconditional part of the real checkout flow
  // (no business-setting gates this off, confirmed in both the Flutter app
  // and the Laravel backend). The order table's time_slot_id/delivery_date
  // columns aren't required by StoreOrderRequest, so skipping this doesn't
  // fail loudly — it just silently creates orders with no delivery time,
  // which is what this checkout was doing before this was added.
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [offDays, setOffDays] = useState<string[]>([]);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0); // 0=today, 1=tomorrow, 2=day after
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<number | null>(null);

  // The REAL delivery pricing rules for this branch, from GET
  // /config/delivery-fee — `config.delivery_charge` (used previously) is a
  // dead legacy general-settings field the backend's own order-placement
  // code (Helpers::get_delivery_charge()) never reads, which is why it was
  // showing a flat 100 QR regardless of what's actually configured. See the
  // docs on api.computeDeliveryCharge() for the full three-mode formula.
  const [deliveryFeeInfo, setDeliveryFeeInfo] = useState<BranchDeliveryFeeInfo[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);

  const branch = config.branches?.[0];
  const branchDeliveryInfo = deliveryFeeInfo.find((b) => b.id === branch?.id);
  const deliveryChargeType = branchDeliveryInfo?.delivery_charge_setup?.delivery_charge_type;
  const subtotal = totalAmount();

  useEffect(() => {
    if (items.length === 0) return;
    trackInitiateCheckout({
      value: subtotal,
      num_items: items.reduce((sum, i) => sum + i.quantity, 0),
      content_ids: items.map((i) => i.product_id),
    });
    // Fire once, for the cart the customer arrived at checkout with — not
    // on every coupon/quantity tweak afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateList = [0, 1, 2].map((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return toYMD(d);
  });
  const selectedDate = dateList[selectedDateIndex];
  const isSelectedDateOff = offDays.includes(selectedDate);
  const availableSlots = timeSlots.filter((s) => !isSlotElapsed(s, selectedDateIndex));
  const hasAnyDeliveryTime = dateList.some((ymd, i) => !offDays.includes(ymd) && timeSlots.some((s) => !isSlotElapsed(s, i)));

  useEffect(() => {
    if (!token && !(guestCheckoutChosen && guestId)) return;
    api.getAddressesFor({ token, guestId }).then(setAddresses).catch(() => setAddresses([]));
  }, [token, guestCheckoutChosen, guestId]);

  async function chooseGuestCheckout(details: { phone: string; name: string; address: string; addressType: string; latitude: string; longitude: string }) {
    setGuestCheckoutChosen(true);
    setAddrSaving(true);
    try {
      // ensureGuest() returns the actual id directly — reading the
      // `guestId` hook value right after calling it would still see the
      // pre-call (null) state, since a store update doesn't retroactively
      // rewrite an already-captured closure.
      const freshGuestId = await ensureGuest();
      // The modal's Guest tab already collected everything a real address
      // needs (including map coordinates, for accurate delivery pricing —
      // see CheckoutAccountModal's docblock), so this saves it immediately
      // instead of just pre-filling a second form the visitor would have
      // to submit again.
      await api.addAddressFor(
        {
          address_type: details.addressType,
          address: details.address,
          latitude: details.latitude,
          longitude: details.longitude,
          contact_person_number: details.phone,
          contact_person_name: details.name.trim() || "Guest",
        },
        { token: null, guestId: freshGuestId }
      );
      const refreshed = await api.getAddressesFor({ token: null, guestId: freshGuestId });
      setAddresses(refreshed);
      setSelectedAddressId(refreshed[0]?.id ?? null);
    } catch {
      setPlaceError(t("checkout.errorSaveAddress"));
    } finally {
      setAddrSaving(false);
    }
  }

  // A returning guest picked one of their own already-saved addresses
  // straight from CheckoutAccountModal's "welcome back" shortcut — nothing
  // to create, just unlock the rest of checkout with it already selected.
  // The addresses-loading effect right below (gated on guestCheckoutChosen)
  // re-fetches the full list on its own once this flips true; setting it
  // here too avoids a one-frame flash of "no address selected" before that
  // effect resolves.
  function continueAsReturningGuest(address: Address) {
    setGuestCheckoutChosen(true);
    setAddresses((prev) => (prev.some((a) => a.id === address.id) ? prev : [address, ...prev]));
    setSelectedAddressId(address.id);
  }

  useEffect(() => {
    api.getDeliveryFeeInfo().then(setDeliveryFeeInfo).catch(() => setDeliveryFeeInfo([]));
  }, []);

  useEffect(() => {
    Promise.all([api.getTimeSlots(), api.getDeliveryOffDays()])
      .then(([slots, off]) => {
        setTimeSlots(slots);
        setOffDays(off);
      })
      .catch(() => {});
  }, []);

  // Auto-select the first available date+slot once data loads — mirrors the
  // Flutter app's _selectFirstAvailableDateSlot() so the customer isn't
  // forced to manually pick one, though they still can.
  useEffect(() => {
    if (timeSlots.length === 0 || selectedTimeSlotId !== null) return;
    for (let i = 0; i < dateList.length; i++) {
      if (offDays.includes(dateList[i])) continue;
      const firstValid = timeSlots.find((s) => !isSlotElapsed(s, i));
      if (firstValid) {
        setSelectedDateIndex(i);
        setSelectedTimeSlotId(firstValid.id);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeSlots, offDays, selectedTimeSlotId]);

  // If the customer switches dates and their previously-chosen slot has
  // since elapsed for "today" (or the date became unavailable), fall back
  // to the first still-valid slot rather than leaving a stale selection.
  useEffect(() => {
    if (selectedTimeSlotId === null) return;
    const slot = timeSlots.find((s) => s.id === selectedTimeSlotId);
    if (!slot || isSlotElapsed(slot, selectedDateIndex)) {
      setSelectedTimeSlotId(availableSlots[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateIndex]);

  useEffect(() => {
    const areas = branchDeliveryInfo?.delivery_charge_by_area ?? [];
    if (deliveryChargeType === "area" && areas.length > 0 && selectedAreaId === null) {
      setSelectedAreaId(areas[0].id);
    }
  }, [deliveryChargeType, branchDeliveryInfo, selectedAreaId]);

  // Only branches priced per-kilometer need a real distance figure — fetched
  // once a delivery address is selected, mirroring
  // CheckOutHelper.selectDeliveryAddress() in the Flutter app. Falls back to
  // a straight-line estimate if the Google Routes proxy fails (same
  // fallback the Flutter app uses via Geolocator).
  useEffect(() => {
    if (orderType !== "delivery" || deliveryChargeType !== "distance") {
      setDistanceKm(null);
      return;
    }
    const address = addresses.find((a) => a.id === selectedAddressId);
    if (!branch || !address) {
      setDistanceKm(null);
      return;
    }
    const originLat = Number(branch.latitude);
    const originLng = Number(branch.longitude);
    const destLat = Number(address.latitude);
    const destLng = Number(address.longitude);
    let cancelled = false;
    api.getDistanceKm(originLat, originLng, destLat, destLng).then((km) => {
      if (cancelled) return;
      setDistanceKm(km ?? api.haversineKm(originLat, originLng, destLat, destLng));
    });
    return () => {
      cancelled = true;
    };
  }, [orderType, deliveryChargeType, branch, addresses, selectedAddressId]);

  const rawDeliveryFee = orderType === "self_pickup" ? 0 : api.computeDeliveryCharge(branchDeliveryInfo, distanceKm, selectedAreaId);
  // A store-wide "free delivery over X" promo (separate business setting)
  // can still zero out an otherwise-real fee.
  const deliveryFee = config.free_delivery_over_amount_status && subtotal >= config.free_delivery_over_amount ? 0 : rawDeliveryFee;
  const deliveryFree = deliveryFee === 0;
  const total = Math.max(0, subtotal + deliveryFee - couponDiscount);

  useEffect(() => {
    // The backend requires a real numeric customer_id in the order payload
    // for logged-in orders (see placeOrder() below) — `user` is only
    // populated after visiting /account, so make sure it's here too for
    // anyone who logs in and goes straight to checkout.
    if (!token || user) return;
    api
      .getCustomerInfo(token)
      .then((info) =>
        setUser({
          id: Number(info.id),
          f_name: String(info.f_name ?? ""),
          l_name: String(info.l_name ?? ""),
          email: String(info.email ?? ""),
          phone: String(info.phone ?? ""),
        })
      )
      .catch(() => {});
  }, [token, user, setUser]);

  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) setSelectedAddressId(addresses[0].id);
  }, [addresses, selectedAddressId]);

  async function saveNewAddress() {
    if (!token && !guestId) return;
    setAddrSaving(true);
    try {
      const payload = {
        ...newAddress,
        // The backend requires a non-empty contact_person_name to save
        // any address at all (guest or not) — there's no way to make it
        // truly optional against the real API. A logged-in customer's
        // own account name is a genuinely accurate default when they
        // don't bother typing one; a guest gets a plain "Guest" label.
        contact_person_name: newAddress.contact_person_name.trim() || (token && user ? `${user.f_name} ${user.l_name}`.trim() : "Guest"),
      };
      if (editingAddressId != null) {
        // Editing an existing saved address in place — real
        // PUT /customer/address/update/{id} endpoint, confirmed against
        // the backend source (CustomerController::updateAddress).
        await api.updateAddressFor(editingAddressId, payload, { token, guestId });
        const refreshed = await api.getAddressesFor({ token, guestId });
        setAddresses(refreshed);
        setSelectedAddressId(editingAddressId);
      } else {
        // The real add endpoint returns only {message}, never the new
        // address's id (confirmed live and in the backend source) —
        // re-fetching and taking the first entry is the only way to know
        // which one it was, since /customer/address/list sorts
        // `->latest()` first. Matches what the Flutter app itself does
        // after adding an address.
        await api.addAddressFor(payload, { token, guestId });
        const refreshed = await api.getAddressesFor({ token, guestId });
        setAddresses(refreshed);
        setSelectedAddressId(refreshed[0]?.id ?? null);
      }
      setNewAddress({ address_type: "Home", address: "", latitude: "", longitude: "", contact_person_number: "", contact_person_name: "" });
      setShowNewAddress(false);
      setChangingAddress(false);
      setEditingAddressId(null);
    } catch {
      setPlaceError(t("checkout.errorSaveAddress"));
    } finally {
      setAddrSaving(false);
    }
  }

  // Opens the same form used for "+ Add a new address", pre-filled with an
  // existing saved address's details, so the user can correct a typo in
  // the name/phone/location instead of only being able to add a brand new
  // entry. saveNewAddress() above detects editingAddressId and calls the
  // update endpoint instead of add.
  function startEditAddress(a: Address) {
    setNewAddress({
      address_type: a.address_type || "Home",
      address: a.address || "",
      latitude: a.latitude || "",
      longitude: a.longitude || "",
      contact_person_number: a.contact_person_number || "",
      contact_person_name: a.contact_person_name || "",
    });
    setEditingAddressId(a.id);
    setShowNewAddress(true);
  }

  // Guest-only convenience: this browser's own guest-id already scopes
  // `addresses` to whatever this guest has saved before (same device,
  // same session) — there's no backend endpoint that looks up a customer
  // or guest by phone number across devices, so this can only ever
  // recognize a phone number already saved under this same guest-id, not
  // "any past order anywhere". When it matches, prefill the rest of the
  // form so a returning guest doesn't have to retype their name/address.
  function handleGuestPhoneChange(value: string) {
    setNewAddress((f) => ({ ...f, contact_person_number: value }));
    if (token) return;
    const digits = value.trim();
    if (digits.length < 7) return;
    const match = addresses.find((a) => a.contact_person_number === digits);
    if (match) {
      setNewAddress((f) => ({
        ...f,
        contact_person_number: digits,
        contact_person_name: match.contact_person_name || f.contact_person_name,
        address: match.address,
        address_type: match.address_type || f.address_type,
        latitude: match.latitude,
        longitude: match.longitude,
      }));
    }
  }

  // Real product/category restriction for an admin-configured countdown
  // promo's coupon code — see CountdownPromo's docblock in
  // src/lib/settings/store.server.ts for why this has to live here rather
  // than on the backend: the real Coupon system has no such concept at
  // all, so this is the only place "only works for the selected product"
  // can actually be enforced against a customer going through this site's
  // own checkout. Case-insensitive since the backend's own code match is
  // whatever the admin typed as the real coupon's code — normalizing here
  // avoids a promo silently failing to match over letter casing alone.
  function findRestrictingPromo(code: string) {
    const now = Date.now();
    return (countdownPromos ?? []).find(
      (p) =>
        p.enabled &&
        p.couponCode.trim().toUpperCase() === code.trim().toUpperCase() &&
        now >= new Date(p.startAt).getTime() &&
        now <= new Date(p.endAt).getTime()
    );
  }

  // Accepts an explicit code so the pending-coupon-from-exit-offer effect
  // below can apply it the instant it's read, rather than calling
  // setCouponCode() and hoping this function's next invocation picks up
  // the new state — React state updates aren't synchronous, so a
  // same-tick setCouponCode() + applyCoupon() would still see the OLD
  // (empty) couponCode via this closure.
  async function applyCoupon(explicitCode?: string) {
    const code = (explicitCode ?? couponCode).trim();
    if (!code) return;
    if (explicitCode !== undefined) setCouponCode(explicitCode);

    const restricting = findRestrictingPromo(code);
    if (restricting) {
      const qualifies = items.some(
        (i) =>
          restricting.productIds.includes(i.product_id) ||
          (i.product?.category_ids ?? []).some((c) => restricting.categoryIds.includes(Number(c.id)))
      );
      if (!qualifies) {
        setCouponDiscount(0);
        setCouponMsg(t("checkout.couponRestricted"));
        return;
      }
    }

    try {
      const res = await api.applyCoupon(code, token);
      const discount = typeof res.discount === "number" ? res.discount : 0;
      setCouponDiscount(discount);
      setCouponMsg(discount > 0 ? `${t("checkout.couponApplied")} ${api.formatCurrency(discount, config)} ${t("checkout.couponAppliedOff")}` : t("checkout.couponAccepted"));
    } catch {
      setCouponDiscount(0);
      setCouponMsg(t("checkout.couponInvalid"));
    }
  }

  function validateBeforePlacing(): boolean {
    // The account-choice popup opens right here, on the actual attempt to
    // place the order — not before. If it's already open and still
    // unresolved (showAccountModal), just bail without re-opening anything.
    if (needsAccountChoice) {
      setModalRequested(true);
      return false;
    }
    if (orderType === "delivery" && !selectedAddressId) {
      setPlaceError(t("checkout.errorSelectAddress"));
      return false;
    }
    if (!branch) {
      setPlaceError(t("checkout.errorNoBranch"));
      return false;
    }
    if (token && !user?.id) {
      // Real, if rare: getCustomerInfo hasn't resolved yet (or failed) —
      // sending the order without a customer_id here would just repeat the
      // "Customer id is required unless is_guest is 1" backend error.
      setPlaceError(t("checkout.errorStillLoading"));
      return false;
    }
    if (isSelectedDateOff) {
      setPlaceError(t("checkout.errorDateOff"));
      return false;
    }
    if (!hasAnyDeliveryTime) {
      setPlaceError(t("checkout.errorNoTimeSlots"));
      return false;
    }
    if (!selectedTimeSlotId) {
      setPlaceError(t("checkout.errorChooseTime"));
      return false;
    }
    return true;
  }

  // Cash on Delivery — the one payment method /customer/order/place
  // actually supports correctly. Single step: the order exists, paid or
  // not, the moment this call succeeds.
  async function placeCodOrder() {
    const orderGuestId = token ? null : guestId;
    const payload: api.PlaceOrderPayload = {
      cart: items.map((i) => ({
        product_id: i.product_id,
        price: i.price,
        discount_amount: i.discount,
        quantity: i.quantity,
        tax_amount: i.tax,
      })),
      order_amount: total,
      order_type: orderType,
      branch_id: branch!.id,
      delivery_address_id: orderType === "delivery" ? selectedAddressId : null,
      payment_method: paymentMethod,
      order_note: orderNote || undefined,
      coupon_code: couponDiscount > 0 ? couponCode.trim() : undefined,
      coupon_discount_amount: couponDiscount || undefined,
      // The server independently recomputes the real delivery charge from
      // these two inputs (Helpers::get_delivery_charge()) — it never trusts
      // a client-sent amount — so they need to be accurate for
      // "distance"/"area" priced branches, not just for display here.
      distance: distanceKm ?? undefined,
      selected_delivery_area: selectedAreaId,
      time_slot_id: selectedTimeSlotId,
      delivery_date: selectedDate,
      // Backend validator requires the literal 0/1, and customer_id
      // whenever is_guest is 0 — see PlaceOrderPayload's comments in api.ts.
      is_guest: token ? 0 : 1,
      customer_id: token ? user!.id : null,
      guest_id: orderGuestId,
    };
    const res = await api.placeOrder(payload, { token, guestId: orderGuestId });
    trackPurchase({ value: total, content_ids: items.map((i) => i.product_id) });
    await clear(token);
    // Guests have no token to view the auth-gated /account/orders/[id], so
    // they get a self-contained confirmation instead of a login wall right
    // after completing a purchase.
    if (token) {
      router.push(`/account/orders/${res.order_id}?placed=1`);
    } else {
      // Carried through purely so the guest-upgrade prompt on the
      // confirmation page can offer "Create an account" pre-filled with the
      // same phone/name — a guest who just went through this once
      // shouldn't have to retype it to skip the friction next time.
      const guestAddress = addresses.find((a) => a.id === selectedAddressId);
      const extra = guestAddress
        ? `&phone=${encodeURIComponent(guestAddress.contact_person_number)}&name=${encodeURIComponent(guestAddress.contact_person_name ?? "")}`
        : "";
      router.push(`/order-confirmation?order_id=${res.order_id}&total=${total}&payment_method=${encodeURIComponent(paymentMethod)}${extra}`);
    }
  }

  // Gateway payment (Sadad) — quote step only. No order exists yet; the
  // real backend creates it server-side, only on genuine payment success,
  // by the time the customer's browser lands back on /checkout/complete
  // (see the note above quoteDigitalPayment in api.ts). The cart is
  // deliberately left alone here (not cleared) — if the customer abandons
  // the gateway page, their cart should still be exactly as they left it.
  async function placeDigitalOrder() {
    const orderGuestId = token ? null : guestId;
    const callBack = `${window.location.origin}/checkout/complete`;
    const res = await api.quoteDigitalPayment(
      {
        branch_id: branch!.id,
        order_type: orderType,
        distance: distanceKm ?? undefined,
        selected_delivery_area: selectedAreaId,
        // Sending these even though the exact mechanism the live Sadad
        // integration uses to carry them through to the real order isn't
        // visible from the code available here (see the note above
        // quoteDigitalPayment in api.ts) — there's no downside to including
        // them, and every other order-placement path on this site requires
        // them, so omitting them here would only risk repeating the
        // "silently created with no delivery info" bug found earlier.
        delivery_address_id: orderType === "delivery" ? selectedAddressId : null,
        order_note: orderNote || undefined,
        time_slot_id: selectedTimeSlotId,
        delivery_date: selectedDate,
        coupon_code: couponDiscount > 0 ? couponCode.trim() : undefined,
        payment_method: paymentMethod,
        payment_platform: "web",
        call_back: callBack,
        is_guest: token ? 0 : 1,
      },
      { token, guestId: orderGuestId }
    );
    if (!res.redirect_link) {
      throw new Error(t("checkout.errorStartPayment"));
    }
    // No client-side "confirm" step for this gateway (see api.ts) — the
    // order is created server-side, only on real success, by the time the
    // customer's browser lands back on /checkout/complete. The only thing
    // worth saving beforehand is the amount for the Pixel Purchase event on
    // that return page, since the redirect back carries no order/amount
    // info of its own (see checkout/complete/page.tsx) — sessionStorage,
    // not localStorage: this is purely for one analytics event on the very
    // next page load, not something that should linger.
    try {
      sessionStorage.setItem("am-pending-purchase-value", String(total));
    } catch {}
    window.location.href = res.redirect_link;
  }

  async function placeOrder() {
    setPlaceError("");
    if (!validateBeforePlacing()) return;

    setPlacing(true);
    try {
      if (paymentMethod === "cash_on_delivery") {
        await placeCodOrder();
      } else {
        await placeDigitalOrder();
      }
    } catch (e) {
      setPlaceError(e instanceof Error ? e.message : t("checkout.errorPlacingOrder"));
      setPlacing(false);
    }
    // No `finally` — a successful call always navigates away (either an
    // internal route or window.location.href to the gateway), so leaving
    // the button disabled through that transition is correct; only the
    // error path needs to re-enable it.
  }

  if (items.length === 0) {
    return (
      <div className="max-w-[600px] mx-auto px-5 py-20 text-center">
        <p className="text-am-text-muted mb-6">{t("cart.empty.body")}</p>
        <Link href="/" className="inline-block bg-am-primary text-white font-bold px-7 py-3 rounded-full">{t("common.startShopping")}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8 am-fade-in">
      <CheckoutAbandonmentOffer onApply={(code) => applyCoupon(code)} hasDiscount={couponDiscount > 0} />
      <h1 className="text-xl font-bold text-am-text mb-6">{t("checkout.title")}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
        <div className="flex flex-col gap-6">
          {/* Order type — only shown when the store actually offers a choice.
              Self Pickup is currently off for this store, which left this
              section showing a single, non-interactive "Delivery" button
              with nothing to pick between; hiding it here (rather than
              deleting the feature) means it reappears automatically, with a
              real choice, if Self Pickup is ever turned on. */}
          {!!config.self_pickup && (
            <section className="bg-white border border-am-border rounded-2xl p-6">
              <h2 className="font-bold text-am-text mb-4">{t("checkout.deliveryMethod")}</h2>
              <div className="flex gap-3">
                <button onClick={() => setOrderType("delivery")} className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-colors ${orderType === "delivery" ? "border-am-primary bg-am-primary/10 text-am-primary-dark" : "border-am-border text-am-text-muted"}`}>
                  🚚 {t("checkout.delivery")}
                </button>
                <button onClick={() => setOrderType("self_pickup")} className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-colors ${orderType === "self_pickup" ? "border-am-primary bg-am-primary/10 text-am-primary-dark" : "border-am-border text-am-text-muted"}`}>
                  🏪 {t("checkout.selfPickup")}
                </button>
              </div>
            </section>
          )}

          {/* Address */}
          {orderType === "delivery" && (token || guestCheckoutChosen) && (
            <section className="bg-white border border-am-border rounded-2xl p-6">
              <h2 className="font-bold text-am-text mb-4">{t("checkout.deliveryAddress")}</h2>
              {(() => {
                const selected = addresses.find((a) => a.id === selectedAddressId) ?? null;
                // Collapsed summary once something is selected and the user
                // hasn't asked to change it — the full radio list only
                // reappears on demand via "Change", or automatically when
                // there's nothing valid selected yet (e.g. no addresses at
                // all, or right after this component mounts).
                if (selected && !changingAddress) {
                  return (
                    <div className="flex items-start justify-between gap-3 border border-am-primary bg-am-primary/5 rounded-xl p-3.5 mb-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-lg leading-none mt-0.5 shrink-0">📍</span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-am-text">{selected.address_type}</div>
                          <div className="text-[13px] text-am-text-muted truncate">{selected.address}</div>
                          {selected.contact_person_number && (
                            <div className="text-[12px] text-am-text-muted/80 mt-0.5">{selected.contact_person_name ? `${selected.contact_person_name} · ` : ""}{selected.contact_person_number}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => startEditAddress(selected)}
                          aria-label={t("checkout.edit")}
                          className="text-[13px] font-semibold text-am-text-muted hover:text-am-primary-dark hover:underline"
                        >
                          ✏️ {t("checkout.edit")}
                        </button>
                        <button
                          onClick={() => setChangingAddress(true)}
                          className="text-[13px] font-semibold text-am-primary-dark hover:underline"
                        >
                          {t("checkout.change")}
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-2.5 mb-4">
                    {addresses.length === 0 && (
                      <p className="text-[13px] text-am-text-muted">{t("checkout.noAddressSelected")}</p>
                    )}
                    {addresses.map((a) => (
                      <div key={a.id} className={`flex items-start gap-3 border rounded-xl p-3.5 transition-colors ${selectedAddressId === a.id ? "border-am-primary bg-am-primary/5" : "border-am-border"}`}>
                        <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                          <input
                            type="radio"
                            checked={selectedAddressId === a.id}
                            onChange={() => {
                              setSelectedAddressId(a.id);
                              setChangingAddress(false);
                            }}
                            className="mt-1"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">{a.address_type}</div>
                            <div className="text-[13px] text-am-text-muted">{a.address}</div>
                          </div>
                        </label>
                        <button
                          onClick={() => startEditAddress(a)}
                          aria-label={t("checkout.edit")}
                          className="text-[12px] font-semibold text-am-text-muted hover:text-am-primary-dark shrink-0 mt-0.5"
                        >
                          ✏️
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {!showNewAddress ? (
                <button onClick={() => setShowNewAddress(true)} className="text-[13px] font-semibold text-am-primary-dark hover:underline">{t("checkout.addNewAddress")}</button>
              ) : (
                <div className="flex flex-col gap-3 border border-am-border rounded-xl p-4">
                  <div className="text-[13px] font-bold text-am-text">
                    {editingAddressId != null ? t("checkout.editAddress") : t("checkout.addNewAddress")}
                  </div>
                  {!token && (
                    <input placeholder={t("checkout.guestName")} value={newAddress.contact_person_name} onChange={(e) => setNewAddress((f) => ({ ...f, contact_person_name: e.target.value }))} className="border border-am-border rounded-lg px-3 py-2 text-sm" />
                  )}
                  <input placeholder={t("checkout.fullAddress")} value={newAddress.address} onChange={(e) => setNewAddress((f) => ({ ...f, address: e.target.value }))} className="border border-am-border rounded-lg px-3 py-2 text-sm" />
                  {/* Guest-only: typing a phone number already saved under
                      this same guest-id auto-fills the rest of the form
                      from that earlier address — see handleGuestPhoneChange
                      for why this can't reach across devices/sessions. */}
                  <input
                    placeholder={t("checkout.contactPhone")}
                    value={newAddress.contact_person_number}
                    onChange={(e) => (token ? setNewAddress((f) => ({ ...f, contact_person_number: e.target.value })) : handleGuestPhoneChange(e.target.value))}
                    className="border border-am-border rounded-lg px-3 py-2 text-sm"
                  />
                  {/* Home/Office/Other only makes sense for a registered
                      customer's own saved, reusable addresses — a guest
                      identity is good for one order, not a multi-address
                      book, so this stays token-only (same reasoning as
                      GuestTab's hardcoded "Home" label in
                      CheckoutAccountModal.tsx). The real interactive map
                      below it, though, is for everyone: raw lat/lng text
                      boxes were never something a real customer should
                      have to type by hand either. */}
                  {token && (
                    <AddressTypeSelector
                      value={newAddress.address_type}
                      onChange={(v) => setNewAddress((f) => ({ ...f, address_type: v }))}
                    />
                  )}
                  <MapLocationPicker
                    latitude={newAddress.latitude}
                    longitude={newAddress.longitude}
                    onChange={(lat, lng) => setNewAddress((f) => ({ ...f, latitude: lat, longitude: lng }))}
                  />
                  <div className="flex gap-2">
                    <button onClick={saveNewAddress} disabled={addrSaving || !newAddress.address.trim() || !newAddress.contact_person_number.trim()} className="bg-am-primary text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">{addrSaving ? t("common.saving") : editingAddressId != null ? t("checkout.saveChanges") : t("checkout.saveAddress")}</button>
                    <button
                      onClick={() => {
                        setShowNewAddress(false);
                        setEditingAddressId(null);
                        setNewAddress({ address_type: "Home", address: "", latitude: "", longitude: "", contact_person_number: "", contact_person_name: "" });
                      }}
                      className="text-sm text-am-text-muted px-4 py-2"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Delivery Time — unconditional in the real app: every order
              (delivery or self pickup) carries a time_slot_id + delivery_date,
              even though the backend won't reject an order missing them —
              it just silently creates one with no delivery time, which is
              the bug this section fixes. */}
          <section className="bg-white border border-am-border rounded-2xl p-6">
            <h2 className="font-bold text-am-text mb-4">{t("checkout.deliveryTime")}</h2>
            <div className="flex gap-2 mb-4">
              {dateList.map((ymd, i) => {
                const off = offDays.includes(ymd);
                const label = i === 0 ? t("checkout.today") : i === 1 ? t("checkout.tomorrow") : new Date(ymd + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
                return (
                  <button
                    key={ymd}
                    disabled={off}
                    onClick={() => setSelectedDateIndex(i)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                      off
                        ? "opacity-40 cursor-not-allowed border-am-border text-am-text-muted"
                        : selectedDateIndex === i
                          ? "border-am-primary bg-am-primary/10 text-am-primary-dark"
                          : "border-am-border text-am-text-muted"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {isSelectedDateOff ? (
              <p className="text-am-error text-sm">{t("checkout.deliveryNotAvailable")}</p>
            ) : availableSlots.length === 0 ? (
              <p className="text-am-text-muted text-sm">{t("checkout.noTimeSlotsAvailable")}</p>
            ) : (
              <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {availableSlots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedTimeSlotId(slot.id)}
                    className={`shrink-0 px-4 py-2.5 rounded-xl border text-sm font-semibold whitespace-nowrap transition-colors ${selectedTimeSlotId === slot.id ? "border-am-primary bg-am-primary/10 text-am-primary-dark" : "border-am-border text-am-text-muted"}`}
                  >
                    {formatSlotTime(slot.start_time)} – {formatSlotTime(slot.end_time)}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Delivery Area — only shown for branches priced by named zone
              rather than fixed rate or distance (delivery_charge_type ===
              "area"); this store currently uses "fixed", so this section is
              normally hidden, but stays correct if that's ever switched on
              in the admin panel. */}
          {orderType === "delivery" && deliveryChargeType === "area" && (branchDeliveryInfo?.delivery_charge_by_area.length ?? 0) > 0 && (
            <section className="bg-white border border-am-border rounded-2xl p-6">
              <h2 className="font-bold text-am-text mb-4">{t("checkout.deliveryArea")}</h2>
              <div className="flex flex-col gap-2.5">
                {branchDeliveryInfo!.delivery_charge_by_area.map((area) => (
                  <label key={area.id} className={`flex items-center justify-between gap-3 border rounded-xl p-3.5 cursor-pointer transition-colors ${selectedAreaId === area.id ? "border-am-primary bg-am-primary/5" : "border-am-border"}`}>
                    <span className="flex items-center gap-3">
                      <input type="radio" checked={selectedAreaId === area.id} onChange={() => setSelectedAreaId(area.id)} />
                      <span className="text-sm font-semibold">{area.area_name}</span>
                    </span>
                    <span className="text-sm text-am-text-muted">{api.formatCurrency(area.delivery_charge, config)}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Payment */}
          <section className="bg-white border border-am-border rounded-2xl p-6">
            <h2 className="font-bold text-am-text mb-4">{t("checkout.paymentMethod")}</h2>
            <div className="flex flex-col gap-2.5">
              {!!config.cash_on_delivery && (
                <label className={`flex items-center gap-3 border rounded-xl p-3.5 cursor-pointer ${paymentMethod === "cash_on_delivery" ? "border-am-primary bg-am-primary/5" : "border-am-border"}`}>
                  <input type="radio" checked={paymentMethod === "cash_on_delivery"} onChange={() => setPaymentMethod("cash_on_delivery")} />
                  <span className="text-sm font-semibold">💵 {t("checkout.cashOnDelivery")}</span>
                </label>
              )}
              {config.active_payment_method_list?.map((gateway) => {
                const logo = api.imageUrl(config.base_urls, "gateway_image_url", gateway.gateway_image);
                return (
                  <label key={gateway.gateway} className={`flex items-center gap-3 border rounded-xl p-3.5 cursor-pointer ${paymentMethod === gateway.gateway ? "border-am-primary bg-am-primary/5" : "border-am-border"}`}>
                    <input type="radio" checked={paymentMethod === gateway.gateway} onChange={() => setPaymentMethod(gateway.gateway)} />
                    {logo ? (
                      <Image src={logo} alt={gateway.gateway_title} width={64} height={20} className="h-5 w-auto" />
                    ) : null}
                    <span className="text-sm font-semibold">{gateway.gateway_title}</span>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Note */}
          <section className="bg-white border border-am-border rounded-2xl p-6">
            <h2 className="font-bold text-am-text mb-3">{t("checkout.orderNote")}</h2>
            <textarea value={orderNote} onChange={(e) => setOrderNote(e.target.value)} rows={3} className="w-full border border-am-border rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:border-am-primary" placeholder={t("checkout.orderNotePlaceholder")} />
          </section>
        </div>

        {/* Summary */}
        <div className="bg-white border border-am-border rounded-2xl p-6 h-fit sticky top-24">
          <h2 className="font-bold text-am-text mb-4">{t("cart.orderSummary")}</h2>
          <div className="flex gap-2 mb-4">
            <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder={t("cart.couponCode")} className="flex-1 min-w-0 border border-am-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-am-primary" />
            <button onClick={() => applyCoupon()} className="shrink-0 border border-am-border bg-am-bg-alt text-am-primary-dark text-[13px] font-bold px-4 py-2 rounded-lg hover:bg-am-primary hover:text-white hover:border-am-primary transition-colors">{t("cart.apply")}</button>
          </div>
          {couponMsg && <p className={`text-[12px] mb-3 ${couponDiscount > 0 ? "text-am-success" : "text-am-error"}`}>{couponMsg}</p>}

          <div className="flex justify-between text-sm mb-2.5"><span className="text-am-text-muted">{t("cart.subtotal")}</span><span className="font-semibold">{api.formatCurrency(subtotal, config)}</span></div>
          <div className="flex justify-between text-sm mb-2.5"><span className="text-am-text-muted">{t("checkout.delivery")}</span><span className="font-semibold">{deliveryFree ? <span className="text-am-success">{t("common.currencyFree")}</span> : api.formatCurrency(deliveryFee, config)}</span></div>
          {couponDiscount > 0 && <div className="flex justify-between text-sm mb-2.5"><span className="text-am-text-muted">{t("checkout.coupon")}</span><span className="font-semibold text-am-success">−{api.formatCurrency(couponDiscount, config)}</span></div>}
          <div className="flex justify-between text-base font-bold mb-5 pt-3 border-t border-am-border"><span>{t("cart.total")}</span><span className="text-am-primary-dark">{api.formatCurrency(total, config)}</span></div>

          {placeError && <p className="text-am-error text-[12.5px] mb-3">{placeError}</p>}

          <button onClick={placeOrder} disabled={placing} className="w-full bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-full transition-colors">
            {placing ? t("checkout.placingOrder") : `${t("checkout.placeOrder")} ${api.formatCurrency(total, config)}`}
          </button>
        </div>
      </div>

      {showAccountModal && <CheckoutAccountModal onGuest={chooseGuestCheckout} onGuestReturning={continueAsReturningGuest} onClose={() => setModalRequested(false)} />}
    </div>
  );
}
