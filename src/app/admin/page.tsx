"use client";

import { useEffect, useState } from "react";
import type { SiteSettings, CountdownPromo, ExitOffer } from "@/lib/settings/store.server";
import CountdownPromosSection from "@/components/admin/CountdownPromosSection";
import ExitOfferSection, { emptyExitOffer } from "@/components/admin/ExitOfferSection";
import VisitorsSection from "@/components/admin/VisitorsSection";

type AuthState = "checking" | "loggedOut" | "loggedIn";

// Everything here talks to src/app/api/admin/* — see those route files for
// the actual auth/persistence mechanics (httpOnly session cookie, JSON file
// on disk). This page itself holds no secrets: the password is checked
// server-side only, and this component never sees it again after the login
// request resolves.
export default function AdminPage() {
  const [auth, setAuth] = useState<AuthState>("checking");

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => setAuth(d.authenticated ? "loggedIn" : "loggedOut"))
      .catch(() => setAuth("loggedOut"));
  }, []);

  return (
    <div className="min-h-[70vh] bg-am-bg flex items-center justify-center px-5 py-14">
      {auth === "checking" ? (
        <p className="text-am-text-muted text-sm">Loading…</p>
      ) : auth === "loggedOut" ? (
        <LoginForm onSuccess={() => setAuth("loggedIn")} />
      ) : (
        <Dashboard onLogout={() => setAuth("loggedOut")} />
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
    <div className="w-full max-w-[400px] bg-white border border-am-border rounded-3xl shadow-[0_20px_50px_rgba(26,41,66,0.1)] p-9">
      <div className="text-center mb-7">
        <div className="text-3xl mb-3">🔐</div>
        <h1 className="text-lg font-bold text-am-text">Admin Dashboard</h1>
        <p className="text-[12.5px] text-am-text-muted mt-1">Sign in to manage site settings</p>
      </div>

      {error && <div className="bg-am-error/10 text-am-error text-[13px] rounded-lg px-4 py-2.5 mb-4">{error}</div>}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
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
            className="w-full border border-am-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-am-primary"
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-full transition-colors mt-2"
        >
          {loading ? "Logging in…" : "Log In"}
        </button>
      </form>
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

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("branding");
  const [settings, setSettings] = useState<SiteSettings>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

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
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  if (!loaded) {
    return <p className="text-am-text-muted text-sm">Loading…</p>;
  }

  return (
    <div className="w-full max-w-[980px]">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-xl font-bold text-am-text">Admin Dashboard</h1>
          <p className="text-[12.5px] text-am-text-muted mt-0.5">Changes here apply to the live site for every visitor.</p>
        </div>
        <button onClick={logout} className="text-am-error text-[13px] font-semibold hover:underline shrink-0">
          Log Out
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <nav className="flex md:flex-col gap-1.5 md:w-56 shrink-0 overflow-x-auto am-scrollbar-none pb-1 md:pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13.5px] font-semibold whitespace-nowrap text-left transition-colors shrink-0 ${
                activeTab === tab.key ? "bg-am-primary text-white shadow-[0_8px_20px_rgba(196,154,60,0.3)]" : "text-am-text-muted hover:bg-am-bg"
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span> {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 flex flex-col gap-5">
      {activeTab === "branding" && (
      <>
        {/* Theme colors */}
        <section className="bg-white border border-am-border rounded-2xl p-6">
          <h2 className="font-bold text-am-text mb-1">Theme Colors</h2>
          <p className="text-[12px] text-am-text-muted mb-4">Leave a field blank to keep the site's default for it.</p>
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
          <p className="text-[12px] text-am-text-muted mb-4">Overrides the logo, name, and tagline shown in the header, footer, and browser tab. Leave a field blank to use the store's default.</p>
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
            Tracks page views, add-to-cart, and purchases for Facebook/Instagram ads. Leave blank to use the store's own pixel id (from its
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
      </div>

      <div className="flex items-center gap-4 sticky bottom-4 mt-5">
        <button
          onClick={save}
          disabled={saving}
          className="bg-am-primary hover:bg-am-primary-dark disabled:opacity-50 text-white font-bold px-8 py-3.5 rounded-full transition-colors shadow-[0_10px_24px_rgba(196,154,60,0.35)]"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {savedAt && <span className="text-am-success text-sm font-semibold">✓ Saved.</span>}
      </div>
    </div>
  );
}
