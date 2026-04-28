import { Sun, Moon, Check, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { Palette, Mode } from "@/store/usePOSStore";
import { PALETTES } from "../_lib/types";
import { Heading, SectionLabel, PrimaryButton } from "./primitives";

type Props = {
  palette: Palette;
  mode: Mode;
  onPaletteChange: (p: Palette) => void;
  onModeChange: (m: Mode) => void;
  onContinue: () => void;
};

export default function AppearanceStep({
  palette,
  mode,
  onPaletteChange,
  onModeChange,
  onContinue,
}: Props) {
  return (
    <>
      <Heading icon={<Sparkles />}>Personaliza tu TPV</Heading>
      <p className="mt-1 mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        Elige el color de marca y el modo de pantalla. Podrás cambiarlo después desde el rail lateral.
      </p>

      <SectionLabel>Color de marca</SectionLabel>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {PALETTES.map((p) => {
          const active = palette === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPaletteChange(p.id)}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-95"
              style={{
                background: active ? "var(--brand-soft)" : "var(--surface-2)",
                border: active ? "2px solid var(--brand)" : "2px solid var(--border)",
                cursor: "pointer",
              }}
            >
              <div
                className="w-14 h-14 rounded-full"
                style={{
                  background: p.color,
                  boxShadow: active ? `0 8px 24px -4px ${p.color}99` : "none",
                }}
              />
              <span
                className="text-xs font-bold"
                style={{ color: active ? "var(--brand)" : "var(--text-primary)" }}
              >
                {p.label}
              </span>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                {p.sub}
              </span>
              {active && (
                <span
                  className="absolute mt-1"
                  style={{ color: "var(--brand)" }}
                  aria-hidden="true"
                >
                  <Check size={14} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <SectionLabel>Modo de pantalla</SectionLabel>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <ModeCard
          active={mode === "dark"}
          onClick={() => onModeChange("dark")}
          icon={<Moon size={20} />}
          label="Oscuro"
          sub="Recomendado · OLED"
          previewBg="#0a0a0a"
          previewSurface="#1f1f1f"
          previewText="#ffffff"
        />
        <ModeCard
          active={mode === "light"}
          onClick={() => onModeChange("light")}
          icon={<Sun size={20} />}
          label="Claro"
          sub="Mostrador · Día"
          previewBg="#f8fafc"
          previewSurface="#ffffff"
          previewText="#0f172a"
        />
      </div>

      <SectionLabel>Vista previa</SectionLabel>
      <PreviewBlock />

      <PrimaryButton onClick={onContinue}>Continuar al TPV</PrimaryButton>
    </>
  );
}

type ModeCardProps = {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  sub: string;
  previewBg: string;
  previewSurface: string;
  previewText: string;
};

function ModeCard({ active, onClick, icon, label, sub, previewBg, previewSurface, previewText }: ModeCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-3 p-3 rounded-2xl transition-all hover:scale-[1.02] active:scale-95"
      style={{
        background: active ? "var(--brand-soft)" : "var(--surface-2)",
        border: active ? "2px solid var(--brand)" : "2px solid var(--border)",
        cursor: "pointer",
      }}
    >
      <div className="flex items-center gap-2" style={{ color: active ? "var(--brand)" : "var(--text-primary)" }}>
        {icon}
        <span className="text-sm font-bold">{label}</span>
      </div>
      <div
        className="rounded-lg overflow-hidden flex items-center gap-1.5 p-2"
        style={{ background: previewBg, border: `1px solid ${previewSurface}` }}
      >
        <div className="w-2 h-8 rounded-full" style={{ background: "var(--brand)" }} />
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="h-1.5 w-3/4 rounded-full" style={{ background: previewText, opacity: 0.8 }} />
          <div className="h-1.5 w-1/2 rounded-full" style={{ background: previewText, opacity: 0.4 }} />
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {sub}
      </span>
    </button>
  );
}

function PreviewBlock() {
  return (
    <div
      className="rounded-2xl p-4 mb-6 flex flex-col gap-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Total Final
        </span>
        <span
          className="text-2xl font-extrabold"
          style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
        >
          $145.00
        </span>
      </div>
      <button
        className="w-full h-11 rounded-xl text-xs font-bold uppercase tracking-wider"
        style={{
          background: "var(--brand)",
          color: "var(--brand-fg)",
          letterSpacing: "0.08em",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        Procesar Cobro
      </button>
    </div>
  );
}
