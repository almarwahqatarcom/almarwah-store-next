import type { MetadataRoute } from "next";
import { getCategories } from "@/lib/api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://shop.almarwah.qa";

// Static marketing/browse pages plus every real category — deliberately
// NOT every individual product: that would mean one API call per category
// just to enumerate ids (the live backend has no lightweight "all product
// ids" endpoint), on every crawl request since this route is fully dynamic
// (no product data is cached at build time). Category pages already link
// to all their own products, so a crawler still reaches every product
// within one hop — this stays fast and reliable instead of one slow,
// many-call route that fails outright if the backend hiccups (as this
// project has genuinely seen happen).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/policy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/track-order`, changeFrequency: "monthly", priority: 0.3 },
  ];

  try {
    const categories = await getCategories();
    const categoryEntries: MetadataRoute.Sitemap = categories
      .filter((c) => c.status === 1)
      .map((c) => ({
        url: `${SITE_URL}/category/${c.id}`,
        changeFrequency: "daily" as const,
        priority: 0.8,
      }));
    return [...staticEntries, ...categoryEntries];
  } catch {
    // The live backend being unreachable shouldn't take the whole sitemap
    // down — a search engine still gets the static pages this crawl.
    return staticEntries;
  }
}
