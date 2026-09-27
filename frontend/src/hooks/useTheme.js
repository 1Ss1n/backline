import { useEffect, useState } from 'react'

export const THEME_KEY = 'backline-theme'
export function readTheme(storage) {
  try { return storage?.getItem(THEME_KEY) === 'light' ? 'light' : 'dark' }
  catch { return 'dark' }
}

export default function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return readTheme(window.localStorage) } catch { return 'dark' }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* Private browsing: theme still works. */ }
  }, [theme])
  useEffect(() => {
    const sync = (event) => {
      if (event.key === THEME_KEY) setTheme(event.newValue === 'light' ? 'light' : 'dark')
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  return [theme, setTheme]
}
