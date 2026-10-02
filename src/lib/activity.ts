import type { TrackerRow } from './tracker'
import { SENT_STATUSES } from './statuses'

/**
 * Application activity, day by day. Only rows that were actually sent count:
 * a SKIP, a Discarded posting, or a CV still being prepared is not an
 * application. The tracker records one date per row (when it was created), so
 * that is the day a sent application counts on.
 *
 * Every day in a range is listed, zeros included, so a quiet stretch shows up
 * as a gap instead of being compressed away.
 */

export type Period = 'week' | 'month'

export interface ActivityDay {
  date: string
  applied: number
  future: boolean
  today: boolean
}

export interface PeriodActivity {
  period: Period
  start: string
  end: string
  days: ActivityDay[]
  applied: number
  /** Days elapsed in the period, today included. */
  elapsedDays: number
  /** Elapsed days with at least one application. */
  activeDays: number
  /** The previous period over the same number of days, for a fair comparison. */
  previousSoFar: number
  /** The whole previous period. */
  previousTotal: number
}

export function isPeriod(value: unknown): value is Period {
  return value === 'week' || value === 'month'
}

/** YYYY-MM-DD in the machine's own timezone, which is the tracker's. */
export function localIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Sent applications per day. */
export function appliedByDay(rows: TrackerRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.date || !SENT_STATUSES.includes(row.status)) continue
    counts.set(row.date, (counts.get(row.date) ?? 0) + 1)
  }
  return counts
}

export function periodActivity(rows: TrackerRow[], period: Period, now = new Date()): PeriodActivity {
  const counts = appliedByDay(rows)
  const today = localIso(now)
  const [start, end] = bounds(period, today, 0)
  const [prevStart, prevEnd] = bounds(period, today, -1)

  const days = range(start, end).map((date) => ({
    date,
    applied: date > today ? 0 : counts.get(date) ?? 0,
    future: date > today,
    today: date === today,
  }))
  const elapsed = days.filter((day) => !day.future)
  const previous = range(prevStart, prevEnd)
  const sum = (dates: string[]) => dates.reduce((total, date) => total + (counts.get(date) ?? 0), 0)

  return {
    period,
    start,
    end,
    days,
    applied: elapsed.reduce((total, day) => total + day.applied, 0),
    elapsedDays: elapsed.length,
    activeDays: elapsed.filter((day) => day.applied > 0).length,
    // A month shorter than the elapsed count (31 Mar vs 28 Feb) just compares the whole month.
    previousSoFar: sum(previous.slice(0, elapsed.length)),
    previousTotal: sum(previous),
  }
}

/**
 * The last `weeks` weeks as Monday-first columns, ending with the current
 * week. Days after today are marked future so they render as blanks.
 */
export function activityGrid(rows: TrackerRow[], weeks: number, now = new Date()): ActivityDay[][] {
  const counts = appliedByDay(rows)
  const today = localIso(now)
  const first = addDays(mondayOf(today), -7 * (weeks - 1))
  return Array.from({ length: weeks }, (_, week) =>
    range(addDays(first, week * 7), addDays(first, week * 7 + 6)).map((date) => ({
      date,
      applied: date > today ? 0 : counts.get(date) ?? 0,
      future: date > today,
      today: date === today,
    })),
  )
}

/** Most recent day with a sent application, ignoring future-dated rows. */
export function lastAppliedDate(rows: TrackerRow[], now = new Date()): string | null {
  const today = localIso(now)
  let last: string | null = null
  for (const date of appliedByDay(rows).keys()) {
    if (date <= today && (!last || date > last)) last = date
  }
  return last
}

/** Whole days between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

function bounds(period: Period, today: string, offset: number): [string, string] {
  if (period === 'week') {
    const start = addDays(mondayOf(today), offset * 7)
    return [start, addDays(start, 6)]
  }
  const [y, m] = today.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + offset, 1))
  const last = new Date(Date.UTC(y, m + offset, 0))
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)]
}

export function mondayOf(iso: string): string {
  const dow = (new Date(utc(iso)).getUTCDay() + 6) % 7 // Monday = 0
  return addDays(iso, -dow)
}

export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

function range(start: string, end: string): string[] {
  const out: string[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) out.push(date)
  return out
}

function utc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}
