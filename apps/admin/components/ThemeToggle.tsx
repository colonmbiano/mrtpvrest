"use client";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Cambiar tema"
      style={{
        width: 34, height: 34, borderRadius: 8,
        background: "var(--surf2)", border: "1px solid var(--border2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "var(--muted)", transition: "all .15s",
        fontSize: 15,
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
