"use client";

/**
 * /admin/apariencia — controles de personalización visual del TPV
 * accesibles desde el Panel Central. Los mismos pickers que viven en
 * ConfigMenu (rail del POS) pero centralizados acá para que el admin
 * los encuentre sin entrar al flujo de cobro.
 *
 * Persistencia:
 * - Tamaño de letra → `localStorage.uiScale` (small | medium | large).
 *   El root aplica `document.documentElement.style.fontSize` + atributo
 *   `data-ui-scale` (ver useUiScale en ModalRoot.tsx).
 * - Ancho del panel ticket → `localStorage.sidebarWidth` (S | M | L).
 *   SidebarTicket escucha el evento `sidebar-width-changed` y se
 *   reajusta sin reload.
 * - Paleta + modo (dark/light) → useThemeStore (persist middleware).
 *
 * Nota: hay bugs reportados en modo claro — algunos componentes del
 * POS usan colores hex hardcoded que no respetan los tokens CSS. El
 * toggle queda visible aquí, pero recomendamos usar dark hasta que se
 * migren los hardcoded a tokens (--bg, --surf-1, etc.).
 */

import React, { useEffect, useState } from "react";
import { Type, PanelRightClose, Palette as PaletteIcon, Sun, Moon, Info } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useThemeStore, type Palette as PaletteType } from "@/store/themeStore";

// ── Tipos locales ──────────────────────────────────────────────────────────

type UiScale = "small" | "medium" | "large";
type SidebarPreset = "S" | "M" | "L";

const UI_SCALE_META: Record<UiScale, { label: string; px: string }> = {
  small:  { label: "Chico",   px: "13px" },
  medium: { label: "Mediano", px: "16px" },
  large:  { label: "Grande",  px: "19px" },
};

const SIDEBAR_META: Record<SidebarPreset, { label: string; px: number }> = {
  S: { label: "Estrecho", px: 320 },
  M: { label: "Medio",    px: 380 },
  L: { label: "Amplio",   px: 440 },
};

const THEMES: Array<{ id: PaletteType; label: string; color: string }> = [
  { id: "amber",  label: "Miel",  color: "#ffb84d" },
  { id: "purple", label: "Cian",  color: "#3b82f6" },
  { id: "green",  label: "Lima",  color: "#10b981" },
];

// ── Helpers persist ────────────────────────────────────────────────────────

function readUiScale(): UiScale {
  if (typeof window === "undefined") return "small";
  const v = localStorage.getItem("uiScale");
  return v === "medium" || v === "large" ? v : "small";
}

function applyUiScale(scale: UiScale) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.uiScale = scale;
  document.documentElement.style.fontSize =
    scale === "small" ? "13px" : scale === "large" ? "19px" : "16px";
}

function readSidebarPreset(): SidebarPreset {
  if (typeof window === "undefined") return "M";
  const v = localStorage.getItem("sidebarWidth");
  return v === "S" || v === "L" ? v : "M";
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AparienciaPage() {
  const palette = useThemeStore((s) => s.palette);
  const setPalette = useThemeStore((s) => s.setPalette);
  const mode = useThemeStore((s) => s.mode);
  const toggleMode = useThemeStore((s) => s.toggleMode);

  const [uiScale, setUiScale] = useState<UiScale>("small");
  const [sidebarPreset, setSidebarPreset] = useState<SidebarPreset>("M");

  useEffect(() => {
    setUiScale(readUiScale());
    setSidebarPreset(readSidebarPreset());
  }, []);

  const chooseUiScale = (s: UiScale) => {
    setUiScale(s);
    if (typeof window !== "undefined") localStorage.setItem("uiScale", s);
    applyUiScale(s);
  };

  const chooseSidebar = (p: SidebarPreset) => {
    setSidebarPreset(p);
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebarWidth", p);
      window.dispatchEvent(new Event("sidebar-width-changed"));
    }
  };

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto font-sans bg-[#0a0a0c] min-h-full">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
        <div className="flex items-start gap-4">
          <BackButton ariaLabel="Volver al panel admin" />
          <div className="space-y-1.5">
            <span className="text-[10px] font-black tracking-[0.25em] text-amber-500/80 uppercase">
              Configuración
            </span>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none">
              Apariencia
            </h1>
            <p className="text-zinc-500 font-bold text-sm">
              Ajusta tipografía, ancho del panel ticket, paleta y modo nocturno.
            </p>
          </div>
        </div>
      </div>

      {/* AVISO MODO CLARO */}
      {mode === "light" && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 mb-8 flex gap-3 items-start">
          <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-amber-300 uppercase tracking-widest mb-1">
              Modo claro experimental
            </p>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              Algunos componentes del POS aún tienen colores fijos y se quedan oscuros en este modo.
              Recomendamos volver al nocturno hasta el siguiente parche.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TAMAÑO DE LETRA */}
        <section className="bg-[#121316] rounded-3xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Type size={16} style={{ color: "var(--brand)" }} />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
              Tamaño de letra
            </h2>
          </div>
          <p className="text-[11px] font-medium text-zinc-500 mb-4">
            Aplica al TPV completo. El default Loyverse-tight es Chico.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(UI_SCALE_META) as UiScale[]).map((s) => {
              const active = s === uiScale;
              const meta = UI_SCALE_META[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => chooseUiScale(s)}
                  className={`flex flex-col items-center justify-center gap-1 min-h-[72px] py-3 rounded-2xl border transition-all active:scale-95 ${
                    active
                      ? "bg-[#1a1b1f] text-white"
                      : "bg-[#0a0a0c] border-white/5 text-zinc-500"
                  }`}
                  style={active ? {
                    borderColor: "var(--brand)",
                    boxShadow: "0 0 15px var(--brand-glow)",
                    fontSize: s === "small" ? 13 : s === "large" ? 19 : 16,
                  } : {
                    fontSize: s === "small" ? 13 : s === "large" ? 19 : 16,
                  }}
                >
                  <span className="font-black">Aa</span>
                  <span className="text-[9px] font-black uppercase tracking-widest">{meta.label}</span>
                  <span className="text-[8px] font-bold text-zinc-600">{meta.px}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ANCHO PANEL TICKET */}
        <section className="bg-[#121316] rounded-3xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PanelRightClose size={16} style={{ color: "var(--brand)" }} />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
              Ancho del panel ticket
            </h2>
          </div>
          <p className="text-[11px] font-medium text-zinc-500 mb-4">
            Más estrecho = más espacio para el catálogo. Útil en tablets 7&quot;.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(SIDEBAR_META) as SidebarPreset[]).map((p) => {
              const active = p === sidebarPreset;
              const meta = SIDEBAR_META[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => chooseSidebar(p)}
                  // BUG-20: feedback visual claro al cambiar selección.
                  // Antes el contraste activo↔inactivo era casi imperceptible
                  // (#1a1b1f vs #0a0a0c) y el cajero pensaba que el toggle no
                  // respondía. Ahora el activo usa la marca como fondo.
                  className={`flex flex-col items-center justify-center gap-1 min-h-[72px] py-3 rounded-2xl border-2 transition-all active:scale-95 ${
                    active
                      ? "text-black font-black border-transparent"
                      : "bg-[#0a0a0c] border-white/10 text-zinc-400 hover:text-white hover:border-white/30"
                  }`}
                  style={active ? {
                    background: "var(--brand)",
                    boxShadow: "0 0 20px var(--brand-glow)",
                  } : undefined}
                >
                  <span className="text-[11px] font-black uppercase tracking-widest">{meta.label}</span>
                  <span className="text-[10px] font-bold text-zinc-600">{meta.px}px</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* PALETA DE ACENTO */}
        <section className="bg-[#121316] rounded-3xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PaletteIcon size={16} style={{ color: "var(--brand)" }} />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
              Paleta de acento
            </h2>
          </div>
          <p className="text-[11px] font-medium text-zinc-500 mb-4">
            Tema del color principal. El ámbar Warm Tech es el default.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map((t) => {
              const active = palette === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPalette(t.id)}
                  className={`flex flex-col items-center justify-center gap-3 min-h-[80px] py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                    active
                      ? "bg-[#1a1b1f] text-white"
                      : "bg-[#0a0a0c] border-white/5 text-zinc-600"
                  }`}
                  style={active ? {
                    borderColor: t.color,
                    boxShadow: `0 0 15px ${t.color}33`,
                  } : undefined}
                >
                  <div className="w-6 h-6 rounded-full shadow-lg" style={{ backgroundColor: t.color }} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* MODO NOCTURNO / CLARO */}
        <section className="bg-[#121316] rounded-3xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            {mode === "dark" ? (
              <Moon size={16} className="text-amber-500" />
            ) : (
              <Sun size={16} className="text-amber-500" />
            )}
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
              Modo {mode === "dark" ? "nocturno" : "claro"}
            </h2>
          </div>
          <p className="text-[11px] font-medium text-zinc-500 mb-4">
            Cambia entre fondo oscuro y fondo claro. Modo claro tiene bugs conocidos por ahora.
          </p>
          <button
            type="button"
            onClick={toggleMode}
            className="w-full inline-flex items-center justify-between gap-3 px-5 h-14 rounded-2xl bg-[#0a0a0c] border border-white/5 active:scale-95 transition-all"
          >
            <span className="text-sm font-black uppercase tracking-widest text-white">
              {mode === "dark" ? "Cambiar a claro" : "Cambiar a nocturno"}
            </span>
            <div
              className="w-14 h-7 rounded-full relative transition-all duration-300"
              style={{ background: mode === "dark" ? "#1a1b1f" : "#ffb84d" }}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${
                  mode === "dark" ? "left-1 bg-zinc-600" : "left-8 bg-[#0a0a0c]"
                }`}
              />
            </div>
          </button>
        </section>
      </div>
    </div>
  );
}
