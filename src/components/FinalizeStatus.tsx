'use client'

import { useEffect, useState } from 'react'
import type { CoverLetter } from '@/lib/coverLetter'
import { Badge } from './ui/primitives'

export interface FinalizedSnapshot {
  /** When the PDF was last written. */
  at: string
}

/** What each PDF in the application folder was last rendered from. */
export interface FinalizedState {
  resume: (FinalizedSnapshot & { yaml: string }) | null
  letter: (FinalizedSnapshot & { letter: CoverLetter | null }) | null
}

/**
 * One answer to "does the PDF match what I see?", instead of separate saving,
 * review, and finalized signals. Shared by the resume and the cover letter.
 */
export function FinalizeStatus({ saveState, pendingReview = false, finalized, upToDate }: {
  saveState: 'saved' | 'saving' | 'error'
  pendingReview?: boolean
  finalized: FinalizedSnapshot | null
  upToDate: boolean
}) {
  // Times are formatted in the browser's timezone only, never during server rendering.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (saveState === 'error') return <Badge tone="bad">Autosave failed · draft not saved</Badge>
  const draft = saveState === 'saving' ? 'Saving draft…' : pendingReview ? 'AI changes waiting for your review' : 'Draft saved'
  if (!finalized) return <Badge tone={pendingReview ? 'warn' : 'neutral'}>{draft} · not finalized yet</Badge>
  const time = mounted ? ` ${formatFinalizedAt(finalized.at)}` : ''
  if (upToDate && !pendingReview) return <Badge tone="ok">Finalized{time} · PDF matches the draft</Badge>
  return <Badge tone="warn">{draft} · changed since the PDF was finalized{time}</Badge>
}

function formatFinalizedAt(iso: string): string {
  const at = new Date(iso)
  const sameDay = at.toDateString() === new Date().toDateString()
  return sameDay
    ? `at ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : `on ${at.toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}
