"use client";
import { useEffect } from "react";

const VALID: ReadonlyArray<string> = ["oled", "pop", "boutique"];

export function KioskStyleInjector() {
  useEffect(() => {
    const style = localStorage.getItem("kiosk-style") || "oled";
    const resolved = VALID.includes(style) ? style : "oled";
    document.documentElement.setAttribute("data-kiosk-style", resolved);
  }, []);
  return null;
}
