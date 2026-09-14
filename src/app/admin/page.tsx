"use client";

import { useEffect, useState } from "react";
import type { SiteSettings, CountdownPromo, ExitOffer } from "@/lib/settings/store.server";
import CountdownPromosSection from "@/components/admin/CountdownPromosSection";
import ExitOfferSection, { emptyExitOffer } from "@/components/admin/ExitOfferSection";
import VisitorsSection from "@/components/admin/VisitorsSection";
import { useAdminSessionStore } from "@/lib/store/adminSession";

// Everything here talks to src/app/api/admin/* — see those route files for
// the actual auth/persistence mechanics (httpOnly session cookie, JSON file
// on disk). This page itself holds no secrets: the password is checked
// server-side only, and this component never sees it again after the login
// request resolves. Auth state itself lives in the shared adminSession
// store (not local state) so Header.tsx's own "Dashboard / Logout"
// shortcut always agrees with this page — see that store's docblock.
export default function AdminPage() {
  const isAdmin = useAdminSessionStore((s) => s.isAdmin);
  const checked = useAdminSessionStore((s) => s.checked);
  const check = useAdminSessionStore((s) => s.check);

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAdmin) {
    // The dashboard manages its own full-bleed app-shell layout (dark
    // sidebar, sticky header) — very different from the centered-card
    // layout the login screen below still uses, so it isn't wrapped in the
    // same centering container.
    return <Dashboard />;
  }

  return (
    <div className="min-h-[85vh] bg-gradient-to-b from-am-bg via-am-bg to-am-bg-alt flex items-center justify-center px-5 py-14">
      {!checked ? (
        <div className="flex flex-col items-center gap-3 text-am-text-muted">
          <div className="w-8 h-8 border-2 border-am-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading…</p>
        </div>
      ) : (
        <LoginForm onSuccess={check} />
      )}
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "Invalid email or password.");
        return;
      }
      onSuccess();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="bg-white border border-am-border rounded-3xl shadow-[0_30px_70px_rgba(26,41,66,0.16)] overflow-hidden">
        {/* Top accent band — dark navy + gold, matching the storefront's own
            top bar, so the dashboard reads as the same brand system rather
            than a generic admin template bolted on. */}
        <div className="bg-am-text px-9 pt-9 pb-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-am-primary/15 via-transparent to-transparent" />
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-am-primary/15 border border-am-primary/30 flex items-center justify-center text-2xl mx-auto mb-4">🔐</div>
            <h1 className="text-lg font-bold text-white tracking-wide">Admin Dashboard</h1>
            <p className="text-[12.5px] text-white/60 mt-1.5">Sign in to manage AlMarwa Online</p>
          </div>
        </div>

        <div className="p-9 pt-7">
          {error && <div className="bg-am-error/10 text-am-error text-[13px] rounded-lg px-4 py-2.5 mb-4">{error}</div>}

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary focus:ring-4 focus:ring-am-primary/10 transition-shadow"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary focus:ring-4 focus:ring-am-primary/10 transition-shadow"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-full transition-colors mt-2 shadow-[0_10px_24px_rgba(196,154,60,0.35)]"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-am-text-faint mt-5">
        🔒 Your session is private to this browser and expires automatically.
      </p>
    </div>
  );
}

type Tab = "branding" | "promotions" | "exitOffer" | "content" | "visitors";
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "branding", label: "Branding & Theme", icon: "🎨" },
  { key: "promotions", label: "Promotions", icon: "🏷️" },
  { key: "exitOffer", label: "Checkout Abandonment", icon: "🎁" },
  { key: "content", label: "Page Content", icon: "📄" },
  { key: "visitors", label: "Visitors", icon: "📊" },
];

const THEME_FIELDS: { key: keyof NonNullable<SiteSettings["theme"]>; label: string; hint: string }[] = [
  { key: "primary", label: "Primary", hint: "Buttons, links, accents" },
  { key: "primaryDark", label: "Primary (Dark)", hint: "Hover states" },
  { key: "primaryLight", label: "Primary (Light)", hint: "Badges, subtle backgrounds" },
  { key: "bg", label: "Page Background", hint: "" },
  { key: "bgAlt", label: "Alt Background", hint: "Section stripes" },
  { key: "text", label: "Text", hint: "Body text color" },
];

function Dashboard() {
  const adminLogout = useAdminSessionStore((s) => s.logout);
  const [activeTab, setActiveTab] = useState<Tab>("branding");
  const [settings, setSettings] = useState<SiteSettings>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d))
      .finally(() => setLoaded(true));
  }, []);

  function setTheme(key: keyof NonNullable<SiteSettings["theme"]>, value: string) {
    setSettings((s) => ({ ...s, theme: { ...s.theme, [key]: value } }));
  }

  // Countdown promos save immediately on every add/edit/delete — unlike the
  // rest of the dashboard's fields, which wait for the explicit "Save
  // Changes" button below. That two-step flow was the exact bug a real
  // admin hit: clicking a promo's own "Save Countdown" only updated this
  // page's local state, so a promo that looked saved (it showed up in the
  // list right here) never actually reached the site until "Save Changes"
  // was ALSO clicked — until then /products/{id} and the discounted-links
  // list both correctly showed nothing, because nothing had actually been
  // persisted yet. Auto-saving here removes that easy-to-miss second step
  // entirely for this one workflow.
  async function saveNow(patch: Partial<SiteSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        setSettings(await res.json());
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  function setCountdownPromos(promos: CountdownPromo[]) {
    return saveNow({ countdownPromos: promos });
  }

  // A single boolean with no dependent text fields — safe to save the
  // instant it's toggled, unlike ExitOfferSection's draft/Save pattern
  // above (which exists specifically because ITS toggle has dependent
  // fields that can be unsaved when it's flipped).
  function toggleSuggestedProducts(enabled: boolean) {
    return saveNow({ suggestedProductsEnabled: enabled });
  }

  function toggleVisitorTracking(enabled: boolean) {
    return saveNow({ visitorTrackingEnabled: enabled });
  }

  // One explicit "Save Offer" click commits everything together (enabled
  // toggle included) — see ExitOfferSection's docblock for why this isn't
  // split into an instant-saving toggle + deferred text fields the way an
  // earlier version was.
  function saveExitOffer(offer: ExitOffer) {
    return saveNow({ exitOffer: offer });
  }

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setSettings((s) => ({ ...s, logoUrl: reader.result as string }));
      setLogoUploading(false);
    };
    reader.onerror = () => setLogoUploading(false);
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSettings(await res.json());
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    // Shared store — updates Header.tsx's own "Dashboard / Logout" state
    // too, instantly, not just this page (see adminSession.ts docblock).
    await adminLogout();
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-am-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-am-text-muted">
          <div className="w-8 h-8 border-2 border-am-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const activeLabel = TABS.find((t) => t.key === activeTab)?.label ?? "Admin Dashboard";

  return (
    <div className="min-h-screen bg-am-bg flex flex-col md:flex-row">
      {/* Sidebar — dark navy + gold, the same palette as the storefront's
          own top bar, so this reads as the same brand system rather than a
          generic admin template. Sticky on desktop so it stays in view
          while the content column scrolls; a plain horizontal scroller on
          mobile since there's no room for a fixed side column there. */}
      <aside className="md:w-64 shrink-0 bg-am-text text-white flex flex-col md:h-screen md:sticky md:top-0">
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-am-primary/15 border border-am-primary/30 flex items-center justify-center text-lg shrink-0">🛠️</div>
          <div className="min-w-0">
            <div className="font-bold text-[13.5px] leading-tight truncate">Admin Dashboard</div>
            <div className="text-[11px] text-white/45 truncate">AlMarwa Online</div>
          </div>
        </div>

        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible am-scrollbar-none px-3 py-4 md:flex-1">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold whitespace-nowrap text-left transition-colors shrink-0 ${
                  active ? "bg-am-primary text-white shadow-[0_8px_20px_rgba(196,154,60,0.35)]" : "text-white/55 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="text-[15px] leading-none">{tab.icon}</span> {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 hidden md:block">
          <div className="flex items-center gap-1.5 text-[11px] text-white/35 mb-3">🔒 Encrypted session cookie</div>
          {!confirmingLogout ? (
            <button
              onClick={() => setConfirmingLogout(true)}
              className="w-full text-start text-[12.5px] font-semibold text-white/60 hover:text-white transition-colors"
            >
              ⏻ Log Out
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={logout} className="flex-1 bg-am-error hover:bg-am-error/90 text-white text-[12px] font-bold py-2 rounded-lg transition-colors">
                Confirm
              </button>
              <button
                onClick={() => setConfirmingLogout(false)}
                className="flex-1 border border-white/20 text-white/70 hover:text-white text-[12px] font-semibold py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-am-border px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-am-text truncate">{activeLabel}</h1>
            <p className="text-[12px] text-am-text-muted mt-0.5">Changes here apply to the live site for every visitor.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-am-success bg-am-success/10 px-3 py-1.5 rounded-full">🔒 Secure Session</span>
            {/* Mobile-only — the sidebar's own logout control (with its
                matching confirm step) is hidden below the md breakpoint, so
                this is the only logout entry point on a small screen. Same
                shared confirmingLogout state either way. */}
            {!confirmingLogout ? (
              <button onClick={() => setConfirmingLogout(true)} className="md:hidden text-am-error text-[12.5px] font-semibold hover:underline">
                Log Out
              </button>
            ) : (
              <div className="md:hidden flex items-center gap-1.5">
                <button onClick={logout} className="bg-am-error hover:bg-am-error/90 text-white text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg transition-colors">
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmingLogout(false)}
                  className="border border-am-border text-am-text-muted text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 max-w-[920px] w-full mx-auto px-6 py-6 flex flex-col gap-5">
      {activeTab === "branding" && (
      <>
        {/* Theme colors */}
        <section className="bg-white border border-am-border rounded-2xl p-6">
          <h2 className="font-bold text-am-text mb-1">Theme Colors</h2>
          <p className="text-[12px] text-am-text-muted mb-4">Leave a field blank to keep the site&apos;s default for it.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {THEME_FIELDS.map(({ key, label, hint }) => (
              <div key={key}>
                <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">
                  {label} {hint && <span className="normal-case font-normal">— {hint}</span>}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(settings.theme?.[key] ?? "") ? settings.theme![key]! : "#c49a3c"}
                    onChange={(e) => setTheme(key, e.target.value)}
                    className="w-10 h-10 rounded-lg border border-am-border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={settings.theme?.[key] ?? ""}
                    onChange={(e) => setTheme(key, e.target.value)}
                    placeholder="#C49A3C"
                    className="flex-1 min-w-0 border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Logo & site name */}
        <section className="bg-white border border-am-border rounded-2xl p-6">
          <h2 className="font-bold text-am-text mb-1">Logo & Site Name</h2>
          <p className="text-[12px] text-am-text-muted mb-4">Overrides the logo, name, and tagline shown in the header, footer, and browser tab. Leave a field blank to use the store&apos;s default.</p>
          <div className="flex items-center gap-4 mb-5">
            {settings.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt="Logo preview" className="w-14 h-14 rounded-xl object-contain border border-am-border bg-am-bg" />
            )}
            <div className="flex-1 flex flex-col gap-2">
              <input
                type="text"
                value={settings.logoUrl ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, logoUrl: e.target.value }))}
                placeholder="https://… or upload a file below"
                className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
              />
              <div className="flex items-center gap-3">
                <input type="file" accept="image/*" onChange={onLogoFile} className="text-[12.5px]" />
                {logoUploading && <span className="text-[12px] text-am-text-muted">Reading file…</span>}
                {settings.logoUrl && (
                  <button onClick={() => setSettings((s) => ({ ...s, logoUrl: "" }))} className="text-[12px] text-am-error font-semibold hover:underline">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Site Name — English</label>
              <input
                type="text"
                value={settings.siteName?.en ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, siteName: { ...s.siteName, en: e.target.value } }))}
                placeholder="AlMarwa Online"
                className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
              />
            </div>
            <div dir="rtl">
              <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Site Name — العربية</label>
              <input
                type="text"
                value={settings.siteName?.ar ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, siteName: { ...s.siteName, ar: e.target.value } }))}
                placeholder="المروة أونلاين"
                className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Tagline — English</label>
              <input
                type="text"
                value={settings.tagline?.en ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, tagline: { ...s.tagline, en: e.target.value } }))}
                placeholder="Since 2003 · Qatar"
                className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
              />
            </div>
            <div dir="rtl">
              <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">Tagline — العربية</label>
              <input
                type="text"
                value={settings.tagline?.ar ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, tagline: { ...s.tagline, ar: e.target.value } }))}
                placeholder="منذ 2003 · قطر"
                className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
              />
            </div>
          </div>
        </section>

        {/* Footer */}
        <section className="bg-white border border-am-border rounded-2xl p-6">
          <h2 className="font-bold text-am-text mb-1">Footer</h2>
          <p className="text-[12px] text-am-text-muted mb-4">Background color of the site footer.</p>
          <div className="flex items-center gap-2 max-w-[280px]">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(settings.footerBgColor ?? "") ? settings.footerBgColor! : "#1a2942"}
              onChange={(e) => setSettings((s) => ({ ...s, footerBgColor: e.target.value }))}
              className="w-10 h-10 rounded-lg border border-am-border cursor-pointer shrink-0"
            />
            <input
              type="text"
              value={settings.footerBgColor ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, footerBgColor: e.target.value }))}
              placeholder="#1A2942"
              className="flex-1 min-w-0 border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
            />
          </div>
        </section>

        {/* Address */}
        <section className="bg-white border border-am-border rounded-2xl p-6">
          <h2 className="font-bold text-am-text mb-1">Address</h2>
          <p className="text-[12px] text-am-text-muted mb-4">Overrides the address shown in the header and footer.</p>
          <input
            type="text"
            value={settings.addressOverride ?? ""}
            onChange={(e) => setSettings((s) => ({ ...s, addressOverride: e.target.value }))}
            placeholder="Doha Qatar"
            className="w-full border border-am-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-am-primary"
          />
        </section>

        {/* Facebook Pixel */}
        <section className="bg-white border border-am-border rounded-2xl p-6">
          <h2 className="font-bold text-am-text mb-1">Facebook Pixel</h2>
          <p className="text-[12px] text-am-text-muted mb-4">
            Tracks page views, add-to-cart, and purchases for Facebook/Instagram ads. Leave blank to use the store&apos;s own pixel id (from its
            admin.almarwah.qa panel) if one is set there.
          </p>
          <div className="flex items-center gap-2 max-w-sm">
            <input
              type="text"
              inputMode="numeric"
              value={settings.facebookPixelId ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, facebookPixelId: e.target.value.replace(/[^0-9]/g, "") }))}
              placeholder="e.g. 1234567890123456"
              className="flex-1 min-w-0 border border-am-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-am-primary"
            />
            {settings.facebookPixelId && (
              <button
                onClick={() => setSettings((s) => ({ ...s, facebookPixelId: "" }))}
                className="text-[12px] text-am-error font-semibold hover:underline shrink-0"
              >
                Clear
              </button>
            )}
          </div>
          {settings.facebookPixelId && settings.facebookPixelId.length < 10 && (
            <p className="text-[11.5px] text-am-error mt-1.5">A real Pixel ID is normally 15–16 digits — double-check this one.</p>
          )}
          <p className="text-[11px] text-am-text-faint mt-2">
            Just the numeric ID from Meta Events Manager — not a full snippet. The rest of the tracking code is already wired up.
          </p>
        </section>
      </>
      )}

      {activeTab === "promotions" && (
        <>
          <section className="bg-white border border-am-border rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-am-text mb-1">✨ Before You Go — Cross-sell Suggestions</h2>
                <p className="text-[12px] text-am-text-muted">
                  The &ldquo;You Might Also Like&rdquo; popup shown on the cart page — on demand, and automatically when a
                  customer hovers &ldquo;Proceed to Checkout&rdquo;. Turning this off hides the link and disables the hover popup everywhere.
                </p>
              </div>
              <button
                onClick={() => toggleSuggestedProducts(settings.suggestedProductsEnabled === false)}
                role="switch"
                aria-checked={settings.suggestedProductsEnabled !== false}
                className={`shrink-0 w-12 h-7 rounded-full transition-colors relative ${settings.suggestedProductsEnabled !== false ? "bg-am-primary" : "bg-am-border"}`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.suggestedProductsEnabled !== false ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"}`} />
              </button>
            </div>
          </section>
          <CountdownPromosSection promos={settings.countdownPromos ?? []} onChange={setCountdownPromos} />
        </>
      )}

      {activeTab === "exitOffer" && (
        <ExitOfferSection offer={settings.exitOffer ?? emptyExitOffer()} onSave={saveExitOffer} />
      )}

      {activeTab === "content" && (
      <>
        {/* Page content — Policy */}
        <section className="bg-white border border-am-border rounded-2xl p-6">
          <h2 className="font-bold text-am-text mb-1">Page Content — Privacy Policy & Terms</h2>
          <p className="text-[12px] text-am-text-muted mb-4">
            Shown at /policy (linked from the footer). Basic HTML is supported (h2, h3, p, ul, ol, li, strong, em).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">English</label>
              <textarea
                rows={10}
                value={settings.policy?.en ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, policy: { ...s.policy, en: e.target.value } }))}
                className="w-full border border-am-border rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-am-primary resize-y"
              />
            </div>
            <div dir="rtl">
              <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">العربية</label>
              <textarea
                rows={10}
                value={settings.policy?.ar ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, policy: { ...s.policy, ar: e.target.value } }))}
                className="w-full border border-am-border rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-am-primary resize-y"
              />
            </div>
          </div>
        </section>
      </>
      )}

      {activeTab === "visitors" && (
        <>
          <section className="bg-white border border-am-border rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-am-text mb-1">📊 Visitor Tracking</h2>
                <p className="text-[12px] text-am-text-muted">
                  Logs every storefront pageview (IP, country, device, referrer) for the report below. Your own visits to this dashboard are never logged.
                </p>
              </div>
              <button
                onClick={() => toggleVisitorTracking(settings.visitorTrackingEnabled === false)}
                role="switch"
                aria-checked={settings.visitorTrackingEnabled !== false}
                className={`shrink-0 w-12 h-7 rounded-full transition-colors relative ${settings.visitorTrackingEnabled !== false ? "bg-am-primary" : "bg-am-border"}`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.visitorTrackingEnabled !== false ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"}`} />
              </button>
            </div>
          </section>
          <VisitorsSection />
        </>
      )}
        </div>

        <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur border-t border-am-border px-6 py-4 flex items-center gap-4">
          <button
            onClick={save}
            disabled={saving}
            className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold px-8 py-3 rounded-full transition-colors shadow-[0_10px_24px_rgba(196,154,60,0.35)]"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {savedAt && <span className="text-am-success text-sm font-semibold">✓ Saved.</span>}
        </div>
      </div>
    </div>
  );
}
