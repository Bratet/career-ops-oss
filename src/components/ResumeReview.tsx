'use client'

import Link from 'next/link'
import type { EditorChatTurn } from '@/lib/chatPersistence'

export function ResumeReview({ review, current, stale, onDiscuss }: {
  review: NonNullable<EditorChatTurn['review']>
  current: boolean
  stale: boolean
  onDiscuss: (message: string) => void
}) {
  const report = review.report
  return (
    <div className="mt-3 border-t pt-3">
      {stale && current && <p role="status" className="mb-3 rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-xs text-[var(--color-warn)]">This review describes an earlier draft. Run Review resume again to update it.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{current ? 'Current review' : 'Earlier review'}</h3>
        <Link href={`/runs/${review.runId}`} className="text-[11px] text-[var(--color-muted)] underline underline-offset-4">{review.engine} · Skill v{review.skillVersion} · Inspect run</Link>
      </div>
      {current ? (
        <div className="mt-3 space-y-4">
          <p className="text-sm leading-relaxed">{report.assessment}</p>
          {report.strengths.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold">Keep what works</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--color-muted)]">{report.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </section>
          )}
          <section>
            <h4 className="text-xs font-semibold">Priority findings</h4>
            {report.findings.length ? (
              <ol className="mt-2 space-y-2">
                {report.findings.map((finding, index) => (
                  <li key={index} className="rounded-lg border bg-[var(--color-bg)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs font-semibold">{finding.location}</p>
                      <span className="text-[10px] text-[var(--color-muted)]">{finding.kind === 'question' ? 'Needs your input' : finding.kind === 'render-check' ? 'Check the PDF' : 'Supported edit'}</span>
                    </div>
                    {finding.excerpt && <blockquote className="mt-2 border-l pl-3 text-xs text-[var(--color-muted)]">“{finding.excerpt}”</blockquote>}
                    <p className="mt-2 text-xs leading-relaxed">{finding.issue}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{finding.recommendation}</p>
                    {finding.suggestedWording && <p className="mt-2 text-xs"><span className="font-semibold">Suggested wording: </span>{finding.suggestedWording}</p>}
                    <button type="button" onClick={() => onDiscuss(`I want to discuss your finding about ${finding.location}: ${finding.issue}`)} className="mt-3 text-xs font-medium text-[var(--color-accent)] hover:underline">Discuss this finding</button>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-1 text-xs text-[var(--color-muted)]">No priority issues identified.</p>}
          </section>
          {report.questions.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold">Questions for you</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--color-muted)]">{report.questions.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </section>
          )}
          <p className="text-[11px] text-[var(--color-muted)]">Text review only. PDF layout, reading order, and links have not been verified. Review findings do not edit your resume.</p>
        </div>
      ) : <p className="mt-2 text-xs text-[var(--color-muted)]">{report.assessment}</p>}
    </div>
  )
}
