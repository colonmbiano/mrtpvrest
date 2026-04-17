"use client";
import { createContext, useContext, ReactNode } from "react";

interface ThemeContextType { accentColor: string; }

const ThemeContext = createContext<ThemeContextType>({ accentColor: "#7c3aed" });

export function ThemeProvider({ children, accentColor = "#7c3aed" }: { children: ReactNode; accentColor?: string }) {
  return <ThemeContext.Provider value={{ accentColor }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
