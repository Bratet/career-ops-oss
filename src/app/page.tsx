import Link from 'next/link'
import { computeStats, listApplications } from '@/lib/applications'
import { readRows } from '@/lib/tracker'
import { byWeek, funnelData } from '@/lib/weeks'
import { Card, CardHeader, Badge, statusTone, Empty } from '@/components/ui/primitives'
import { WeeklyChart, FunnelChart, ScoreChart } from '@/components/Charts'
import { fmtDate, pct, relDays } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [stats, rows, apps] = await Promise.all([computeStats(), readRows(), listApplications()])
  const weeks = byWeek(rows)
  const funnel = funnelData(stats.byStatus)
  const recent = apps.slice(0, 8)

  const delta = stats.thisWeek - stats.lastWeek
  const linked = apps.filter((a) => a.row && a.folder).length
  const unlinked = apps.filter((a) => a.row && !a.folder).length
  const orphans = apps.filter((a) => !a.row && a.folder).length

  return (
    <div className="space-y-5">
      <div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-[var(--color-faint)]">
            {stats.total} tracked · {linked} linked to a folder
            {orphans ? ` · ${orphans} folder${orphans === 1 ? '' : 's'} with no row` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total" value={stats.total} hint="all time" />
        <Stat
          label="This week"
          value={stats.thisWeek}
          hint={stats.lastWeek === 0 && stats.thisWeek === 0 ? 'none last week either' : `${stats.lastWeek} last week`}
          delta={delta}
        />
        <Stat label="Sent" value={stats.sent} hint="applied or beyond" />
        <Stat
          label="Response rate"
          value={pct(stats.responseRate)}
          hint={stats.sent ? `${stats.responded} of ${stats.sent} sent` : 'nothing sent yet'}
        />
        <Stat
          label="Avg score"
          value={stats.avgScore ? stats.avgScore.toFixed(2) : '—'}
          hint={stats.avgScore ? 'out of 5' : 'no scores yet'}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Applications per week"
            hint="Weekly, because 42 rows over 11 weeks makes a daily axis mostly zeros"
          />
          <div className="p-4 pt-2">
            {weeks.length ? <WeeklyChart data={weeks} /> : <Empty title="No dated applications yet" />}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pipeline" hint="Where everything currently sits" />
          <div className="p-4 pt-2">
            {funnel.length ? <FunnelChart data={funnel} /> : <Empty title="Nothing tracked yet" />}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Score distribution" hint={`${stats.scoreBuckets.reduce((a, b) => a + b.count, 0)} scored`} />
          <div className="p-4 pt-2">
            {stats.scoreBuckets.some((b) => b.count) ? (
              <ScoreChart data={stats.scoreBuckets} />
            ) : (
              <Empty title="No scores recorded" />
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent activity"
            action={
              <Link href="/applications" className="text-xs text-[var(--color-accent)] hover:underline">
                All applications →
              </Link>
            }
          />
          {recent.length ? (
            <ul className="divide-y divide-[var(--color-border)]">
              {recent.map((a) => {
                const date = a.row?.date ?? a.folder?.date ?? ''
                const days = relDays(date)
                return (
                  <li key={a.key}>
                    <Link
                      href={`/applications/${a.key}`}
                      className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">
                          {a.row?.company ?? a.folder?.slug ?? 'Unknown'}
                        </span>
                        <span className="block truncate text-xs text-[var(--color-faint)]">
                          {a.row?.role ?? 'no tracker row'}
                        </span>
                      </span>
                      {a.row ? <Badge tone={statusTone(a.row.status)}>{a.row.status}</Badge> : <Badge>unlinked</Badge>}
                      <span className="w-24 shrink-0 text-right text-xs text-[var(--color-faint)] tnum">
                        {days === null ? fmtDate(date) : days === 0 ? 'today' : `${days}d ago`}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty title="Nothing yet" hint="Use New application in the header to paste your first job description." />
          )}
        </Card>
      </div>

      {unlinked > 0 ? (
        <Card className="border-[var(--color-warn-soft)]">
          <div className="flex items-center gap-3 px-5 py-3">
            <span className="text-xs text-[var(--color-warn)]">⚠</span>
            <p className="flex-1 text-xs text-[var(--color-muted)]">
              {unlinked} tracker row{unlinked === 1 ? '' : 's'} {unlinked === 1 ? 'has' : 'have'} no folder linked, so
              their documents can&apos;t be shown.
            </p>
            <Link href="/applications" className="text-xs text-[var(--color-accent)] hover:underline">
              Link them →
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function Stat({
  label, value, hint, delta,
}: {
  label: string
  value: string | number
  hint?: string
  delta?: number
}) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-[var(--color-faint)]">{label}</p>
        {delta !== undefined && delta !== 0 ? (
          // Arrow + sign, never color alone.
          <span
            className="text-[11px] font-medium tnum"
            style={{ color: delta > 0 ? 'var(--color-status-good)' : 'var(--color-muted)' }}
          >
            {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">{hint}</p> : null}
    </Card>
  )
}
