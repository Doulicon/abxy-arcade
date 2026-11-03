import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeId = 'night' | 'light';

const STORAGE_KEY = 'abxy_theme';
const LEGACY_STORAGE_KEY = 'enlu_theme';
export const DEFAULT_THEME: ThemeId = 'night';

/** 老版本的主题偏好搬到新 key */
try {
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy === 'night' || legacy === 'light') {
    if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, legacy);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
} catch {
  /* 隐私模式忽略 */
}

function detectTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved === 'night' || saved === 'light') return saved;
  } catch {
    /* 隐私模式忽略 */
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
}

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => undefined,
  toggleTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(detectTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeId = prev === 'night' ? 'light' : 'night';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
