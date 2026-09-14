/**
 * Minimal HTML sanitizer for product descriptions coming from the API.
 *
 * Why this exists: while wiring up the product API we found at least one
 * live product (id 2201) whose description field contains a raw pasted
 * ChatGPT conversation UI dump (script-adjacent divs, data-* attributes,
 * inline styles) instead of clean copy — a content data-quality bug worth
 * fixing at the source, but this storefront can't assume the catalog is
 * always clean. This strips anything actively dangerous (script/style tags,
 * event handler attributes, javascript: URLs, iframes) and keeps basic
 * formatting tags, rather than trusting `description` outright.
 */
const ALLOWED_TAGS = new Set(["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "span", "div", "h1", "h2", "h3", "h4"]);

export function sanitizeDescription(html: string): string {
  if (!html) return "";

  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<(object|embed|form|input|button)[\s\S]*?>/gi, "");

  // Strip every tag not in the allow-list, and strip all attributes except
  // nothing (no href/src/style/data-* survive — descriptions don't need them).
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tagName: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const isClosing = match.startsWith("</");
    return isClosing ? `</${tag}>` : `<${tag}>`;
  });

  return out.trim();
}
