"use client";

import { createContext, useContext } from "react";
import type { Category, StoreConfig } from "@/lib/types";

interface ConfigContextValue {
  config: StoreConfig;
  categories: Category[];
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({
  config,
  categories,
  children,
}: {
  config: StoreConfig;
  categories: Category[];
  children: React.ReactNode;
}) {
  return <ConfigContext.Provider value={{ config, categories }}>{children}</ConfigContext.Provider>;
}

export function useStoreConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useStoreConfig must be used within ConfigProvider");
  return ctx;
}
