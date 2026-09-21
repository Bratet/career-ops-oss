'use client'

import type { EligibilityIssue } from '@/lib/eligibility'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import type { ApplicationWorkspace } from '@/lib/workspaces'
import type { ProfileFitRow } from '@/lib/profileFit'
import { Badge, Card, CardHeader, Empty, Spinner } from '@/components/ui/primitives'

const labels = { gap: 'No recorded evidence', supporting: 'Related experience', direct: 'Direct experience' } as const

export function Overview({ analysis, workspace, onRetry, onOpenChat, eligibility }: {
  eligibility: EligibilityIssue[]
  analysis: JdAnalysis | null
  workspace: ApplicationWorkspace
  onRetry: () => void
  onOpenChat: () => void
}) {
  const { fit } = workspace
  const report = fit.report
  const loading = fit.status === 'running' || fit.status === 'queued'
  if (workspace.general && workspace.generalDetails) {
    const details = workspace.generalDetails
    return <Card><CardHeader title="General resume application" hint="No job description supplied. Edit your application’s CV in Resume, then finalize it when ready." /><div className="space-y-3 p-5">
      <Info label="Company" value={details.company} /><Info label="Role" value={details.role} />
      <Info label="Location" value={details.location} /><Info label="HR contact" value={details.contact} />
      <Info label="Resume language" value={details.language === 'fr' ? 'French' : 'English'} />
      {details.url ? <a href={details.url} target="_blank" rel="noreferrer" className="block break-all text-xs text-[var(--color-accent)] underline">{details.url}</a> : null}
      {details.notes ? <p className="whitespace-pre-wrap text-sm text-[var(--color-muted)]">{details.notes}</p> : null}
    </div></Card>
  }
  if (!analysis) return <Card><Empty title="Add a job description to assess your fit" hint="This application has no analyzed posting yet. Create an application from the posting to compare its requirements with your master resume." /></Card>
  const rows = [...(report?.requirements ?? [])].sort((a, b) => a.rank - b.rank)
  const requiredGaps = rows.filter((row) => row.weight === 'must' && row.classification === 'gap')
  const partial = rows.filter((row) => row.weight === 'must' && row.classification === 'supporting')
  const optionalGaps = rows.filter((row) => row.weight === 'nice' && row.classification !== 'direct')
  const direct = rows.filter((row) => row.weight === 'must' && row.classification === 'direct').length

  return <div className="space-y-5">
    {eligibility.length ? <Card>
      <CardHeader title="Eligibility comes first" hint="Hiring requirements to check before assessing your technical fit" />
      <div className="px-5 pb-5">
        <ul className="divide-y divide-[var(--color-border)]">{eligibility.map((issue) => <li key={issue.requirement} className="space-y-2 py-4">
          <Badge tone={issue.status === 'unmet' ? 'bad' : issue.status === 'confirm' ? 'warn' : 'ok'}>{issue.status === 'unmet' ? 'Critical: requirement not met' : issue.status === 'confirm' ? 'Eligibility to confirm' : 'Eligibility confirmed'}</Badge>
          <p className="text-base font-semibold leading-relaxed">{issue.requirement}</p>
          <p className="max-w-prose text-sm leading-relaxed text-[var(--color-muted)]">{issue.explanation}</p>
        </li>)}</ul>
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">{analysis.sponsorship === 'offered' ? 'The posting mentions visa sponsorship. Confirm how it applies to these eligibility requirements.' : analysis.sponsorship === 'not-offered' ? 'The posting says sponsorship is not offered.' : 'Visa sponsorship is not confirmed in the posting. Relocation support alone does not confirm sponsorship.'}</p>
        {eligibility.some((issue) => issue.status !== 'met') ? <p className="mt-2 text-sm leading-relaxed">Clarify these conditions with the employer if you decide to apply.</p> : null}
        <button onClick={onOpenChat} className="mt-4 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]">Discuss eligibility with AI</button>
      </div>
    </Card> : null}
    {loading || fit.status === 'error' || !report ? <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5" role="status">
        <div className="flex items-start gap-3">
          {loading ? <Spinner /> : null}
          <div>
            <p className="text-sm font-medium">{loading ? 'Comparing the job requirements with your master resume…' : fit.status === 'error' ? 'The fit analysis could not finish' : 'Your fit has not been assessed yet'}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">{report ? 'The previous assessment is shown below until a new one is ready.' : 'Gaps and relevant experience will appear here when the analysis finishes.'}</p>
            {fit.error ? <details className="mt-2 text-xs text-[var(--color-muted)]"><summary className="cursor-pointer">Error details</summary><p className="mt-1 break-words">{fit.error}</p></details> : null}
          </div>
        </div>
        {!loading ? <button onClick={onRetry} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]">{fit.status === 'error' ? 'Retry fit analysis' : 'Analyze my fit'}</button> : null}
      </div>
    </Card> : null}

    {report ? <>
      <Card>
        <CardHeader title="What needs your attention" hint="Gaps after considering your resume and confirmed clarifications" action={<button onClick={onOpenChat} className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-[var(--color-bg)] hover:opacity-90">Discuss with AI</button>} />
        <div className="space-y-5 p-5">
          <section aria-labelledby="required-gaps-title">
            <h3 id="required-gaps-title" className="text-sm font-semibold">Required skills with no recorded evidence <span className="ml-1 text-[var(--color-muted)]">({requiredGaps.length})</span></h3>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--color-muted)]">If you have this experience, tell the AI so it can help update your profile. Otherwise, keep it as a gap to prepare for.</p>
            {requiredGaps.length ? <RequirementList rows={requiredGaps} /> : <p className="mt-3 text-sm text-[var(--color-ok)]">No required skills were marked as missing from your profile.</p>}
          </section>
          {partial.length ? <section className="border-t border-[var(--color-border)] pt-4" aria-labelledby="partial-title">
            <h3 id="partial-title" className="text-sm font-semibold">Requirements to clarify <span className="ml-1 text-[var(--color-muted)]">({partial.length})</span></h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">You have related experience, but it does not fully demonstrate these requirements.</p>
            <RequirementList rows={partial} />
          </section> : null}
          {report.keyGaps.length ? <details className="border-t border-[var(--color-border)] pt-3"><summary className="cursor-pointer text-xs font-medium">Read the gap analysis notes</summary><TextList rows={report.keyGaps} /></details> : null}
          {optionalGaps.length ? <details className="border-t border-[var(--color-border)] pt-3"><summary className="cursor-pointer text-xs font-medium">Optional requirements to review ({optionalGaps.length})</summary><p className="mt-2 text-xs text-[var(--color-muted)]">These are listed as nice-to-have in the posting.</p><RequirementList rows={optionalGaps} /></details> : null}
        </div>
      </Card>
      <section className="px-1" aria-labelledby="strengths-title">
        <h2 id="strengths-title" className="text-sm font-semibold">What strengthens your application</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{report.coverage.must.total ? `${direct} of ${report.coverage.must.total} required skills have direct evidence; ${partial.length} have related experience.` : 'The posting has no requirements classified as must-have.'}</p>
        {report.recommendedEmphasis.length ? <TextList rows={report.recommendedEmphasis} /> : <p className="mt-3 text-xs text-[var(--color-muted)]">No specific strengths were highlighted. Check the evidence below.</p>}
      </section>
    </> : null}

    <Card>
      <CardHeader title="Role details" />
      <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Location" value={analysis.location} /><Info label="Work arrangement" value={analysis.workMode} /><Info label="Seniority" value={analysis.seniority} /><Info label="Visa sponsorship" value={analysis.sponsorship} />
      </dl>
      {analysis.summary ? <p className="border-t border-[var(--color-border)] px-5 py-4 text-sm leading-relaxed text-[var(--color-muted)]">{analysis.summary}</p> : null}
      {analysis.keywords.length ? <details className="border-t border-[var(--color-border)] px-5 py-3"><summary className="cursor-pointer text-xs font-medium">Skills and keywords in the posting</summary><div className="mt-3 flex flex-wrap gap-2">{analysis.keywords.map((word) => <Badge key={word}>{word}</Badge>)}</div></details> : null}
    </Card>

    <Card>
      <details>
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">All job requirements and your evidence ({analysis.requirements.length})</summary>
        <p className="px-5 pb-4 text-xs text-[var(--color-muted)]">Based on your master resume and confirmed application facts. Related experience is a partial match, not direct proof.</p>
        {(['must', 'nice'] as const).map((weight) => <section key={weight} className="border-t border-[var(--color-border)] p-5">
          <h3 className="text-sm font-medium">{weight === 'must' ? 'Required' : 'Nice-to-have'}</h3>
          <ul className="mt-2 divide-y divide-[var(--color-border)]">
            {analysis.requirements.filter((row) => row.weight === weight).sort((a, b) => a.rank - b.rank).map((row) => {
              const evidence = rows.find((item) => item.weight === weight && item.rank === row.rank)
              return <li key={`${weight}-${row.rank}`} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 flex-1 text-sm leading-relaxed">{row.text}</p><EvidenceBadge row={evidence} /></div>
                {row.priorityReason ? <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">Why it matters: {row.priorityReason}</p> : null}
                {evidence?.evidence.length ? <TextList rows={evidence.evidence} /> : null}
              </li>
            })}
            {!analysis.requirements.some((row) => row.weight === weight) ? <li className="py-3 text-xs text-[var(--color-muted)]">None listed.</li> : null}
          </ul>
        </section>)}
      </details>
    </Card>
  </div>
}

function RequirementList({ rows }: { rows: ProfileFitRow[] }) {
  return <ul className="mt-2 divide-y divide-[var(--color-border)]">{rows.map((row) => <li key={`${row.weight}-${row.rank}`} className="py-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 flex-1 text-sm leading-relaxed">{row.requirement}</p><EvidenceBadge row={row} /></div>
    {row.evidence.length ? <TextList rows={row.evidence} /> : null}
  </li>)}</ul>
}
function EvidenceBadge({ row }: { row?: ProfileFitRow }) {
  return row ? <Badge tone={row.classification === 'direct' ? 'ok' : row.classification === 'supporting' ? 'warn' : 'bad'}>{labels[row.classification]}</Badge> : <Badge>Not assessed yet</Badge>
}
function TextList({ rows }: { rows: string[] }) {
  return <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-muted)]">{rows.map((row, index) => <li key={index}>{row}</li>)}</ul>
}
function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><dt className="text-xs text-[var(--color-muted)]">{label}</dt><dd className="mt-1 leading-relaxed">{value || 'Not specified in the posting'}</dd></div>
}
