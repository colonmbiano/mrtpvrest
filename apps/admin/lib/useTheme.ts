"use client";
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

export function useTheme() {
  // Default "light": debe coincidir con el script anti-flash de app/layout.tsx.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("mb-theme") as Theme || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("mb-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  function set(t: Theme) {
    setTheme(t);
    localStorage.setItem("mb-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }

  return { theme, toggle, set, isDark: theme === "dark" };
}
