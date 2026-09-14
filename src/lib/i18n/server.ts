import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "./t";
import type { Locale } from "./translations";

// Server components (product/category/home pages fetch data server-side)
// read the customer's language choice from a cookie set by the client-side
// switcher (see LanguageSwitcher.tsx) — there's no user-account language
// field, so a cookie is the one thing both server and client agree on.
export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return value === "ar" ? "ar" : "en";
}
