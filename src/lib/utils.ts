import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function relDays(iso: string, now = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(`${iso}T00:00:00`)
  if (Number.isNaN(t)) return null
  return Math.floor((now.getTime() - t) / 86_400_000)
}

export function pct(n: number | null, digits = 0): string {
  return n === null ? '—' : `${(n * 100).toFixed(digits)}%`
}
