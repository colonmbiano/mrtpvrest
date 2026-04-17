"use client";
import { useEffect } from "react";

export function AccentInjector() {
  useEffect(() => {
    const accent = localStorage.getItem("mb-accent");
    if (accent) {
      document.documentElement.style.setProperty("--brand-primary", accent);
    }
  }, []);
  return null;
}
