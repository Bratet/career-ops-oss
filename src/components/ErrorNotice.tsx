'use client'

import { friendlyError } from '@/lib/friendlyError'
import { cn } from '@/lib/utils'

/** An error in plain words, what to do next, an optional Retry, and the raw message behind a toggle. */
export function ErrorNotice({ error, onRetry, onDismiss, className }: {
  error: string
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
}) {
  const { title, hint, detail } = friendlyError(error)
  return <div role="alert" className={cn('space-y-1 bg-[var(--color-bad-soft)] px-3 py-2 text-xs text-[var(--color-bad)]', className)}>
    <div className="flex flex-wrap items-center gap-2">
      <p className="flex-1 font-medium">{title}</p>
      {onRetry ? <button type="button" onClick={onRetry} className="rounded-md bg-[var(--color-bad)] px-2.5 py-1 text-[11px] font-medium text-white">Retry</button> : null}
      {onDismiss ? <button type="button" onClick={onDismiss} className="rounded-md px-2 py-1 text-[11px] hover:underline">Dismiss</button> : null}
    </div>
    {hint ? <p className="text-[var(--color-text)] opacity-80">{hint}</p> : null}
    {detail ? <details><summary className="cursor-pointer opacity-80">Details</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{detail}</pre></details> : null}
  </div>
}
