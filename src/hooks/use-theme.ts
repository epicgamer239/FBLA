"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "theme";

function getInitial(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(KEY);
  if (saved === "dark" || saved === "light") return saved;
  return "light";
}

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    apply(getInitial());
  }, []);

  return {
    theme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
