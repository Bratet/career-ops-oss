import { readFile, rename, unlink, writeFile } from 'fs/promises'
import type { TrackerRow } from './tracker'
import { PATHS } from './paths'
import { addDays, appliedByDay, localIso, mondayOf, periodActivity, type PeriodActivity } from './activity'

/**
 * An application goal and how the sent applications measure up to it.
 *
 * The goal is set in one unit (per working day, per week or per month) and
 * converted into a target for the current week and month, plus a pace: how
 * many should be sent by today to stay on schedule. A per-day goal counts
 * Monday to Friday only.
 */

export const GOAL_UNITS = ['day', 'week', 'month'] as const
export type GoalUnit = typeof GOAL_UNITS[number]

export interface Goal {
  amount: number
  unit: GoalUnit
}

export const GOAL_MAX = 100

export type GoalStatus = 'met' | 'on-track' | 'behind'

export interface GoalTrack {
  done: number
  target: number
  /** Sent by the end of today to stay on pace. */
  expected: number
  status: GoalStatus
  /** Days left that count toward the goal, today included. */
  daysLeft: number
  /** Needed on each of those days to still hit the target; 0 once met. */
  perDayNeeded: number
  /** Where the period ends if the pace so far holds. */
  projected: number
}

export interface GoalStreak {
  /** Consecutive periods met, counting the current one only once it is met. */
  current: number
  best: number
  unit: GoalUnit
}

export interface WeekResult {
  start: string
  done: number
  target: number
  met: boolean
}

export interface GoalDay {
  date: string
  done: number
  /** The day's own target: a per-day goal on a working day, otherwise null. */
  target: number | null
  future: boolean
  today: boolean
}

export interface GoalProgress {
  goal: Goal
  /** The current week, Monday to Sunday. */
  weekDays: GoalDay[]
  /** Today against a per-day goal; null for other goals or on a weekend. */
  today: GoalTrack | null
  week: GoalTrack
  month: GoalTrack
  /** Completed weeks, oldest first. */
  recentWeeks: WeekResult[]
  streak: GoalStreak
  /** The per-day line for the daily chart; only a per-day goal has one. */
  daily: number | null
}

export function parseGoal(value: unknown): Goal | null {
  if (!value || typeof value !== 'object') return null
  const { amount, unit } = value as Record<string, unknown>
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > GOAL_MAX) return null
  if (typeof unit !== 'string' || !(GOAL_UNITS as readonly string[]).includes(unit)) return null
  return { amount, unit: unit as GoalUnit }
}

export async function readGoal(): Promise<Goal | null> {
  try {
    return parseGoal(JSON.parse(await readFile(PATHS.goal, 'utf-8')))
  } catch {
    return null
  }
}

export async function writeGoal(goal: Goal): Promise<void> {
  const temp = `${PATHS.goal}.tmp-${process.pid}`
  await writeFile(temp, `${JSON.stringify(goal, null, 2)}\n`, 'utf-8')
  await rename(temp, PATHS.goal)
}

export async function clearGoal(): Promise<void> {
  await unlink(PATHS.goal).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
}

export function goalProgress(goal: Goal, rows: TrackerRow[], now = new Date(), weeksBack = 8): GoalProgress {
  const counts = appliedByDay(rows)
  const today = localIso(now)
  const week = periodActivity(rows, 'week', now)
  const month = periodActivity(rows, 'month', now)
  const todayDone = counts.get(today) ?? 0
  return {
    goal,
    today: goal.unit === 'day' && isWorkingDay(today)
      ? finish({ done: todayDone, target: goal.amount, expected: goal.amount, daysLeft: 1, projected: todayDone })
      : null,
    weekDays: week.days.map((day) => ({
      date: day.date,
      done: day.applied,
      target: goal.unit === 'day' && isWorkingDay(day.date) ? goal.amount : null,
      future: day.future,
      today: day.today,
    })),
    week: track(goal, week),
    month: track(goal, month),
    recentWeeks: recentWeeks(goal, counts, today, weeksBack),
    streak: streak(goal, counts, today),
    daily: goal.unit === 'day' ? goal.amount : null,
  }
}

/** The goal expressed over a run of days, given the days as YYYY-MM-DD. */
export function targetFor(goal: Goal, dates: string[]): number {
  if (goal.unit === 'day') return goal.amount * dates.filter(isWorkingDay).length
  const perDay = goal.unit === 'week' ? goal.amount / 7 : goal.amount / daysInMonth(dates[0])
  return Math.round(perDay * dates.length)
}

function track(goal: Goal, activity: PeriodActivity): GoalTrack {
  const all = activity.days.map((day) => day.date)
  const elapsed = activity.days.filter((day) => !day.future).map((day) => day.date)
  const today = activity.days.find((day) => day.today)?.date ?? all[0]
  // The goal's own period is exact; the other is converted and never below 1.
  const own = (goal.unit === 'week' && activity.period === 'week') || (goal.unit === 'month' && activity.period === 'month')
  const target = own ? goal.amount : Math.max(1, targetFor(goal, all))
  const done = activity.applied
  const part = share(goal, elapsed, all)
  const remaining = all.filter((date) => date >= today && (goal.unit !== 'day' || isWorkingDay(date)))
  return finish({
    done,
    target,
    expected: Math.min(target, Math.round(target * part)),
    daysLeft: remaining.length,
    projected: part > 0 ? Math.round(done / part) : done,
  })
}

function finish(track: Omit<GoalTrack, 'status' | 'perDayNeeded'>): GoalTrack {
  const left = Math.max(0, track.target - track.done)
  return {
    ...track,
    status: track.done >= track.target ? 'met' : track.done >= track.expected ? 'on-track' : 'behind',
    perDayNeeded: left && track.daysLeft ? Math.ceil(left / track.daysLeft) : 0,
  }
}

/** How much of the period's target should be done after `elapsed` days. */
function share(goal: Goal, elapsed: string[], all: string[]): number {
  if (goal.unit === 'day') {
    const working = all.filter(isWorkingDay).length
    return working ? elapsed.filter(isWorkingDay).length / working : 1
  }
  return elapsed.length / all.length
}

function recentWeeks(goal: Goal, counts: Map<string, number>, today: string, count: number): WeekResult[] {
  const thisMonday = mondayOf(today)
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(thisMonday, -7 * (count - i))
    const dates = range(start, addDays(start, 6))
    const done = sum(counts, dates)
    const target = goal.unit === 'week' ? goal.amount : Math.max(1, targetFor(goal, dates))
    return { start, done, target, met: done >= target }
  })
}

/**
 * Runs of met periods in the goal's own unit (working days, weeks or months),
 * from the first application to today. The current period joins the run only
 * once it is met, so an unfinished day never breaks a streak.
 */
function streak(goal: Goal, counts: Map<string, number>, today: string): GoalStreak {
  const dates = [...counts.keys()].filter((date) => date <= today).sort()
  if (!dates.length) return { current: 0, best: 0, unit: goal.unit }

  const periods = periodsSince(goal.unit, dates[0], today)
  const met = periods.map((dates) => sum(counts, dates) >= goal.amount)
  let best = 0
  let run = 0
  for (const hit of met) {
    run = hit ? run + 1 : 0
    best = Math.max(best, run)
  }
  let current = 0
  for (let i = met.length - 1 - (met[met.length - 1] ? 0 : 1); i >= 0 && met[i]; i--) current++
  return { current, best, unit: goal.unit }
}

/** Each period of the unit from the one containing `from` to the current one, as date lists. */
function periodsSince(unit: GoalUnit, from: string, today: string): string[][] {
  if (unit === 'day') return range(from, today).filter(isWorkingDay).map((date) => [date])
  const out: string[][] = []
  if (unit === 'week') {
    for (let start = mondayOf(from); start <= today; start = addDays(start, 7)) out.push(range(start, addDays(start, 6)))
    return out
  }
  for (let start = `${from.slice(0, 7)}-01`; start <= today; start = addDays(start, daysInMonth(start))) {
    out.push(range(start, addDays(start, daysInMonth(start) - 1)))
  }
  return out
}

function range(start: string, end: string): string[] {
  const out: string[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) out.push(date)
  return out
}

function sum(counts: Map<string, number>, dates: string[]): number {
  return dates.reduce((total, date) => total + (counts.get(date) ?? 0), 0)
}

function isWorkingDay(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return day !== 0 && day !== 6
}

function daysInMonth(iso: string): number {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
