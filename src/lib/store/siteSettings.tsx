"use client";

import { createContext, useContext } from "react";
import type { SiteSettings } from "@/lib/settings/store.server";

const SiteSettingsContext = createContext<SiteSettings>({});

// Admin-configured overrides (logo, footer color, address, policy content)
// fetched once server-side in the root layout and handed down here —
// components read from this instead of hardcoding a value or always
// trusting the live backend's own config, so an admin change actually
// takes effect for every visitor.
export function SiteSettingsProvider({ settings, children }: { settings: SiteSettings; children: React.ReactNode }) {
  return <SiteSettingsContext.Provider value={settings}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): SiteSettings {
  return useContext(SiteSettingsContext);
}
