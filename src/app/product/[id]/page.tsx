import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getProductDetails, getCategories, getCategoryProducts, getConfig, finalPrice, averageRating, formatCurrency, imageUrl } from "@/lib/api";
import { sanitizeDescription } from "@/lib/sanitize";
import ProductRow from "@/components/ProductRow";
import AddToCartPanel from "@/components/AddToCartPanel";
import ViewContentTracker from "@/components/ViewContentTracker";
import ProductGallery from "@/components/ProductGallery";
import StarRating from "@/components/StarRating";
import CountdownPromoBanner from "@/components/CountdownPromoBanner";
import FooterUpsellBar from "@/components/FooterUpsellBar";
import { getServerLocale } from "@/lib/i18n/server";
import { t, hasArabicText } from "@/lib/i18n/t";
import { maskCustomerName } from "@/lib/maskName";
import type { Product } from "@/lib/types";

// A real, live data-quality issue in the catalog (confirmed against
// admin.almarwah.qa): most products DO have a genuine `ar` translation row
// for `name`, but its paired `description` translation row exists with a
// literally empty value (`<p><br></p>`) — not missing, just blank. The
// backend (Helpers::product_data_formatting()) overwrites the perfectly
// good English description with that blank value whenever `X-localization:
// ar` is sent, with no emptiness check of its own. Falling back to the
// English field (rather than rendering nothing) needs the English response
// fetched separately, since by the time this runs, the Arabic call has
// already discarded whatever real English text existed.
async function withEnglishFallback(
  productId: number,
  arProduct: Product,
  locale: "en" | "ar"
): Promise<{ name: string; description: string; missingName: boolean; missingDescription: boolean }> {
  if (locale !== "ar") {
    return { name: arProduct.name, description: arProduct.description, missingName: false, missingDescription: false };
  }
  const missingName = !hasArabicText(arProduct.name);
  const missingDescription = !hasArabicText(arProduct.description.replace(/<[^>]+>/g, "").trim());
  if (!missingName && !missingDescription) {
    return { name: arProduct.name, description: arProduct.description, missingName: false, missingDescription: false };
  }
  const enProduct = await getProductDetails(productId, "en").catch(() => null);
  return {
    name: missingName ? (enProduct?.name ?? arProduct.name) : arProduct.name,
    description: missingDescription ? (enProduct?.description ?? arProduct.description) : arProduct.description,
    missingName,
    missingDescription,
  };
}

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const locale = await getServerLocale();
  const [product, config] = await Promise.all([getProductDetails(Number(id), locale).catch(() => null), getConfig().catch(() => null)]);
  if (!product?.id) return { title: "Product Not Available" };
  const { name, description } = await withEnglishFallback(Number(id), product, locale);
  const plain = description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 155);
  // A real product photo in the preview when a link is shared (WhatsApp,
  // Facebook, etc.) matters a lot for a retail catalog — this was entirely
  // missing before, so every shared product link showed no image at all.
  const image = imageUrl(config?.base_urls, "product_image_url", product.image?.[0]);
  return {
    title: name,
    description: plain,
    openGraph: { title: name, description: plain, images: image ? [image] : undefined, type: "website" },
    twitter: { card: image ? "summary_large_image" : "summary", title: name, description: plain, images: image ? [image] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  const locale = await getServerLocale();
  const [product, categories, config] = await Promise.all([
    getProductDetails(productId, locale).catch(() => null),
    getCategories(locale).catch(() => []),
    getConfig(),
  ]);

  // A missing product here is almost always one that existed and was later
  // disabled/removed in the admin panel (confirmed live: the backend's own
  // details endpoint returns "Product not found!" for a disabled product,
  // not just a genuinely bad ID) — "not available anymore" is a more honest
  // and specific message for a customer than the generic site-wide 404 page.
  if (!product?.id) {
    return (
      <div className="max-w-[600px] mx-auto px-5 py-20 text-center am-fade-in">
        <div className="text-5xl mb-4">📦</div>
        <h1 className="text-xl font-bold text-am-text mb-2">{t(locale, "product.notAvailableTitle")}</h1>
        <p className="text-am-text-muted mb-6">{t(locale, "product.notAvailableBody")}</p>
        <Link href="/" className="inline-block bg-am-primary hover:bg-am-primary-dark text-white font-bold px-7 py-3 rounded-full transition-colors">
          {t(locale, "common.continueShopping")}
        </Link>
      </div>
    );
  }

  const price = finalPrice(product);
  const hasDiscount = product.discount > 0;
  const discountPct = hasDiscount ? Math.round(product.discount_type === "amount" ? (product.discount / product.price) * 100 : product.discount) : 0;
  const rating = averageRating(product.rating);
  const reviewCount = product.active_reviews_count ?? 0;
  const images = (product.image ?? []).map((f) => imageUrl(config.base_urls, "product_image_url", f)).filter(Boolean);
  const primaryCategoryId = product.category_ids?.[0] ? Number(product.category_ids[0].id) : null;
  const primaryCategory = primaryCategoryId ? categories.find((c) => c.id === primaryCategoryId) : null;
  const inStock = product.total_stock > 0;
  const lowStock = inStock && product.total_stock <= 10;

  const related = primaryCategoryId
    ? await getCategoryProducts(primaryCategoryId, 12, 1, undefined, locale)
        .then((r) => r.products.filter((p) => p.id !== productId))
        .catch(() => [])
    : [];

  const {
    name: displayName,
    description: rawDescription,
    missingName: missingArabicName,
    missingDescription: missingArabicDescription,
  } = await withEnglishFallback(productId, product, locale);
  const description = sanitizeDescription(rawDescription);
  const reviews = (product.active_reviews ?? []).slice(0, 4);

  return (
    <div className="am-fade-in">
      <ViewContentTracker id={product.id} name={displayName} value={price} />
      <div className="max-w-[1280px] mx-auto px-5">
        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-am-text-faint py-5">
          <Link href="/" className="hover:text-am-primary-dark transition-colors">{t(locale, "common.home")}</Link>
          {primaryCategory && (
            <>
              <span className="mx-1.5 text-am-border">/</span>
              <Link href={`/category/${primaryCategory.id}`} className="hover:text-am-primary-dark transition-colors">{primaryCategory.name}</Link>
            </>
          )}
          <span className="mx-1.5 text-am-border">/</span>
          <span className="text-am-text normal-case">{displayName}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pb-14">
          <ProductGallery
            images={images}
            alt={displayName}
            badge={
              hasDiscount ? (
                <span className="bg-am-error text-white text-[11.5px] font-bold px-3 py-1 rounded-full tracking-wide shadow-sm">
                  {discountPct}% OFF
                </span>
              ) : undefined
            }
          />

          <div className="flex flex-col">
            {primaryCategory && (
              <Link
                href={`/category/${primaryCategory.id}`}
                className="inline-block w-fit text-[11px] font-bold uppercase tracking-wider text-am-primary-dark bg-am-primary-light px-3 py-1 rounded-full mb-3.5 hover:bg-am-primary hover:text-white transition-colors"
              >
                {primaryCategory.name}
              </Link>
            )}

            <h1 className="text-[26px] leading-tight font-bold text-am-text mb-3 tracking-tight">
              {displayName}
              {missingArabicName && (
                <span className="text-am-error text-lg ms-1.5 align-top" title={t(locale, "product.noArabicName")} aria-label={t(locale, "product.noArabicName")}>★</span>
              )}
            </h1>

            {rating > 0 && (
              <div className="flex items-center gap-1.5 text-[13px] text-am-text-muted mb-5">
                <StarRating rating={rating} />
                <span className="font-semibold text-am-text">{rating.toFixed(1)}</span>
                <span>({reviewCount} {reviewCount === 1 ? t(locale, "product.review") : t(locale, "product.reviews")})</span>
              </div>
            )}

            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-[34px] font-bold text-am-primary-dark tracking-tight">{formatCurrency(price, config)}</span>
              {hasDiscount && (
                <>
                  <span className="text-lg text-am-text-faint line-through">{formatCurrency(product.price, config)}</span>
                  <span className="text-[12.5px] font-bold text-am-error">{t(locale, "product.save")} {discountPct}%</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 mb-6">
              <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1 rounded-full ${inStock ? "bg-am-success/10 text-am-success" : "bg-am-error/10 text-am-error"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${inStock ? "bg-am-success" : "bg-am-error"}`} />
                {inStock ? t(locale, "common.inStock") : t(locale, "common.outOfStock")}
              </span>
              {lowStock && <span className="text-[12.5px] font-semibold text-am-error">{t(locale, "product.only")} {product.total_stock} {t(locale, "product.left")}</span>}
            </div>

            <CountdownPromoBanner productId={product.id} categoryIds={(product.category_ids ?? []).map((c) => Number(c.id))} />

            <div className="pt-1 pb-1">
              <AddToCartPanel product={product} />
            </div>

            {/* Real payment options only — matching what's actually configured
                for this store, not a generic "secure checkout" filler badge. */}
            <div className="flex items-center gap-4 mt-6 pt-6 border-t border-am-border flex-wrap">
              {!!config.cash_on_delivery && (
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-am-text-muted">{t(locale, "product.cashOnDelivery")}</span>
              )}
              {config.active_payment_method_list?.map((gateway) => {
                const logo = imageUrl(config.base_urls, "gateway_image_url", gateway.gateway_image);
                return logo ? (
                  <Image key={gateway.gateway} src={logo} alt={gateway.gateway_title} width={64} height={20} className="h-5 w-auto opacity-80" />
                ) : (
                  <span key={gateway.gateway} className="text-[12.5px] font-medium text-am-text-muted">{gateway.gateway_title}</span>
                );
              })}
            </div>

            {description && (
              <div className="mt-7 pt-7 border-t border-am-border text-sm leading-[1.8] text-am-text">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-am-text-faint mb-2.5 flex items-center gap-1.5">
                  {t(locale, "product.aboutThisProduct")}
                  {missingArabicDescription && (
                    <span className="text-am-error normal-case tracking-normal" title={t(locale, "product.noArabicDescription")} aria-label={t(locale, "product.noArabicDescription")}>★</span>
                  )}
                </h3>
                <div dangerouslySetInnerHTML={{ __html: description }} />
              </div>
            )}
          </div>
        </div>

        {reviews.length > 0 && (
          <div className="pb-14 max-w-[760px]">
            <h2 className="text-lg font-bold text-am-text mb-4">{t(locale, "product.customerReviews")}</h2>
            <div className="flex flex-col gap-3">
              {reviews.map((r) => {
                // Masked for public display ("Rabii Souai" -> "Ra*** So***")
                // rather than shown in full — a reviewer's real name has no
                // reason to be broadcast to every visitor of this page.
                const displayName = r.customer_name ? maskCustomerName(r.customer_name) : t(locale, "product.verifiedCustomer");
                const reviewDate = new Date(r.created_at).toLocaleDateString(locale === "ar" ? "ar" : undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                });
                return (
                  <div key={r.id} className="bg-white border border-am-border rounded-2xl p-5 shadow-[0_2px_10px_rgba(26,41,66,0.04)]">
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-am-primary-light text-am-primary-dark font-bold text-[13px] flex items-center justify-center shrink-0">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-bold text-am-text truncate">{displayName}</div>
                          <div className="text-[11.5px] text-am-text-faint">{reviewDate}</div>
                        </div>
                      </div>
                      <StarRating rating={r.rating} size={12} />
                    </div>
                    <p className="text-[13.5px] text-am-text-muted leading-relaxed">{r.comment}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {related.length > 0 && (
        <div className="bg-am-bg-alt/40">
          <ProductRow title={`${t(locale, "product.moreFrom")} ${primaryCategory?.name ?? t(locale, "product.thisCategory")}`} products={related} />
        </div>
      )}

      <FooterUpsellBar products={related} />
    </div>
  );
}
