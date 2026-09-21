'use client'

import { useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'career-ops-theme'

function isTheme(value: string | null): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY)
    const nextTheme = isTheme(savedTheme) ? savedTheme : 'system'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
  }, [])

  function updateTheme(nextTheme: Theme) {
    setTheme(nextTheme)
    localStorage.setItem(STORAGE_KEY, nextTheme)
    document.documentElement.dataset.theme = nextTheme
  }

  return (
    <label className="ml-auto flex items-center gap-2 text-xs text-[var(--color-muted)]">
      <span className="sr-only">Theme</span>
      <select
        value={theme}
        onChange={(event) => updateTheme(event.target.value as Theme)}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)] outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent)]"
        aria-label="Theme"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  )
}
