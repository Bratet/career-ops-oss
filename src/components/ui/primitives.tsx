import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-border)] px-5 py-3.5">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-[var(--color-faint)]">{hint}</p> : null}
      </div>
      {action}
    </div>
  )
}

const TONES = {
  neutral: 'bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-border)]',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-transparent',
  ok: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)] border-transparent',
  warn: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)] border-transparent',
  bad: 'bg-[var(--color-bad-soft)] text-[var(--color-bad)] border-transparent',
} as const

export type Tone = keyof typeof TONES

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Status -> tone. Kept in one place so the tracker and detail page never disagree. */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'Offer': return 'ok'
    case 'Interview':
    case 'Responded': return 'accent'
    case 'Applied':
    case 'Tailored': return 'warn'
    case 'Rejected':
    case 'SKIP':
    case 'Discarded': return 'bad'
    default: return 'neutral'
  }
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      <p className="text-sm text-[var(--color-muted)]">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-[var(--color-faint)]">{hint}</p> : null}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-3.5 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]',
        className,
      )}
    />
  )
}
