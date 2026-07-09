"use client";
// Contexto de localización de la tienda: moneda/locale (para formatear precios)
// e idioma de la interfaz (i18n solo de botones/textos fijos). El idioma vive en
// localStorage; arranca en "es" en el primer render (SSR determinista) y se
// hidrata desde localStorage en un efecto para no romper la hidratación.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/money";
import { translate, type Lang } from "@/lib/i18n";

type LocaleValue = {
  currency: string;
  locale: string;
  lang: Lang;
  setLang: (l: Lang) => void;
};

const StoreLocaleContext = createContext<LocaleValue>({
  currency: "MXN",
  locale: "es-MX",
  lang: "es",
  setLang: () => {},
});

const LANG_KEY = "mb_lang";

export function StoreLocaleProvider({
  currency = "MXN",
  locale = "es-MX",
  children,
}: {
  currency?: string | null;
  locale?: string | null;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "en" || saved === "es") setLangState(saved);
    } catch { /* almacenamiento privado: ignorar */ }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignorar */ }
  };

  const value = useMemo<LocaleValue>(
    () => ({ currency: currency || "MXN", locale: locale || "es-MX", lang, setLang }),
    [currency, locale, lang]
  );
  return <StoreLocaleContext.Provider value={value}>{children}</StoreLocaleContext.Provider>;
}

// Formateador de dinero ligado a la moneda/locale de la tienda.
export function useMoney(): (n: number) => string {
  const { currency, locale } = useContext(StoreLocaleContext);
  return useMemo(() => (n: number) => formatMoney(n, currency, locale), [currency, locale]);
}

// Traductor de la interfaz + control del idioma actual.
export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string } {
  const { lang, setLang } = useContext(StoreLocaleContext);
  const t = useMemo(() => (key: string) => translate(lang, key), [lang]);
  return { lang, setLang, t };
}
