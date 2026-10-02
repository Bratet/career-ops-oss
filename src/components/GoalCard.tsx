'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CircleAlert, Flame, Pencil, Target, TrendingUp } from 'lucide-react'
import { Card, Spinner } from '@/components/ui/primitives'
import type { Goal, GoalProgress, GoalStreak, GoalTrack, GoalUnit } from '@/lib/goal'
import { cn } from '@/lib/utils'

type View = 'today' | 'week' | 'month'

const UNIT_SHORT: Record<GoalUnit, string> = { day: 'working day', week: 'week', month: 'month' }
const VIEW_COPY: Record<View, { tab: string; period: string; left: string }> = {
  today: { tab: 'Today', period: 'today', left: 'today' },
  week: { tab: 'Week', period: 'this week', left: 'this week' },
  month: { tab: 'Month', period: 'this month', left: 'this month' },
}

/**
 * The application goal as a square card: one period at a time as a ring with
 * a pace tick, what it takes to still make it, and the current streak.
 */
export function GoalCard({ progress }: { progress: GoalProgress | null }) {
  const [editing, setEditing] = useState(false)
  const goal = progress?.goal ?? null
  const views: View[] = progress?.today ? ['today', 'week', 'month'] : ['week', 'month']
  const [picked, setPicked] = useState<View | null>(null)
  const view = picked && views.includes(picked) ? picked : views[0]

  if (!progress || editing) {
    return (
      <Card className="flex flex-1 flex-col">
        <Header goal={goal} />
        <GoalForm goal={goal} onDone={() => setEditing(false)} />
      </Card>
    )
  }

  const track = progress[view]!
  return (
    <Card className="flex flex-col lg:aspect-square">
      <Header goal={goal} onEdit={() => setEditing(true)} />
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <div role="tablist" aria-label="Goal period" className="flex rounded-lg border border-[var(--color-border)] p-0.5 text-xs">
          {views.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={option === view}
              onClick={() => setPicked(option)}
              className={cn(
                'flex-1 rounded-md px-2 py-1 transition-colors',
                option === view
                  ? 'bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {VIEW_COPY[option].tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-5">
          <Ring track={track} label={VIEW_COPY[view].period} />
          <div className="min-w-0 flex-1 space-y-2 text-xs">
            <Status track={track} />
            <Need track={track} view={view} />
            {view !== 'today' && track.status !== 'met' && track.projected > 0 ? (
              <p className="text-[var(--color-muted)]">
                On course for <span className="font-medium text-[var(--color-text)] tnum">{track.projected}</span> {track.projected >= track.target ? '(enough)' : `of ${track.target}`}
              </p>
            ) : null}
          </div>
        </div>

        <WeekStrip days={progress.weekDays} />

        <div className="mt-auto border-t border-[var(--color-border)] pt-3">
          <StreakLine streak={progress.streak} />
        </div>
      </div>
    </Card>
  )
}

function Header({ goal, onEdit }: { goal: Goal | null; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Target className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-medium leading-tight">Goal</h2>
          <p className="text-[11px] text-[var(--color-faint)]">
            {goal ? `${goal.amount} per ${UNIT_SHORT[goal.unit]}` : 'Not set yet'}
          </p>
        </div>
      </div>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Change goal"
          className="grid size-7 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <Pencil className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

const R = 52
const C = 2 * Math.PI * R

/** Progress ring with a tick where the count should be by today. */
function Ring({ track, label }: { track: GoalTrack; label: string }) {
  const fill = Math.min(1, track.done / track.target)
  const pace = track.expected / track.target
  const angle = pace * 2 * Math.PI - Math.PI / 2
  const showPace = track.status !== 'met' && pace > 0 && pace < 1

  return (
    <div className="relative size-32 shrink-0">
      <svg
        viewBox="0 0 120 120"
        className="size-full"
        role="img"
        aria-label={`${track.done} of ${track.target} ${label}`}
      >
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="10" />
        {fill > 0 ? <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={track.status === 'met' ? 'var(--color-ok)' : 'var(--color-accent)'}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${fill * C} ${C}`}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 400ms ease' }}
        /> : null}
        {showPace ? (
          <line
            x1={60 + (R - 9) * Math.cos(angle)}
            y1={60 + (R - 9) * Math.sin(angle)}
            x2={60 + (R + 9) * Math.cos(angle)}
            y2={60 + (R + 9) * Math.sin(angle)}
            stroke="var(--color-text)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-semibold leading-none tracking-tight tnum">{track.done}</p>
          <p className="mt-1 text-[11px] text-[var(--color-faint)] tnum">of {track.target}</p>
        </div>
      </div>
    </div>
  )
}

function Status({ track }: { track: GoalTrack }) {
  if (track.status === 'met') {
    return (
      <p className="flex items-center gap-1.5 font-medium text-[var(--color-ok)]">
        <Check className="size-3.5 shrink-0" /> Goal met{track.done > track.target ? ` · ${track.done - track.target} over` : ''}
      </p>
    )
  }
  if (track.status === 'on-track') {
    const ahead = track.done - track.expected
    return (
      <p className="flex items-center gap-1.5 font-medium text-[var(--color-ok)]">
        <TrendingUp className="size-3.5 shrink-0" /> On pace{ahead > 0 ? ` · ${ahead} ahead` : ''}
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1.5 font-medium text-[var(--color-warn)]">
      <CircleAlert className="size-3.5 shrink-0" /> {track.expected - track.done} behind pace
    </p>
  )
}

/** What it takes from here: the most useful line on the card. */
function Need({ track, view }: { track: GoalTrack; view: View }) {
  const left = track.target - track.done
  if (left <= 0) return null
  if (view === 'today') {
    return <p className="text-[var(--color-muted)]"><Strong>{left}</Strong> more to send today</p>
  }
  if (!track.daysLeft) {
    return <p className="text-[var(--color-muted)]">No working days left · <Strong>{left}</Strong> short</p>
  }
  return (
    <p className="text-[var(--color-muted)]">
      <Strong>{track.perDayNeeded}</Strong> a day for the next <Strong>{track.daysLeft}</Strong> day{track.daysLeft === 1 ? '' : 's'} to make it
    </p>
  )
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-[var(--color-text)] tnum">{children}</span>
}

/** This week, a cell per day; ticked when a per-day goal was met. */
function WeekStrip({ days }: { days: GoalProgress['weekDays'] }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="This week by day">
      {days.map((day) => {
        const met = day.target !== null && day.done >= day.target
        const name = new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
        return (
          <li
            key={day.date}
            title={`${name}: ${day.future ? 'still ahead' : `${day.done}${day.target !== null ? ` of ${day.target}` : ''} sent`}`}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-md border py-1.5 text-[10px]',
              day.today ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]' : 'border-[var(--color-border)]',
              met ? 'bg-[var(--color-ok-soft)]' : day.done ? 'bg-[var(--color-accent-soft)]' : '',
              day.future && 'opacity-40',
            )}
          >
            <span className="text-[var(--color-faint)]">{name.slice(0, 2)}</span>
            <span className={cn('flex h-4 items-center text-xs font-medium tnum', met ? 'text-[var(--color-ok)]' : 'text-[var(--color-text)]')}>
              {met ? <Check className="size-3.5" aria-label={`${day.done}, met`} /> : day.future ? '·' : day.done}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function StreakLine({ streak }: { streak: GoalStreak }) {
  const unit = streak.unit === 'day' ? 'day' : streak.unit
  return (
    <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
      <Flame className={cn('size-3.5', streak.current ? 'text-[var(--color-warn)]' : 'text-[var(--color-faint)]')} />
      {streak.current
        ? <><Strong>{streak.current}</Strong>-{unit} streak</>
        : <>No streak yet</>}
      <span className="text-[var(--color-faint)]">· best {streak.best} {unit}{streak.best === 1 ? '' : 's'}</span>
    </p>
  )
}

/**
 * Finished weeks against the goal: a bar for what was sent, a tick for the
 * target, green when it was met.
 */
export function GoalHistory({ progress }: { progress: GoalProgress }) {
  const weeks = progress.recentWeeks
  const top = Math.max(1, ...weeks.map((week) => Math.max(week.done, week.target)))
  const hit = weeks.filter((week) => week.met).length
  return (
    <Card className="flex-1 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Last {weeks.length} weeks</h2>
        <p className="text-xs text-[var(--color-faint)]">
          goal hit <span className="font-medium text-[var(--color-text)] tnum">{hit} of {weeks.length}</span>
        </p>
      </div>
      <ul className="mt-3 flex h-20 items-end gap-1.5">
        {weeks.map((week) => (
          <li key={week.start} className="flex h-full flex-1 flex-col items-center gap-1">
            <div
              title={`Week of ${label(week.start)}: ${week.done} of ${week.target}${week.met ? ' · met' : ''}`}
              aria-label={`Week of ${label(week.start)}: ${week.done} of ${week.target}${week.met ? ', met' : ''}`}
              className="relative w-full flex-1 rounded-[4px] bg-[var(--color-surface-2)]"
            >
              {week.done ? (
                <div
                  className="absolute inset-x-0 bottom-0 rounded-[4px]"
                  style={{
                    height: `${(week.done / top) * 100}%`,
                    background: week.met ? 'var(--color-ok)' : 'var(--color-accent)',
                  }}
                />
              ) : null}
              <div
                aria-hidden
                className="absolute inset-x-0 h-0.5 bg-[var(--color-text)] opacity-50"
                style={{ bottom: `calc(${(week.target / top) * 100}% - 1px)` }}
              />
            </div>
            <span className="text-[10px] leading-none text-[var(--color-faint)] tnum">{week.done}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex justify-between text-[10px] text-[var(--color-faint)]">
        <span>{label(weeks[0].start)}</span>
        <span>{label(weeks[weeks.length - 1].start)}</span>
      </div>
    </Card>
  )
}

function GoalForm({ goal, onDone }: { goal: Goal | null; onDone: () => void }) {
  const router = useRouter()
  const [amount, setAmount] = useState(String(goal?.amount ?? 5))
  const [unit, setUnit] = useState<GoalUnit>(goal?.unit ?? 'day')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(method: 'PUT' | 'DELETE') {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/goal', {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'PUT' ? JSON.stringify({ amount: Number(amount), unit }) : undefined,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Could not save the goal.')
      router.refresh()
      onDone()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void send('PUT')
  }

  const field = 'h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-[var(--color-accent)]'

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col justify-center gap-3 px-5 pb-5">
      <p className="text-xs leading-relaxed text-[var(--color-muted)]">
        How many applications do you want to send? Only applications marked Applied or later count.
      </p>
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
        <label className="text-xs text-[var(--color-muted)]">
          Applications
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={cn(field, 'mt-1 tnum')}
          />
        </label>
        <label className="text-xs text-[var(--color-muted)]">
          Every
          <select value={unit} onChange={(event) => setUnit(event.target.value as GoalUnit)} className={cn(field, 'mt-1')}>
            <option value="day">working day (Mon–Fri)</option>
            <option value="week">week</option>
            <option value="month">month</option>
          </select>
        </label>
      </div>
      {error ? <p role="alert" className="text-xs text-[var(--color-bad)]">{error}</p> : null}
      <div className="mt-1 flex items-center gap-2">
        <button
          disabled={busy}
          className="flex h-9 items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 text-xs font-medium text-[var(--color-bg)] disabled:opacity-50"
        >
          {busy ? <Spinner /> : null}Save goal
        </button>
        {goal ? (
          <>
            <button type="button" onClick={onDone} disabled={busy} className="h-9 px-2 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void send('DELETE')}
              disabled={busy}
              className="ml-auto h-9 px-2 text-xs text-[var(--color-bad)] hover:underline"
            >
              Remove
            </button>
          </>
        ) : null}
      </div>
    </form>
  )
}

function label(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
