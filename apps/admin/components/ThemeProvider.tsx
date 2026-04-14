"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accentColor: string;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
  accentColor: "#7c3aed",
});

interface Props {
  children: ReactNode;
  accentColor?: string;
}

export function ThemeProvider({ children, accentColor = "#7c3aed" }: Props) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("mb-theme") as Theme | null;
    if (saved) {
      setThemeState(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand-primary", accentColor);
  }, [accentColor]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("mb-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
