/**
 * Types mirror the real API response shapes exactly (verified live against
 * admin.almarwah.qa/api/v1 and cross-checked against the Flutter app's own
 * Dart models), not guessed.
 */

export interface Category {
  id: number;
  name: string;
  parent_id: number;
  position: number;
  status: number;
  image: string | null;
  priority: number;
}

export interface RatingBucket {
  rating: number;
  total: number;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  image: string[];
  price: number;
  variations: unknown[];
  tax: number;
  status: number;
  unit: string;
  total_stock: number;
  capacity: number;
  daily_needs: number;
  popularity_count: number;
  is_featured: number;
  view_count: number;
  maximum_order_quantity: number;
  weight: number;
  wishlist_count?: number;
  active_reviews_count?: number;
  discount: number;
  discount_type: "percent" | "amount" | string;
  tax_type: "percent" | "amount" | string;
  category_ids: { id: string; position: number }[];
  rating: RatingBucket[];
  active_reviews?: Review[];
}

export interface Review {
  id: number;
  comment: string;
  rating: number;
  customer_name?: string;
  created_at: string;
}

export interface Banner {
  id: number;
  title: string;
  image: string;
  product_id: number | null;
  category_id: number | null;
  status: number;
}

export interface ProductListResponse {
  total_size: number;
  limit: string | number;
  offset: string | number;
  products: Product[];
}

export interface BaseUrls {
  product_image_url: string;
  customer_image_url: string;
  banner_image_url: string;
  category_image_url: string;
  review_image_url: string;
  notification_image_url: string;
  ecommerce_image_url: string;
  delivery_man_image_url: string;
  order_image_url: string;
  [key: string]: string;
}

// A real, admin-configured digital payment gateway (e.g. Sadad). `gateway` is
// the literal identifier the backend expects back as `payment_method` when
// placing an order through it — it is not a generic "digital_payment" string.
export interface PaymentGateway {
  gateway: string;
  gateway_title: string;
  gateway_image: string;
}

export interface StoreConfig {
  ecommerce_name: string;
  ecommerce_logo: string;
  ecommerce_address: string;
  ecommerce_phone: string;
  ecommerce_email: string;
  footer_text: string;
  base_urls: BaseUrls;
  currency_symbol: string;
  currency_symbol_position: "left" | "right";
  minimum_order_value: number;
  delivery_charge: number;
  free_delivery_over_amount: number;
  free_delivery_over_amount_status: number;
  self_pickup: number;
  branches: Branch[];
  wallet_status: number;
  loyalty_point_status: number;
  cash_on_delivery: boolean | number;
  digital_payment: boolean | number;
  offline_payment: boolean | number;
  active_payment_method_list?: PaymentGateway[];
  guest_checkout: boolean | number;
  social_login: { google?: number; facebook?: number };
  [key: string]: unknown;
}

export interface Branch {
  id: number;
  name: string;
  email: string;
  longitude: string;
  latitude: string;
  address: string;
  coverage: number;
  status: number;
}

// The real per-branch pricing rules, from GET /config/delivery-fee — the
// actual server-authoritative source for delivery cost. `config.delivery_charge`
// (on StoreConfig above) is a separate, unused legacy general-setting field:
// the backend's own order-placement code (Helpers::get_delivery_charge())
// never reads it, so it must never be used to price an order or its display.
export interface DeliveryChargeSetup {
  id: number;
  branch_id: number;
  delivery_charge_type: "fixed" | "distance" | "area";
  delivery_charge_per_kilometer: number;
  minimum_delivery_charge: number;
  minimum_distance_for_free_delivery: number;
  fixed_delivery_charge: number;
}

export interface DeliveryChargeByArea {
  id: number;
  branch_id: number;
  area_name: string;
  delivery_charge: number;
}

export interface BranchDeliveryFeeInfo {
  id: number; // branch_id
  name: string;
  status: number;
  delivery_charge_setup: DeliveryChargeSetup | null;
  delivery_charge_by_area: DeliveryChargeByArea[];
}

// GET /timeSlot — global (not per-branch) delivery time windows. The
// checkout flow always sends one of these (by id) plus a delivery_date;
// the backend never rejects an order missing them, but silently persists
// time_slot_id/delivery_date as NULL, which is why this needs to be a real
// UI, not just an optional afterthought.
export interface TimeSlot {
  id: number;
  start_time: string; // "HH:MM:SS"
  end_time: string; // "HH:MM:SS"
  status: number;
}

export interface CartItem {
  id: number;
  user_id: number;
  product_id: number;
  is_guest: boolean;
  price: number;
  tax: number;
  discount: number;
  discount_type: string;
  quantity: number;
  variation: unknown;
  product: Product;
}

export interface AuthUser {
  id: number;
  f_name: string;
  l_name: string;
  email: string;
  phone: string;
  image?: string | null;
}

export interface LoginResponse {
  token: string;
  is_phone_verified?: boolean;
  is_personal_info_added?: boolean;
}

export interface Address {
  id: number;
  address_type: string;
  contact_person_name?: string;
  contact_person_number: string;
  address: string;
  latitude: string;
  longitude: string;
  is_billing?: number;
}

export interface Order {
  id: number;
  user_id: number;
  order_amount: number;
  payment_status: string;
  order_status: string;
  payment_method: string;
  created_at: string;
  order_type: string;
  details_count?: number;
}
