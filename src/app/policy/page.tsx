import { getSiteSettings } from "@/lib/settings/store.server";
import { sanitizeDescription } from "@/lib/sanitize";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/t";
import { getConfig } from "@/lib/api";

// Content is admin-editable (see /admin) rather than hardcoded — there is
// no live source of real policy text to pull from: the backend's own
// `/pages/privacy-policy` and `/pages/about-us` routes both return a
// genuine HTTP 500 in production (confirmed live, not a transient blip),
// so nothing here is fabricated legal copy standing in for the real thing.
export const metadata = { title: "Privacy Policy & Terms" };

export default async function PolicyPage() {
  const [settings, locale, config] = await Promise.all([getSiteSettings(), getServerLocale(), getConfig()]);
  const raw = locale === "ar" ? settings.policy?.ar : settings.policy?.en;
  const content = raw ? sanitizeDescription(raw) : null;
  const updated = settings.updatedAt ? new Date(settings.updatedAt).toLocaleDateString(locale === "ar" ? "ar" : undefined, { year: "numeric", month: "long", day: "numeric" }) : null;

  return (
    <div className="max-w-[820px] mx-auto px-5 py-14 am-fade-in">
      <div className="text-center mb-10">
        <div className="text-[11px] font-bold uppercase tracking-wider text-am-primary-dark mb-2">{config.ecommerce_name}</div>
        <h1 className="text-[28px] font-bold text-am-text tracking-tight">{t(locale, "policy.title")}</h1>
        {updated && <p className="text-[12.5px] text-am-text-muted mt-2">{t(locale, "policy.lastUpdated")}: {updated}</p>}
      </div>

      <div className="bg-white border border-am-border rounded-3xl shadow-[0_10px_34px_rgba(26,41,66,0.06)] p-8 sm:p-12">
        {content ? (
          <div className="text-[14.5px] leading-[1.9] text-am-text [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-am-text [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_li]:mb-1.5" dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          <div className="text-center py-10">
            <div className="text-4xl mb-4">📄</div>
            <p className="text-am-text-muted text-sm max-w-[420px] mx-auto leading-relaxed">
              {locale === "ar"
                ? "لم تتم إضافة محتوى سياسة الخصوصية والشروط بعد. يمكن للمسؤول إضافته من لوحة التحكم."
                : "Privacy Policy & Terms content hasn't been added yet. An admin can add it from the dashboard."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
