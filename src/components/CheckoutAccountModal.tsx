"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as api from "@/lib/api";
import { normalizeQatarPhone } from "@/lib/phone";
import { useAuthStore } from "@/lib/store/auth";
import { useCartStore } from "@/lib/store/cart";
import { useLanguage } from "@/lib/store/language";
import MapLocationPicker from "@/components/MapLocationPicker";
import type { Address } from "@/lib/types";

type Tab = "signin" | "register" | "guest";

// The one moment in checkout where an unauthenticated customer needs to
// make a real choice — a tabbed modal (Sign In / Create Account / Guest),
// each tab a genuine inline form rather than a link that navigates away.
// Signing in or registering here calls the exact same API the standalone
// /login and /register pages use and stores the session the same way
// (useAuthStore.setSession) — the parent checkout page's own
// `showAccountModal` (computed from `!token`) then goes false on its own
// next render and this modal simply stops being rendered, no explicit
// "close" callback needed for those two tabs.
//
// Guest checkout genuinely needs the backend's is_guest/guest_id fields
// (confirmed by reading the Laravel source earlier in this project), so
// it isn't a dead end either — it collects everything a guest order
// actually needs right here (phone, name, delivery address, and map
// coordinates) instead of being a bare "skip" link that dumps the visitor
// onto a second, separate address form. The coordinates matter for more
// than show: the real delivery-fee calculation (getDistanceKm() in
// checkout/page.tsx) needs a lat/lng pair to compute distance-based
// pricing — without this tab collecting them, a guest order had no way to
// get one at all, and silently priced delivery as if distance were zero.
export default function CheckoutAccountModal({
  onGuest,
  onGuestReturning,
  onClose,
}: {
  onGuest: (details: { phone: string; name: string; address: string; addressType: string; latitude: string; longitude: string }) => void;
  // A returning guest — same browser, same guest-id, already has at least
  // one saved address from a previous visit — skips straight to checkout
  // with an existing address instead of being made to retype everything.
  // See GuestTab's own effect for how "returning" is actually detected.
  onGuestReturning: (address: Address) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("signin");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "signin", label: t("checkoutAuth.signIn"), icon: "🔑" },
    { key: "register", label: t("checkoutAuth.createAccount"), icon: "✨" },
    { key: "guest", label: t("checkoutAuth.guestTab"), icon: "🛍️" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-am-text/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("checkoutAuth.title")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-[440px] w-full overflow-hidden am-fade-in relative">
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute top-4 end-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-am-text-muted hover:bg-am-bg hover:text-am-text transition-colors"
        >
          ✕
        </button>
        <div className="px-8 pt-8 pb-5 text-center border-b border-am-border">
          <div className="text-4xl mb-3">🛍️</div>
          <h2 className="text-xl font-bold text-am-text mb-1.5">{t("checkoutAuth.title")}</h2>
          <p className="text-[13px] text-am-text-muted leading-relaxed">{t("checkoutAuth.subtitle")}</p>
        </div>

        <div className="flex px-3 pt-3 gap-1" role="tablist">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              role="tab"
              aria-selected={tab === tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[12.5px] font-bold pb-3 border-b-2 transition-colors ${
                tab === tb.key ? "border-am-primary text-am-primary-dark" : "border-transparent text-am-text-faint hover:text-am-text-muted"
              }`}
            >
              <span>{tb.icon}</span> {tb.label}
            </button>
          ))}
        </div>

        <div className="p-8 pt-6">
          {tab === "signin" && <SignInTab />}
          {tab === "register" && <RegisterTab />}
          {tab === "guest" && <GuestTab onGuest={onGuest} onGuestReturning={onGuestReturning} />}
        </div>
      </div>
    </div>,
    document.body
  );
}

function SignInTab() {
  const { t } = useLanguage();
  const setSession = useAuthStore((s) => s.setSession);
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const isEmail = emailOrPhone.includes("@");
      const identifier = isEmail ? emailOrPhone : normalizeQatarPhone(emailOrPhone);
      const res = await api.login(identifier, password, isEmail ? "email" : "phone");
      setSession(res.token);
      // No further action needed here — the parent's showAccountModal is
      // computed from `!token`, so setting the session alone makes this
      // whole modal stop rendering on the next tick.
    } catch (err) {
      setError(err instanceof api.ApiError ? t("auth.invalidCredentials") : t("auth.somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <div className="bg-am-error/10 text-am-error text-[13px] rounded-lg px-4 py-2.5">{error}</div>}
      <div>
        <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.phone")}</label>
        <input
          type="text"
          required
          value={emailOrPhone}
          onChange={(e) => setEmailOrPhone(e.target.value)}
          placeholder="66XXXXXX"
          className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
        />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.password")}</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-full transition-colors mt-1"
      >
        {loading ? t("auth.signingIn") : t("checkoutAuth.signIn")}
      </button>
    </form>
  );
}

function RegisterTab() {
  const { t } = useLanguage();
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({ f_name: "", l_name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.register({ ...form, phone: normalizeQatarPhone(form.phone) });
      setSession(res.token);
    } catch {
      setError(t("auth.registerError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <div className="bg-am-error/10 text-am-error text-[13px] rounded-lg px-4 py-2.5">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.firstName")}</label>
          <input required value={form.f_name} onChange={(e) => update("f_name", e.target.value)} className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.lastName")}</label>
          <input required value={form.l_name} onChange={(e) => update("l_name", e.target.value)} className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.email")}</label>
        <input type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.phone")}</label>
        <input required value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="66XXXXXX" className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("auth.password")}</label>
        <input type="password" required minLength={6} value={form.password} onChange={(e) => update("password", e.target.value)} className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary" />
      </div>
      <button type="submit" disabled={loading} className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-full transition-colors mt-1">
        {loading ? t("auth.creatingAccount") : t("checkoutAuth.createAccount")}
      </button>
    </form>
  );
}

function GuestTab({
  onGuest,
  onGuestReturning,
}: {
  onGuest: (details: { phone: string; name: string; address: string; addressType: string; latitude: string; longitude: string }) => void;
  onGuestReturning: (address: Address) => void;
}) {
  const { t } = useLanguage();
  const guestId = useCartStore((s) => s.guestId);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: string; lng: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // This browser's own guest-id already has saved addresses from an
  // earlier visit (see api.getAddressesFor — scoped by the same guest-id
  // header/param every other guest call here uses) — checked once, right
  // when the tab opens, so a returning guest can skip straight to checkout
  // with what they already gave us instead of retyping phone/name/address
  // every single time. "loading" starts true so the blank form doesn't
  // flash before this check resolves.
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [continuingId, setContinuingId] = useState<number | null>(null);

  useEffect(() => {
    if (!guestId) {
      setLoadingSaved(false);
      return;
    }
    let cancelled = false;
    api
      .getAddressesFor({ token: null, guestId })
      .then((addrs) => {
        if (!cancelled) setSavedAddresses(addrs);
      })
      .catch(() => {
        if (!cancelled) setSavedAddresses([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guestId]);

  async function continueWithSaved(a: Address) {
    setContinuingId(a.id);
    try {
      await onGuestReturning(a);
    } finally {
      setContinuingId(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !address.trim()) return;
    setSubmitting(true);
    try {
      await onGuest({
        phone: phone.trim(),
        name: name.trim(),
        address: address.trim(),
        // A guest identity is only good for this one order — there's no
        // persistent account for "Home" vs "Office" to mean anything
        // across future visits, so unlike a registered customer's saved
        // addresses, this isn't a real choice worth asking a guest to
        // make. A single neutral label is all the backend's required
        // address_type field needs here.
        addressType: "Home",
        latitude: coords?.lat ?? "",
        longitude: coords?.lng ?? "",
      });
      // onGuest flips guestCheckoutChosen in the parent, which makes this
      // whole modal stop rendering — no local "done" state needed. If it
      // throws (ensureGuest() failing), submitting resets below so the
      // visitor can just try again.
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingSaved) {
    return <p className="text-[13px] text-am-text-muted text-center py-6">{t("common.loading")}</p>;
  }

  // Welcome-back shortcut — shown instead of the blank form whenever this
  // guest-id already has at least one saved address, unless they explicitly
  // ask for "+ Add a new address" (addingNew) below.
  if (savedAddresses.length > 0 && !addingNew) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-am-text-muted -mt-1 leading-relaxed">{t("checkoutAuth.welcomeBack")}</p>
        <div className="flex flex-col gap-2.5">
          {savedAddresses.map((a) => (
            <button
              key={a.id}
              onClick={() => continueWithSaved(a)}
              disabled={continuingId !== null}
              className="flex items-start gap-3 border border-am-border rounded-xl p-3.5 text-start hover:border-am-primary hover:bg-am-primary/5 transition-colors disabled:opacity-60"
            >
              <span className="text-lg leading-none mt-0.5 shrink-0">📍</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-am-text">{a.address_type}</div>
                <div className="text-[13px] text-am-text-muted truncate">{a.address}</div>
                {a.contact_person_number && (
                  <div className="text-[12px] text-am-text-muted/80 mt-0.5">
                    {a.contact_person_name ? `${a.contact_person_name} · ` : ""}
                    {a.contact_person_number}
                  </div>
                )}
              </div>
              {continuingId === a.id ? (
                <span className="text-[12px] text-am-primary-dark shrink-0 mt-1">{t("common.loading")}</span>
              ) : (
                <span className="text-[12px] font-bold text-am-primary-dark shrink-0 mt-1">→</span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="text-[13px] font-semibold text-am-primary-dark hover:underline self-start"
        >
          {t("checkout.addNewAddress")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-[12.5px] text-am-text-muted -mt-1 leading-relaxed">{t("checkoutAuth.guestIntro")}</p>
      {savedAddresses.length > 0 && (
        <button type="button" onClick={() => setAddingNew(false)} className="text-[12.5px] font-semibold text-am-primary-dark hover:underline self-start -mt-2">
          ← {t("checkoutAuth.useSavedAddress")}
        </button>
      )}
      <div>
        <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("checkout.contactPhone")}</label>
        <input
          type="text"
          required
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("track.phonePlaceholder")}
          className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
        />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("checkout.guestName")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("checkout.guestNamePlaceholder")}
          className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
        />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("checkout.fullAddress")}</label>
        <input
          type="text"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t("checkoutAuth.addressPlaceholder")}
          className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
        />
      </div>

      <MapLocationPicker latitude={coords?.lat} longitude={coords?.lng} onChange={(lat, lng) => setCoords({ lat, lng })} />

      <button
        type="submit"
        disabled={submitting || !phone.trim() || !address.trim()}
        className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-full transition-colors mt-1"
      >
        {submitting ? t("common.loading") : `${t("checkoutAuth.continueAsGuest")} →`}
      </button>
    </form>
  );
}
