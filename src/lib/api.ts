import type {
  Category,
  Product,
  ProductListResponse,
  Banner,
  StoreConfig,
  CartItem,
  LoginResponse,
  Address,
  Order,
  BranchDeliveryFeeInfo,
  TimeSlot,
} from "./types";
import type { Locale } from "./i18n/translations";

// Sent as the backend's `X-localization` header (Localization middleware —
// confirmed by reading its source: it reads exactly this header, defaults
// to 'en' if absent, and never looks at a query param) on every
// product/category-fetching call below. A `&locale=` query param is also
// appended purely to give Next.js's fetch cache a distinct cache key per
// language — the backend itself ignores unknown query params — since a GET
// request cached under one language's response must never be silently
// served to the other language.
function localeParams(locale: Locale = "en"): { headers: Record<string, string>; qs: string } {
  return { headers: { "X-localization": locale }, qs: `&locale=${locale}` };
}

export const API_BASE = "https://admin.almarwah.qa/api/v1";
export const SHOP_URL = "https://shop.almarwah.qa"; // legacy Flutter app — referenced for parity checks only, not linked to from this build

// Note: the backend's own Route::get('order-invoice/{id}',
// HomeController::orderInvoice) is NOT used by this app — it has no auth
// and no ownership check on sequential ids (any customer's name/phone/
// address/order can be viewed by incrementing {id}; see the route's own
// comment in routes/web.php and the "Security issue" section in README.md).
// This app builds its own printable invoice instead, at
// src/app/order-invoice/[id]/page.tsx, using GET /customer/order/details —
// which genuinely does scope to the authenticated customer's own orders.

// Meta (Facebook) Pixel id, read from a plain text file on the backend's
// own root domain (per the user's instruction — the real id "will be added
// later" to that file, no redeploy needed here once it is). MUST be fetched
// server-side, not from the browser: confirmed live that
// https://admin.almarwah.qa/fb.txt sends no Access-Control-Allow-Origin
// header at all, so a client-side fetch() would be blocked by CORS before
// ever reading the content, regardless of what's in the file. Revalidated
// periodically (not `revalidate: false`) so dropping the real id in later
// goes live within a few minutes rather than needing a full redeploy.
export async function getFacebookPixelId(): Promise<string | null> {
  try {
    const res = await fetch(`${new URL(API_BASE).origin}/fb.txt`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    // Real Meta Pixel ids are long numeric strings — this also rejects the
    // current live placeholder content ("..") with no special-casing.
    return /^\d{10,20}$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

interface ApiOptions extends RequestInit {
  token?: string | null;
  revalidate?: number | false;
}

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// The one place that turns a thrown error from any api.ts call into text a
// customer should actually see. `ApiError.message` itself is NOT that text
// — it's the raw JSON-stringified `errors` array (see apiFetch below), kept
// on the error object for logging/debugging, not display. Always go through
// this instead of `err.message` directly, which is exactly the bug this
// fixes: AddToCartPanel was showing literal `[{"code":"cart_item","message":
// "..."}]` to customers instead of the real message inside it.
export function getApiErrorMessage(err: unknown, fallback: string): string {
  const body = err instanceof ApiError ? (err.body as { errors?: { message?: string }[] } | null) : null;
  const raw = body?.errors?.[0]?.message;
  if (!raw) return fallback;
  // Some backend messages leak an untranslated Laravel translation key
  // prefix verbatim (e.g. "Messages.Item already exists" instead of just
  // "Item already exists") — a backend i18n bug, not intended copy; stripped
  // here since it means nothing to a customer.
  return raw.replace(/^messages\./i, "");
}

async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { token, revalidate, headers, ...rest } = opts;
  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  if (rest.body && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    next: revalidate === false ? undefined : { revalidate: revalidate ?? 120 },
    cache: revalidate === false ? "no-store" : undefined,
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response (rare — e.g. a proxy error page). Surface as an error below.
  }

  if (!res.ok) {
    const message =
      (json && typeof json === "object" && "errors" in json
        ? JSON.stringify((json as { errors: unknown }).errors)
        : null) ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, json);
  }
  return json as T;
}

// ── Public catalog (no auth) ────────────────────────────────────────────────

export const getConfig = () => apiFetch<StoreConfig>("/config", { revalidate: 3600 });

// The REAL per-branch delivery pricing rules — never use `config.delivery_charge`
// (the general-settings field above) to price or display a delivery fee; the
// backend's own order-placement code never reads it (confirmed by reading
// Helpers::get_delivery_charge() and CalculateOrderDataTrait::calculateOrderAmount()
// in the Laravel source). This is the endpoint the Flutter app actually uses
// to compute checkout's delivery fee.
export const getDeliveryFeeInfo = () =>
  apiFetch<BranchDeliveryFeeInfo[]>("/config/delivery-fee", { revalidate: 3600 });

// Delivery time slots — unconditional in both the real backend and the
// Flutter app (no business-setting gates this feature off). The order
// table has time_slot_id/delivery_date columns that StoreOrderRequest
// never validates, so a checkout that skips this silently creates orders
// with no delivery time rather than failing loudly — this is what was
// happening here.
export const getTimeSlots = () => apiFetch<TimeSlot[]>("/timeSlot", { revalidate: 300 });
export const getDeliveryOffDays = () => apiFetch<string[]>("/delivery-off-days", { revalidate: 300 });

// Mirrors MapApiController::distanceApi — a thin server-side proxy over
// Google's Routes API (computeRouteMatrix) that keeps the Maps API key off
// the client. Returns raw distance in kilometers, or null if the call fails
// (e.g. quota, network) so callers can fall back to a straight-line estimate,
// same as the Flutter app does with Geolocator.distanceBetween.
export async function getDistanceKm(originLat: number, originLng: number, destLat: number, destLng: number): Promise<number | null> {
  try {
    const res = await apiFetch<{ distanceMeters?: number }[]>(
      `/mapapi/distance-api?origin_lat=${originLat}&origin_lng=${originLng}&destination_lat=${destLat}&destination_lng=${destLng}`,
      { revalidate: false }
    );
    const meters = res?.[0]?.distanceMeters;
    return typeof meters === "number" ? meters / 1000 : null;
  } catch {
    return null;
  }
}

// Straight-line (haversine) fallback distance in km, used only if the Google
// Routes proxy above fails — matches the Flutter app's own fallback
// (Geolocator.distanceBetween) closely enough for delivery-fee estimation.
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Exact mirror of the backend's Helpers::get_delivery_charge() (PHP) / the
// Flutter app's CheckOutHelper.getDeliveryCharge() — same three modes, same
// clamping. Used only to show the customer an accurate price during
// checkout; the actual charge is always recomputed authoritatively
// server-side from branch_id/distance/selected_delivery_area when the order
// is placed, so this can never under- or over-charge anyone even if it
// drifts — it would only ever show a momentarily wrong preview.
export function computeDeliveryCharge(
  info: BranchDeliveryFeeInfo | undefined,
  distanceKm: number | null,
  selectedAreaId: number | null
): number {
  const setup = info?.delivery_charge_setup;
  if (!setup) return 0;
  if (setup.delivery_charge_type === "area") {
    const area = info!.delivery_charge_by_area.find((a) => a.id === selectedAreaId);
    return area?.delivery_charge ?? 0;
  }
  if (setup.delivery_charge_type === "distance") {
    if (distanceKm === null) return 0; // unknown yet — show nothing rather than guess
    if (distanceKm < setup.minimum_distance_for_free_delivery) return 0;
    return Math.max(distanceKm * setup.delivery_charge_per_kilometer, setup.minimum_delivery_charge);
  }
  return setup.fixed_delivery_charge;
}
// Category `name` is translated automatically at the model level
// (Category::getNameAttribute() — confirmed by reading the source: it
// returns the matching `ar`-locale translation row's value when one
// exists, the original column value otherwise), so sending the locale
// header here is enough — no separate detection heuristic is needed for
// categories the way there is for products below.
export const getCategories = (locale: Locale = "en") => {
  const { headers } = localeParams(locale);
  return apiFetch<Category[]>(`/categories?locale=${locale}`, { revalidate: 3600, headers });
};
export const getBanners = () => apiFetch<Banner[]>("/banners", { revalidate: 900 });

export const getDailyNeeds = (limit = 12, offset = 1, locale: Locale = "en") => {
  const { headers, qs } = localeParams(locale);
  return apiFetch<ProductListResponse>(`/products/daily-needs?limit=${limit}&offset=${offset}${qs}`, { revalidate: 300, headers });
};
export const getFeatured = (limit = 12, offset = 1, locale: Locale = "en") => {
  const { headers, qs } = localeParams(locale);
  return apiFetch<ProductListResponse>(`/products/featured?limit=${limit}&offset=${offset}${qs}`, { revalidate: 300, headers });
};
export const getMostReviewed = (limit = 12, offset = 1, locale: Locale = "en") => {
  const { headers, qs } = localeParams(locale);
  return apiFetch<ProductListResponse>(`/products/most-reviewed?limit=${limit}&offset=${offset}${qs}`, { revalidate: 300, headers });
};
export const getAllProducts = (limit = 24, offset = 1, sortBy?: string, locale: Locale = "en") => {
  const { headers, qs } = localeParams(locale);
  return apiFetch<ProductListResponse>(
    `/products/all?limit=${limit}&offset=${offset}${sortBy ? `&sort_by=${sortBy}` : ""}${qs}`,
    { revalidate: 180, headers }
  );
};
export const getCategoryProducts = (categoryId: number, limit = 24, offset = 1, sortBy?: string, locale: Locale = "en") => {
  const { headers, qs } = localeParams(locale);
  return apiFetch<ProductListResponse>(
    `/categories/products/${categoryId}?limit=${limit}&offset=${offset}${sortBy ? `&sort_by=${sortBy}` : ""}${qs}`,
    { revalidate: 120, headers }
  );
};
export const getProductDetails = (id: number, locale: Locale = "en") => {
  const { headers } = localeParams(locale);
  return apiFetch<Product>(`/products/details/${id}?locale=${locale}`, { revalidate: 120, headers });
};
export const searchProducts = (name: string, limit = 24, offset = 1, locale: Locale = "en") => {
  const { headers, qs } = localeParams(locale);
  return apiFetch<ProductListResponse>(
    `/products/search?name=${encodeURIComponent(name)}&limit=${limit}&offset=${offset}${qs}`,
    { revalidate: 60, headers }
  );
};

// ── Guest session ────────────────────────────────────────────────────────────

export const createGuestSession = () =>
  apiFetch<{ guest: { id: number } }>("/guest/add", { method: "POST", revalidate: false });

// ── Visitor tracking (admin's Report > Visitor Tracking page) ──────────────
// Mirrors the Flutter app's VisitorTrackingService exactly: same fields,
// same "call every ~25s + on page change" cadence — see
// src/lib/visitorTracking.ts. Public (guest_user middleware) and must never
// throw or be slow enough to notice; the backend itself always returns 200
// quickly, tracking on or off, so a network failure here is the only
// failure mode this needs to swallow.
export interface VisitorHeartbeatPayload {
  session_key: string;
  platform: "web";
  device_model?: string;
  os_version?: string;
  app_version?: string;
  current_page?: string;
  guest_id?: string | null;
}

export const sendVisitorHeartbeat = (payload: VisitorHeartbeatPayload) =>
  apiFetch<{ tracking_enabled: boolean }>("/visitor/heartbeat", {
    method: "POST",
    revalidate: false,
    body: JSON.stringify(payload),
  });

// ── Cart (works for both guest_id and authed token) ─────────────────────────

export interface CartMutationContext {
  token?: string | null;
  guestId?: number | null;
}

function withCartAuth(data: Record<string, unknown>, ctx: CartMutationContext) {
  if (!ctx.token && ctx.guestId) return { ...data, guest_id: ctx.guestId };
  return data;
}

export const getCart = (ctx: CartMutationContext) =>
  apiFetch<CartItem[]>(`/customer/cart/list${!ctx.token && ctx.guestId ? `?guest_id=${ctx.guestId}` : ""}`, {
    token: ctx.token,
    revalidate: false,
  });

export const addToCart = (
  product: Product,
  quantity: number,
  ctx: CartMutationContext
) =>
  apiFetch<CartItem[]>("/customer/cart/add", {
    method: "POST",
    token: ctx.token,
    revalidate: false,
    body: JSON.stringify(
      withCartAuth(
        {
          product_id: product.id,
          quantity,
          price: product.price,
          discount: product.discount,
          tax: product.tax,
        },
        ctx
      )
    ),
  });

export const updateCartQuantity = (cartId: number, quantity: number, ctx: CartMutationContext) =>
  apiFetch<CartItem[]>("/customer/cart/update", {
    method: "POST",
    token: ctx.token,
    revalidate: false,
    body: JSON.stringify(withCartAuth({ cart_id: cartId, quantity }, ctx)),
  });

export const removeCartItem = (cartId: number, ctx: CartMutationContext) =>
  apiFetch<CartItem[]>("/customer/cart/remove-item", {
    method: "DELETE",
    token: ctx.token,
    revalidate: false,
    body: JSON.stringify(withCartAuth({ cart_id: cartId }, ctx)),
  });

export const clearCart = (ctx: CartMutationContext) =>
  apiFetch<CartItem[]>("/customer/cart/remove", {
    method: "DELETE",
    token: ctx.token,
    revalidate: false,
    body: JSON.stringify(withCartAuth({}, ctx)),
  });

// ── Auth ─────────────────────────────────────────────────────────────────────

export const login = (emailOrPhone: string, password: string, type: "email" | "phone" = "email") =>
  apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    revalidate: false,
    body: JSON.stringify({ email_or_phone: emailOrPhone, password, type }),
  });

export const register = (payload: {
  f_name: string;
  l_name: string;
  email: string;
  phone: string;
  password: string;
}) =>
  apiFetch<LoginResponse>("/auth/register", {
    method: "POST",
    revalidate: false,
    body: JSON.stringify(payload),
  });

// Unified WhatsApp OTP login/signup — see src/app/api/otp/complete/route.ts.
// That route calls the backend's `/auth/otp-login` endpoint directly (it
// needs a shared secret that must never reach the client bundle, so it isn't
// exposed here); this file has no OTP-login function on purpose.

export const getCustomerInfo = (token: string) =>
  apiFetch<Record<string, unknown>>("/customer/info", { token, revalidate: false });

// ── Addresses ─────────────────────────────────────────────────────────────────

export const getAddresses = (token: string) =>
  apiFetch<Address[]>("/customer/address/list", { token, revalidate: false });

// The real endpoint (CustomerController::addNewAddress — a plain
// `DB::table('customer_addresses')->insert()`) returns only
// `{"message": "successfully added!"}`, never the new row's id — confirmed
// live and by reading the backend source. A caller that needs to select
// the address it just created (checkout does) must re-fetch the list
// afterward and take the newest entry (the list endpoint sorts
// `->latest()`, so index 0 is always the just-created address) — see
// getAddressesFor()/addAddressFor() below, which both work for guests too.
export const addAddress = (token: string, payload: Partial<Address>) =>
  apiFetch<{ message: string }>("/customer/address/add", {
    method: "POST",
    token,
    revalidate: false,
    body: JSON.stringify(payload),
  });

// Guest-and-token-aware versions of the two calls above, for checkout's
// "continue as guest" flow — confirmed live in the backend source that
// `/customer/address/list` and `/customer/address/add` both resolve
// identity via `auth('api')->id() ?? $request->header('guest-id')`, exactly
// like the cart/order endpoints, so a guest can save and list their own
// address the same way a logged-in customer does.
export const getAddressesFor = (ctx: CartMutationContext) =>
  apiFetch<Address[]>("/customer/address/list", {
    token: ctx.token,
    revalidate: false,
    headers: guestOrderHeaders(ctx),
  });

export const addAddressFor = (payload: Partial<Address>, ctx: CartMutationContext) =>
  apiFetch<{ message: string }>("/customer/address/add", {
    method: "POST",
    token: ctx.token,
    revalidate: false,
    headers: guestOrderHeaders(ctx),
    body: JSON.stringify(payload),
  });

// CustomerController::updateAddress — a plain `DB::table(...)->update()`
// keyed by `{id}` in the URL, guest-or-token identity resolved from the
// same `guest-id` header/auth token as every other address call. Confirmed
// against the real backend route: `PUT /customer/address/update/{id}`.
export const updateAddressFor = (id: number, payload: Partial<Address>, ctx: CartMutationContext) =>
  apiFetch<{ message: string }>(`/customer/address/update/${id}`, {
    method: "PUT",
    token: ctx.token,
    revalidate: false,
    headers: guestOrderHeaders(ctx),
    body: JSON.stringify(payload),
  });

export const removeAddress = (token: string, addressId: number) =>
  apiFetch<{ message: string }>(`/customer/address/delete?address_id=${addressId}`, {
    method: "DELETE",
    token,
    revalidate: false,
  });

// ── Orders ───────────────────────────────────────────────────────────────────

export const getOrders = (token: string) =>
  apiFetch<Order[]>("/customer/order/list", { token, revalidate: false });

// POST, not GET — confirmed by a live call: the real route only accepts
// POST (`Route::post('details', [OrderController::class,
// 'getOrderDetails'])`), and order_id is read from the body via
// `$request->all()`/`$request['order_id']`, not a query string. The
// response is an ARRAY of order line items (not a single order object) —
// also confirmed live — with the order's own summary fields (status,
// payment info, total…) nested under each item's `.order`.
export const getOrderDetails = (token: string, orderId: number) =>
  apiFetch<Record<string, unknown>[]>("/customer/order/details", {
    method: "POST",
    token,
    revalidate: false,
    body: JSON.stringify({ order_id: orderId }),
  });

// The public "Track Your Order" page's data source. `getOrderDetails()`
// above requires a customer's own auth token; this instead uses the SAME
// endpoint's separate `phone` branch (OrderController::getOrderDetails() —
// confirmed by reading the source), which needs no token and no guest-id
// header at all: it looks the order up purely by order_id + a phone match
// (against the customer's registered phone for a real account, or the
// delivery address's contact_person_number for a guest order), so any
// visitor who knows both values can check on an order without signing in.
// Kept as a POST with a JSON body — same as getOrderDetails — since that's
// the real, and only, method Route::post('details', ...) accepts.
export const getOrderDetailsByPhone = (orderId: number, phone: string) =>
  apiFetch<Record<string, unknown>[]>("/customer/order/details", {
    method: "POST",
    revalidate: false,
    body: JSON.stringify({ order_id: orderId, phone }),
  });

// A second, narrower public lookup the backend also exposes
// (OrderController::trackOrder() / POST /customer/order/track) — returns a
// single Order object (with delivery_man/partial_payment/delivery_address/
// offline_payment relations) rather than an itemized line list. Not used by
// the track page (getOrderDetailsByPhone's itemized shape is more useful
// there), but kept correct and available: it's a real, working endpoint a
// future feature could reasonably want. Previously implemented here as a
// GET with no `phone` field, which never matched the real route (POST-only)
// or its public phone-lookup branch — fixed to match the verified contract.
export const trackOrder = (orderId: number, phone?: string) =>
  apiFetch<Record<string, unknown>>("/customer/order/track", {
    method: "POST",
    revalidate: false,
    body: JSON.stringify({ order_id: orderId, phone }),
  });

export interface PlaceOrderPayload {
  cart: { product_id: number; price: number; variant?: string; discount_amount: number; quantity: number; tax_amount: number }[];
  order_amount: number;
  order_type: "delivery" | "self_pickup";
  branch_id: number;
  delivery_address_id?: number | null;
  // "cash_on_delivery" / "offline_payment" / "wallet_payment" are special-cased
  // by the backend (OrderController.php); anything else is treated as a real
  // payment gateway and must be that gateway's literal identifier from
  // config.active_payment_method_list (e.g. "sadad") — never a generic
  // "digital_payment" placeholder, which the backend doesn't recognize as any
  // configured gateway.
  payment_method: "cash_on_delivery" | "offline_payment" | "wallet_payment" | (string & {});
  order_note?: string;
  coupon_code?: string;
  coupon_discount_amount?: number;
  distance?: number;
  selected_delivery_area?: number | null;
  time_slot_id?: number | null;
  delivery_date?: string | null; // "YYYY-MM-DD"
  // The backend's validator (StoreOrderRequest) requires this to be the
  // literal integer 0 or 1 ('is_guest' => 'nullable|in:0,1') — a JS boolean
  // serializes to true/false in JSON and fails that check silently, which
  // then also fails customer_id's "required_unless:is_guest,1" rule, since
  // is_guest was never recognized as 1 in the first place.
  is_guest?: 0 | 1;
  // Required by the backend whenever is_guest is 0 — the Bearer token alone
  // does not satisfy StoreOrderRequest's `required_unless:is_guest,1` rule.
  customer_id?: number | null;
  guest_id?: number | null;
}

// Order-related endpoints (place/list/details/confirm-digital) read the
// guest's identity from an HTTP header, not the request body — confirmed by
// reading OrderController.php directly: `auth('api')->id() ?? $request->
// header('guest-id')`. This is a different convention from the cart
// endpoints (which read `guest_id` from the body — see withCartAuth above),
// so it's easy to send a guest_id that the cart accepts but this silently
// ignores, making Cart::where('user_id', null) return nothing and the order
// fail as if the cart were empty. The body field is also included since
// some code paths in that controller read it as a fallback, but the header
// is what actually identifies the guest's cart/order for this endpoint.
export function guestOrderHeaders(ctx: CartMutationContext): Record<string, string> | undefined {
  return !ctx.token && ctx.guestId ? { "guest-id": String(ctx.guestId) } : undefined;
}

// ── Digital/gateway payments (Sadad) ────────────────────────────────────────
// IMPORTANT — corrected after a live test of the actual quote call. There
// are TWO unrelated mechanisms living behind the same endpoint name in this
// codebase, and Sadad-for-web uses the older one, not the reference/confirm
// one this file used to assume:
//
//  - A newer reference + PendingDigitalPayment + confirm-digital flow
//    (DigitalPaymentController::confirm()) — this is for the NATIVE APP's
//    in-SDK card charging, where the app itself calls Sadad's SDK and then
//    tells the backend "it went through, create the order." It doesn't
//    apply here.
//  - The actual web flow (what a real call to POST /customer/payment-mobile
//    with payment_method:"sadad" returns): `{"redirect_link":
//    "https://admin.almarwah.qa/payment/sadad/pay?payment_id=<uuid>"}` —
//    no `order_amount`, no `reference`. This is Laravel's legacy
//    Payment::generate_link() multi-gateway trait: it opens a payment page
//    hosted on the BACKEND'S OWN domain, which drives the real Sadad
//    checkout, then — once payment actually succeeds — creates the real
//    order itself, server-side, via a success-hook function, and only THEN
//    redirects the browser back to `call_back` with `?flag=success` (or
//    `flag=fail`) and a base64 `token` carrying the transaction reference.
//    There is no client-side confirm step at all in this flow — by the
//    time the customer lands back on `call_back`, the order already
//    exists or doesn't. See src/app/checkout/complete/page.tsx.
//
// Caveat: the actual controller that serves `/payment/sadad/pay` and its
// success/fail redirect isn't in the codebase available for review here
// (it lives in a separately-licensed "Gateways" module) — the exact query
// param names on the return redirect are inferred with high confidence
// from every sibling gateway in this codebase sharing the same
// Processor::payment_response() helper, not confirmed from Sadad's own
// source. Verify the real callback URL with one real order before fully
// trusting the parsing in checkout/complete/page.tsx.
export interface QuoteDigitalPaymentPayload {
  branch_id: number;
  order_type: "delivery" | "self_pickup";
  distance?: number;
  selected_delivery_area?: number | null;
  delivery_address_id?: number | null;
  order_note?: string;
  time_slot_id?: number | null;
  delivery_date?: string | null;
  coupon_code?: string;
  payment_method: string;
  payment_platform: "web";
  call_back: string;
  is_guest?: 0 | 1;
}

export const quoteDigitalPayment = (payload: QuoteDigitalPaymentPayload, ctx: CartMutationContext) =>
  apiFetch<{ redirect_link: string; order_amount?: number; reference?: string }>("/customer/payment-mobile", {
    method: "POST",
    token: ctx.token,
    revalidate: false,
    headers: guestOrderHeaders(ctx),
    body: JSON.stringify(ctx.token ? payload : { ...payload, guest_id: ctx.guestId }),
  });

// Not currently used by this web storefront — see the note above
// QuoteDigitalPaymentPayload. Kept because it's a real, working endpoint
// (confirmed via source) that a future native-SDK-style web integration
// could legitimately need; today's checkout flow never calls it, since a
// real quote against the live Sadad gateway returns no `reference` for it
// to confirm.
export const confirmDigitalPayment = (reference: string, ctx: CartMutationContext, transactionReference?: string) =>
  apiFetch<{ message: string; order_id: number }>("/customer/order/confirm-digital", {
    method: "POST",
    token: ctx.token,
    revalidate: false,
    headers: guestOrderHeaders(ctx),
    body: JSON.stringify({ reference, transaction_reference: transactionReference }),
  });

export const placeOrder = (payload: PlaceOrderPayload, ctx: CartMutationContext) =>
  apiFetch<{ order_id: number; message?: string; payment_url?: string }>("/customer/order/place", {
    method: "POST",
    token: ctx.token,
    revalidate: false,
    headers: guestOrderHeaders(ctx),
    body: JSON.stringify(ctx.token ? payload : { ...payload, guest_id: ctx.guestId, is_guest: 1 }),
  });

// ── Coupons ──────────────────────────────────────────────────────────────────

export const applyCoupon = (code: string, token?: string | null) =>
  apiFetch<Record<string, unknown>>(`/coupon/apply?code=${encodeURIComponent(code)}`, { token, revalidate: false });

// ── Wishlist ─────────────────────────────────────────────────────────────────

export const getWishlist = (token: string, locale: Locale = "en") =>
  apiFetch<Product[]>("/customer/wish-list", { token, revalidate: false, headers: { "X-localization": locale } });

export const toggleWishlist = (token: string, productId: number) =>
  apiFetch<{ message: string }>("/products/favorite", {
    method: "POST",
    token,
    revalidate: false,
    body: JSON.stringify({ product_id: productId }),
  });

// ── Helpers ──────────────────────────────────────────────────────────────────

export function imageUrl(baseUrls: BaseUrlsLike | undefined, type: keyof BaseUrlsLike, filename?: string | null): string {
  if (!filename || !baseUrls) return "";
  const base = baseUrls[type];
  return base ? `${base.replace(/\/$/, "")}/${encodeURIComponent(filename)}` : "";
}
type BaseUrlsLike = Record<string, string>;

// Listing endpoints (categories/products, products/search, most-reviewed,
// featured, daily-needs, wish-list) don't filter out disabled products
// themselves — confirmed live: a product with status: 0 still comes back in
// these lists, but /products/details/{id} and /customer/cart/add both
// reject it ("Product not found!" / "Product not available"). So a disabled
// product could appear in a grid, look normal, and then fail the moment
// someone tries to open it or add it. Filter it out at render time instead.
export function isProductActive(p: Pick<Product, "status">): boolean {
  return p.status !== 0;
}

export function finalPrice(p: Pick<Product, "price" | "discount" | "discount_type">): number {
  if (!p.discount) return p.price;
  return p.discount_type === "amount" ? Math.max(0, p.price - p.discount) : Math.max(0, p.price - (p.price * p.discount) / 100);
}

export function averageRating(ratings: { rating: number; total: number }[] | undefined): number {
  if (!ratings || ratings.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const r of ratings) {
    sum += r.rating * r.total;
    count += r.total;
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
}

// The live store's currency symbol is Arabic ("ر.ق.‏" — Riyal Qatari), which
// includes a trailing RTL mark. Placed directly next to LTR digits with no
// bidi isolation, the browser's bidi algorithm reorders the Arabic letters/
// periods against the number, rendering as visibly garbled text (looked like
// "رقّ" instead of "ر.ق." next to the amount). Wrapping the symbol in Unicode
// isolate marks (FSI…PDI) fixes this everywhere at once, in plain text, with
// no JSX changes needed at any call site.
const BIDI_ISOLATE_START = "⁦"; // FIRST STRONG ISOLATE
const BIDI_ISOLATE_END = "⁩"; // POP DIRECTIONAL ISOLATE

export function formatCurrency(amount: number, config: StoreConfig | null): string {
  const rawSymbol = config?.currency_symbol ?? "QR";
  const symbol = `${BIDI_ISOLATE_START}${rawSymbol}${BIDI_ISOLATE_END}`;
  const position = config?.currency_symbol_position ?? "left";
  const formatted = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return position === "right" ? `${formatted} ${symbol}` : `${symbol} ${formatted}`;
}

export { ApiError };
