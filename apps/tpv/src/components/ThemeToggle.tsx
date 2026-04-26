"use client";
import { Moon, Sun } from "lucide-react";
import { usePOSStore } from "@/store/usePOSStore";

export default function ThemeToggle({ size = "md" }: { size?: "sm" | "md" }) {
  const mode = usePOSStore((s) => s.mode);
  const toggleMode = usePOSStore((s) => s.toggleMode);
  const sm = size === "sm";
  const isDark = mode === "dark";

  return (
    <button
      onClick={toggleMode}
      title={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      aria-label="Toggle theme mode"
      className={`rounded-xl flex items-center justify-center transition-all ${sm ? "w-8 h-8" : "w-10 h-10"}`}
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      {isDark ? <Sun size={sm ? 14 : 18} /> : <Moon size={sm ? 14 : 18} />}
    </button>
  );
}
