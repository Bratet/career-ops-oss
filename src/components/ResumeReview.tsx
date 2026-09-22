'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { resumeReviewParser, type ResumeReview as Review } from '@/lib/resumeReview'
import { Spinner } from './ui/primitives'

export function ResumeReview({ yaml, source }: { yaml: string; source: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ review: Review; yaml: string; runId: string; skillVersion: number; engine: string } | null>(null)
  const [open, setOpen] = useState(true)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function review() {
    if (controller.current) return
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/profile/review', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yaml, source }), signal: abort.signal,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Review failed. Try again.')
      setResult({ ...data, review: resumeReviewParser.parse(data.review), yaml })
      setOpen(true)
    } catch (error) {
      if (!abort.signal.aborted) setError(error instanceof Error ? error.message : 'Review failed. Try again.')
    } finally {
      controller.current = null
      setBusy(false)
    }
  }

  const button = 'rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50'
  return (
    <section aria-label="Resume review" className="shrink-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} disabled={busy || !yaml.trim()} onClick={() => void review()}>{busy ? <span className="flex items-center gap-2"><Spinner />Reviewing…</span> : result ? 'Review resume again' : 'Review resume'}</button>
        {busy ? <button className={button} onClick={() => controller.current?.abort()}>Cancel review</button> : null}
        {result ? <button className={button} aria-expanded={open} aria-controls="resume-review-results" onClick={() => setOpen(!open)}>{open ? 'Hide review' : 'Show review'}</button> : null}
        <Link href="/skills/review-resume" className="text-xs text-[var(--color-muted)] underline underline-offset-4">Edit review skill</Link>
      </div>
      <p role="status" className="text-xs text-[var(--color-muted)]">{busy ? 'Reading this draft using your editor AI settings. This may take a minute.' : 'Reviews the current draft, including unsaved edits. Your resume stays unchanged.'}</p>
      {error ? <p role="alert" className="text-sm text-[var(--color-bad)]">{error}</p> : null}
      {result && open ? (
        <div id="resume-review-results" className="max-h-[45vh] space-y-4 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm leading-relaxed break-words">
          {result.yaml !== yaml ? <p role="status" className="text-[var(--color-warn)]">The draft has changed since this review. Review again for updated findings.</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Resume review</h2><Link href={`/runs/${result.runId}`} className="text-xs underline underline-offset-4">{result.engine} · Skill v{result.skillVersion} · Inspect run</Link></div>
          <p>{result.review.assessment}</p>
          {result.review.strengths.length ? <div><h3 className="font-medium">What works</h3><ul className="mt-1 list-disc space-y-1 pl-5">{result.review.strengths.map((text, i) => <li key={i}>{text}</li>)}</ul></div> : null}
          {result.review.findings.length ? <div><h3 className="font-medium">Priority findings</h3><ol className="mt-2 space-y-4">{result.review.findings.map((finding, i) => <li key={i} className="space-y-1 border-t border-[var(--color-border)] pt-3">
            <h4 className="font-medium">{finding.location}</h4>
            <p className="text-xs text-[var(--color-muted)]">{finding.kind === 'question' ? 'Needs your input' : finding.kind === 'render-check' ? 'Needs PDF verification' : 'Supported by current evidence'}</p>
            {finding.excerpt ? <blockquote className="text-[var(--color-muted)]">“{finding.excerpt}”</blockquote> : null}
            <p>{finding.issue}</p><p>{finding.recommendation}</p>
            {finding.suggestedWording ? <p><span className="font-medium">Suggested wording: </span>{finding.suggestedWording}</p> : null}
          </li>)}</ol></div> : <p>No priority issues identified.</p>}
          {result.review.questions.length ? <div><h3 className="font-medium">Questions for you</h3><ul className="mt-1 list-disc space-y-1 pl-5">{result.review.questions.map((text, i) => <li key={i}>{text}</li>)}</ul></div> : null}
          <p className="text-xs text-[var(--color-muted)]">Text review only. PDF layout, reading order, and links have not been verified.</p>
        </div>
      ) : null}
    </section>
  )
}
