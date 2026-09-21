import Link from 'next/link'
import { Badge, Card, Empty } from '@/components/ui/primitives'
import { listSkillRuns, type SkillRunStatus } from '@/lib/skills/runs'

export const dynamic = 'force-dynamic'

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ applicationKey?: string }> }) {
  const { applicationKey } = await searchParams
  const runs = await listSkillRuns({ applicationKey, limit: 200 })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">AI runs</h1>
          <p className="mt-0.5 text-xs text-[var(--color-faint)]">
            {applicationKey ? `Runs for ${applicationKey}` : 'Which skill ran, what it received, and how it finished.'}
          </p>
        </div>
        {applicationKey ? <Link href="/runs" className="text-xs text-[var(--color-accent)] hover:underline">Show all runs</Link> : null}
      </div>

      <Card className="overflow-hidden">
        {runs.length ? (
          <ul className="divide-y divide-[var(--color-border)]">
            {runs.map((run) => (
              <li key={run.id}>
                <Link href={`/runs/${run.id}`} className="grid gap-2 px-5 py-3 transition-colors hover:bg-[var(--color-surface-2)] sm:grid-cols-[minmax(0,1fr)_180px_130px] sm:items-center">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium">{run.skillName}</span>
                      <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                      <Badge>v{run.skillVersion}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--color-faint)]">
                      {run.feature} · {run.engine}{run.applicationKey ? ` · ${run.applicationKey}` : ''}
                    </span>
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">{new Date(run.startedAt).toLocaleString()}</span>
                  <span className="text-right font-mono text-[10px] text-[var(--color-faint)]">{run.id}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No AI runs recorded yet" hint="Analyze a posting or tailor a CV to create the first run." />
        )}
      </Card>
    </div>
  )
}

function statusTone(status: SkillRunStatus): 'ok' | 'bad' | 'warn' {
  if (status === 'complete') return 'ok'
  if (status === 'failed') return 'bad'
  return 'warn'
}
