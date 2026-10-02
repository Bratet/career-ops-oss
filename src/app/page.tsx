import Link from 'next/link'
import { computeStats, listApplications } from '@/lib/applications'
import { readRows } from '@/lib/tracker'
import { funnelData } from '@/lib/weeks'
import {
  activityGrid, appliedByDay, daysBetween, isPeriod, lastAppliedDate, localIso, periodActivity, type Period, type PeriodActivity,
} from '@/lib/activity'
import { Card, CardHeader, Badge, statusTone, Empty } from '@/components/ui/primitives'
import { ActivityGrid, DailyChart, FunnelChart, ScoreChart } from '@/components/Charts'
import { GoalCard, GoalHistory } from '@/components/GoalCard'
import { goalProgress, readGoal } from '@/lib/goal'
import { cn, fmtDate, pct, relDays } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const GRID_WEEKS = 52

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: requested } = await searchParams
  const period: Period = isPeriod(requested) ? requested : 'week'
  const [stats, rows, apps, goal] = await Promise.all([computeStats(), readRows(), listApplications(), readGoal()])
  const now = new Date()
  const progress = goal ? goalProgress(goal, rows, now) : null
  const week = periodActivity(rows, 'week', now)
  const month = periodActivity(rows, 'month', now)
  const shown = period === 'week' ? week : month
  const grid = activityGrid(rows, GRID_WEEKS, now)
  const gridActive = grid.flat().filter((day) => day.applied > 0).length
  const gridDays = grid.flat().filter((day) => !day.future).length
  const last = lastAppliedDate(rows, now)
  const sinceLast = last ? daysBetween(last, localIso(now)) : null
  const sentToday = appliedByDay(rows).get(localIso(now)) ?? 0
  const funnel = funnelData(stats.byStatus)
  const recent = apps.slice(0, 8)

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

      {unlinked > 0 ? (
        <Card className="border-[var(--color-warn-soft)]">
          <div className="flex items-center gap-3 px-5 py-2.5">
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

      {/* The goal sits top-right on wide screens and first on narrow ones. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Sent today"
              value={sentToday}
              hint={progress?.today
                ? progress.today.status === 'met' ? 'today\'s goal met' : `${progress.today.target - progress.today.done} to go for today's goal`
                : sentToday ? 'keep it going' : 'nothing yet today'}
            />
            <Stat
              label="Applied this week"
              value={week.applied}
              hint={comparison(week, 'last week')}
              delta={week.applied - week.previousSoFar}
            />
            <Stat
              label="Applied this month"
              value={month.applied}
              hint={comparison(month, 'last month')}
              delta={month.applied - month.previousSoFar}
            />
            <Stat
              label="Active days this week"
              value={`${week.activeDays} of ${week.elapsedDays}`}
              hint="days with at least one sent"
            />
            <Stat
              label="Last application"
              value={sinceLast === null ? '—' : sinceLast === 0 ? 'Today' : `${sinceLast}d ago`}
              hint={last ? fmtDate(last) : 'nothing sent yet'}
            />
            <Stat
              label="Response rate"
              value={pct(stats.responseRate)}
              hint={stats.sent ? `${stats.responded} of ${stats.sent} sent` : 'nothing sent yet'}
            />
          </div>

          <Card className="flex-1">
            <CardHeader
              title={period === 'week' ? 'Applied this week' : `Applied in ${monthName(month.start)}`}
              hint={`${shown.applied} sent · ${shown.activeDays} of ${shown.elapsedDays} days active · ${shown.previousTotal} in all of last ${period}`}
              action={<PeriodToggle period={period} />}
            />
            <div className="p-4 pt-2">
              <DailyChart days={shown.days} period={period} goal={progress?.daily ?? null} />
            </div>
          </Card>
        </div>

        <div className="order-1 flex flex-col gap-3 lg:order-2">
          <GoalCard progress={progress} />
          {progress ? <GoalHistory progress={progress} /> : null}
        </div>
      </div>

      <Card>
        <CardHeader
          title={`Every day, last ${GRID_WEEKS} weeks`}
          hint={`${gridActive} of ${gridDays} days with an application sent`}
        />
        <div className="p-5 pt-4">
          <ActivityGrid weeks={grid} />
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <CardHeader title="Pipeline" hint="Where everything currently sits" />
            <div className="p-4 pt-2">
              {funnel.length ? <FunnelChart data={funnel} /> : <Empty title="Nothing tracked yet" />}
            </div>
          </Card>

          <Card className="flex-1">
            <CardHeader title="Score distribution" hint={`${stats.scoreBuckets.reduce((a, b) => a + b.count, 0)} scored`} />
            <div className="p-4 pt-2">
              {stats.scoreBuckets.some((b) => b.count) ? (
                <ScoreChart data={stats.scoreBuckets} />
              ) : (
                <Empty title="No scores recorded" />
              )}
            </div>
          </Card>
        </div>

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

/** "3 by this point last week", so a Tuesday is never judged against a full week. */
function comparison(activity: PeriodActivity, previous: string): string {
  if (activity.applied === 0 && activity.previousSoFar === 0) return `none by now ${previous} either`
  return `${activity.previousSoFar} by this point ${previous}`
}

function monthName(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function PeriodToggle({ period }: { period: Period }) {
  return (
    <div role="group" aria-label="Period" className="flex rounded-lg border border-[var(--color-border)] p-0.5 text-xs">
      {(['week', 'month'] as const).map((option) => (
        <Link
          key={option}
          href={option === 'week' ? '/' : '/?period=month'}
          aria-current={period === option ? 'page' : undefined}
          scroll={false}
          className={cn(
            'rounded-md px-2.5 py-1 transition-colors',
            period === option
              ? 'bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]'
              : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
          )}
        >
          {option === 'week' ? 'Week' : 'Month'}
        </Link>
      ))}
    </div>
  )
}
