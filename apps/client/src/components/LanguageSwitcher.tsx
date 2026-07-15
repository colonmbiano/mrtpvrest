"use client";
// Selector de idioma (ES/EN) para la interfaz de la tienda. Compacto para caber
// en el header de cualquier tema. Solo traduce botones/textos fijos.

import { LANGS } from "@/lib/i18n";
import { useLang } from "./StoreLocaleContext";

export function LanguageSwitcher({ accent = "var(--brand-primary)", compact = false }: { accent?: string; compact?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <div
      className="inline-flex items-center rounded-full p-0.5"
      style={{ background: "rgba(0,0,0,0.06)", backdropFilter: "blur(4px)" }}
      role="group"
      aria-label="Idioma"
    >
      {LANGS.map((l) => {
        const active = lang === l.code;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            aria-pressed={active}
            className="rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors"
            style={{ background: active ? accent : "transparent", color: active ? "#fff" : "inherit" }}
          >
            {compact ? l.label : `${l.flag} ${l.label}`}
          </button>
        );
      })}
    </div>
  );
}
