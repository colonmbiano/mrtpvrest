"use client";
import { useLang, useA11y } from "@/lib/i18n";

// Barra flotante en esquina inferior-izquierda con toggle de idioma
// (🇲🇽 / 🇺🇸) y toggles de accesibilidad (texto grande, alto contraste).
// Pensada para que el cliente que necesita ayuda visual la encuentre fácil
// sin estorbar al cliente regular.
export function AccessibilityBar() {
  const { lang, setLang, t } = useLang();
  const { a11y, toggle } = useA11y();

  const btnBase: React.CSSProperties = {
    all: "unset",
    cursor: "pointer",
    padding: "8px 12px",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    display: "flex", alignItems: "center", gap: 6,
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 16, bottom: 16,
        zIndex: 100,
        display: "flex", gap: 6,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        padding: 6,
        borderRadius: 999,
      }}
    >
      <button
        onClick={() => setLang(lang === "es" ? "en" : "es")}
        style={{ ...btnBase, color: "#fff" }}
        title={lang === "es" ? "Switch to English" : "Cambiar a español"}
      >
        {lang === "es" ? "🇲🇽 ES" : "🇺🇸 EN"}
      </button>
      <button
        onClick={() => toggle("larger")}
        style={{ ...btnBase, color: a11y.larger ? "var(--brand-primary)" : "#fff", background: a11y.larger ? "color-mix(in srgb, var(--brand-primary) 18%, transparent)" : "transparent" }}
        title={t("a11y.larger")}
      >
        🔍 A+
      </button>
      <button
        onClick={() => toggle("contrast")}
        style={{ ...btnBase, color: a11y.contrast ? "var(--brand-primary)" : "#fff", background: a11y.contrast ? "color-mix(in srgb, var(--brand-primary) 18%, transparent)" : "transparent" }}
        title={t("a11y.contrast")}
      >
        ◑
      </button>
    </div>
  );
}
