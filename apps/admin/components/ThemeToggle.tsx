"use client";
import { useTheme } from "@/lib/useTheme";

export default function ThemeToggle({ size = "md" }: { size?: "sm" | "md" }) {
  const { theme, toggle } = useTheme();
  const sm = size === "sm";
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className={`rounded-xl flex items-center justify-center transition-all ${sm ? "w-8 h-8 text-sm" : "w-10 h-10 text-lg"}`}
      style={{
        background: "var(--surf2)",
        border: "1px solid var(--border)",
        color: "var(--muted)",
      }}>
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
