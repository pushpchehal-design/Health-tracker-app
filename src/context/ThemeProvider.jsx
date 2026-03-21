import { useLayoutEffect, useMemo, useState } from 'react'
import { ThemeContext } from './themeContext'
import { THEME_IDS, THEME_STORAGE_KEY, DEFAULT_THEME_ID } from '../lib/appTheme'

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const s = localStorage.getItem(THEME_STORAGE_KEY)
      if (s && THEME_IDS.includes(s)) return s
    } catch {
      /* ignore */
    }
    return DEFAULT_THEME_ID
  })

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const setTheme = (id) => {
    if (THEME_IDS.includes(id)) setThemeState(id)
  }

  const value = useMemo(() => ({ theme, setTheme, themes: THEME_IDS }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
