import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Card, CardHeader } from '@/components/ui/primitives'
import { getSkillRun } from '@/lib/skills/runs'

export const dynamic = 'force-dynamic'

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    const run = await getSkillRun((await params).id)
    const duration = run.completedAt
      ? Math.max(0, Date.parse(run.completedAt) - Date.parse(run.startedAt))
      : null

    return (
      <div className="space-y-4">
        <div>
          <Link href="/runs" className="text-xs text-[var(--color-faint)] hover:text-[var(--color-accent)]">← AI runs</Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{run.skillName}</h1>
            <Badge tone={run.status === 'complete' ? 'ok' : run.status === 'failed' ? 'bad' : 'warn'}>{run.status}</Badge>
            <Badge>v{run.skillVersion}</Badge>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-[var(--color-faint)]">{run.id}</p>
        </div>

        {run.error ? (
          <Card className="border-[var(--color-bad-soft)] px-4 py-3 text-xs text-[var(--color-bad)]">{run.error}</Card>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-3">
            <Card>
              <CardHeader title="Execution" />
              <dl className="space-y-2 p-4 text-xs">
                <Row label="Skill" value={`${run.skillId} · v${run.skillVersion}`} href={`/skills/${run.skillId}`} />
                <Row label="Runner" value={run.runner} mono />
                <Row label="Feature" value={run.feature} />
                <Row label="Engine" value={run.engine} />
                <Row label="Application" value={run.applicationKey ?? 'none'} href={run.applicationKey ? `/applications/${run.applicationKey}` : undefined} />
                <Row label="Started" value={new Date(run.startedAt).toLocaleString()} />
                <Row label="Duration" value={duration === null ? 'still running' : formatDuration(duration)} />
              </dl>
            </Card>

            <Card>
              <CardHeader title="Input manifest" hint="Summaries only; source documents stay in their existing files." />
              <Json value={run.inputSummary} />
            </Card>
          </div>

          <div className="space-y-3">
            <Card>
              <CardHeader title="Decision trace" hint="Observable events and outcomes, not hidden chain-of-thought." />
              {run.events.length ? (
                <ol className="divide-y divide-[var(--color-border)]">
                  {run.events.map((event, index) => (
                    <li key={index} className="grid grid-cols-[72px_minmax(0,1fr)_90px] gap-3 px-4 py-2.5">
                      <span className="font-mono text-[10px] uppercase text-[var(--color-accent)]">{event.type}</span>
                      <span className="text-xs leading-relaxed text-[var(--color-muted)]">{event.message ?? '—'}</span>
                      <span className="text-right font-mono text-[10px] text-[var(--color-faint)]">{new Date(event.at).toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="px-4 py-6 text-center text-xs text-[var(--color-faint)]">No events recorded.</p>}
            </Card>

            <Card>
              <CardHeader title="Result summary" />
              <Json value={run.result} />
            </Card>
          </div>
        </div>
      </div>
    )
  } catch {
    notFound()
  }
}

function Row({ label, value, href, mono = false }: { label: string; value: string; href?: string; mono?: boolean }) {
  const content = <span className={mono ? 'font-mono text-[11px]' : 'text-[var(--color-muted)]'}>{value}</span>
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">{label}</dt>
      <dd className="mt-0.5">{href ? <Link href={href} className="text-[var(--color-accent)] hover:underline">{content}</Link> : content}</dd>
    </div>
  )
}

function Json({ value }: { value: unknown }) {
  return <pre className="overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[11px] leading-relaxed text-[var(--color-muted)]">{JSON.stringify(value, null, 2) ?? 'null'}</pre>
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
