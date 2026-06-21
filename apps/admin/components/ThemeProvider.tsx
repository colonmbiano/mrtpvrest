"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accentColor: string;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
  accentColor: "#22c55e",
});

interface Props {
  children: ReactNode;
  accentColor?: string;
}

export function ThemeProvider({ children, accentColor = "#22c55e" }: Props) {
  const [theme, setThemeState] = useState<Theme>("light");

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
