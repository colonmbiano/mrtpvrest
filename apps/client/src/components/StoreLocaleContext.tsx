"use client";
// Contexto de localización de la tienda: moneda/locale (para formatear precios).
// El idioma (i18n) se agregará aquí también. Default MXN/es-MX para que cualquier
// componente que use el hook fuera de un provider siga funcionando (compat).

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatMoney } from "@/lib/money";

type LocaleValue = { currency: string; locale: string };

const StoreLocaleContext = createContext<LocaleValue>({ currency: "MXN", locale: "es-MX" });

export function StoreLocaleProvider({
  currency = "MXN",
  locale = "es-MX",
  children,
}: {
  currency?: string | null;
  locale?: string | null;
  children: ReactNode;
}) {
  const value = useMemo<LocaleValue>(
    () => ({ currency: currency || "MXN", locale: locale || "es-MX" }),
    [currency, locale]
  );
  return <StoreLocaleContext.Provider value={value}>{children}</StoreLocaleContext.Provider>;
}

// Devuelve un formateador de dinero ligado a la moneda/locale de la tienda.
export function useMoney(): (n: number) => string {
  const { currency, locale } = useContext(StoreLocaleContext);
  return useMemo(() => (n: number) => formatMoney(n, currency, locale), [currency, locale]);
}
