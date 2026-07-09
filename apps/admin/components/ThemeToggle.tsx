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
        background: "var(--sb-surf)", border: "1px solid var(--sb-bd)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "var(--sb-mut)", transition: "all .15s",
        fontSize: 15,
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
