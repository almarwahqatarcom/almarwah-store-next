import type { MetadataRoute } from "next";

// A real storefront needs a robots.txt for search engines to find at all —
// this was simply missing before (the default create-next-app scaffold
// never adds one). Configurable via NEXT_PUBLIC_SITE_URL since the actual
// production domain isn't fixed in this codebase; falls back to the
// storefront's own known live domain (see README) if unset.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://shop.almarwah.qa";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Account/cart/checkout/auth pages are per-visitor and have nothing
      // for a search engine to index; the admin dashboard is explicitly
      // no-index anyway (see admin/layout.tsx) but excluding it here too
      // means crawlers never even request it.
      disallow: ["/admin", "/api/", "/account", "/cart", "/checkout", "/login", "/register", "/order-invoice", "/order-confirmation"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
