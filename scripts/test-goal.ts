import assert from 'node:assert/strict'
import { goalProgress, parseGoal, targetFor } from '../src/lib/goal'
import type { TrackerRow } from '../src/lib/tracker'

let id = 0
const row = (date: string, status = 'Applied'): TrackerRow => ({ id: ++id, date, company: 'Example', role: 'Engineer', score: '', status, pdf: '', report: '', notes: '' })
const at = (iso: string) => new Date(`${iso}T12:00:00`)
const many = (date: string, n: number, status = 'Applied') => Array.from({ length: n }, () => row(date, status))

// Validation: whole numbers from 1 to 100, in a known unit.
assert.deepEqual(parseGoal({ amount: 5, unit: 'day' }), { amount: 5, unit: 'day' })
for (const bad of [null, {}, { amount: 0, unit: 'day' }, { amount: 101, unit: 'week' }, { amount: 2.5, unit: 'week' }, { amount: '5', unit: 'day' }, { amount: 5, unit: 'year' }]) {
  assert.equal(parseGoal(bad), null)
}

// Per working day: weekends carry no target.
const week = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
assert.equal(targetFor({ amount: 5, unit: 'day' }, week), 25)
assert.equal(targetFor({ amount: 5, unit: 'week' }, week), 5)

// Thursday 1 Oct 2026, 5 per working day: 4 working days elapsed means 20 by today.
const thursday = at('2026-10-01')
const daily = goalProgress({ amount: 5, unit: 'day' }, [...many('2026-09-28', 6), ...many('2026-09-30', 3), ...many('2026-09-29', 4, 'SKIP')], thursday)
const pick = ({ done, target, expected, status }: { done: number; target: number; expected: number; status: string }) => ({ done, target, expected, status })
assert.deepEqual(pick(daily.week), { done: 9, target: 25, expected: 20, status: 'behind' })
// Thursday and Friday are left: 16 to go means 8 a day; 9 in 4 of 5 working days projects to 11.
assert.equal(daily.week.daysLeft, 2)
assert.equal(daily.week.perDayNeeded, 8)
assert.equal(daily.week.projected, 11)
assert.deepEqual(pick(daily.today!), { done: 0, target: 5, expected: 5, status: 'behind' })
assert.equal(daily.today!.perDayNeeded, 5)
assert.equal(daily.month.target, 110) // 22 working days in October 2026
assert.equal(daily.month.expected, 5)
assert.equal(daily.month.status, 'behind')
assert.equal(daily.daily, 5)
assert.deepEqual(daily.weekDays.map((d) => [d.done, d.target, d.future]), [
  [6, 5, false], [0, 5, false], [3, 5, false], [0, 5, false], [0, 5, true], [0, null, true], [0, null, true],
])

// Per week: pace is spread over all seven days; the goal's own period is exact.
const weekly = goalProgress({ amount: 10, unit: 'week' }, many('2026-09-28', 6), thursday)
assert.deepEqual(pick(weekly.week), { done: 6, target: 10, expected: 6, status: 'on-track' })
assert.equal(weekly.week.daysLeft, 4)
assert.equal(weekly.week.perDayNeeded, 1)
assert.equal(weekly.today, null)
assert.ok(weekly.weekDays.every((d) => d.target === null))
assert.equal(weekly.month.target, 44) // 10 a week over 31 days
assert.equal(weekly.daily, null)

// Met beats pace, and a weekend never makes a day goal look behind.
const sunday = goalProgress({ amount: 1, unit: 'day' }, many('2026-09-28', 5), at('2026-10-04'))
assert.equal(sunday.week.status, 'met')
assert.equal(sunday.week.perDayNeeded, 0)
assert.equal(sunday.today, null) // no target on a weekend
const missed = goalProgress({ amount: 1, unit: 'day' }, [], at('2026-10-04'))
assert.equal(missed.week.daysLeft, 0)
assert.equal(missed.week.perDayNeeded, 0)
const saturdayStart = goalProgress({ amount: 2, unit: 'day' }, [], at('2026-08-01'))
assert.equal(saturdayStart.month.expected, 0)
assert.equal(saturdayStart.month.status, 'on-track')

// Per month: the week target is derived and never below 1.
const monthly = goalProgress({ amount: 3, unit: 'month' }, [], thursday)
assert.equal(monthly.month.target, 3)
assert.equal(monthly.week.target, 1)

// Recent weeks: completed weeks only, oldest first, each judged on its own target.
const history = goalProgress({ amount: 3, unit: 'week' }, [...many('2026-09-21', 3), ...many('2026-09-14', 2), ...many('2026-09-28', 9)], thursday)
assert.equal(history.recentWeeks.length, 8)
assert.equal(history.recentWeeks[7].start, '2026-09-21')
assert.equal(history.recentWeeks[0].start, '2026-08-03')
assert.deepEqual(history.recentWeeks.slice(-2).map((w) => [w.done, w.met]), [[2, false], [3, true]])

// Streaks: working days for a day goal; today joins only once met, weekends never break it.
const dayRows = [...many('2026-09-24', 2), ...many('2026-09-25', 2), ...many('2026-09-28', 2), ...many('2026-09-29', 2), ...many('2026-09-30', 1)]
assert.deepEqual(goalProgress({ amount: 2, unit: 'day' }, dayRows, at('2026-09-30')).streak, { current: 4, best: 4, unit: 'day' })
assert.deepEqual(goalProgress({ amount: 2, unit: 'day' }, dayRows, at('2026-09-25')).streak, { current: 2, best: 2, unit: 'day' })
assert.equal(goalProgress({ amount: 2, unit: 'day' }, dayRows, at('2026-10-01')).streak.current, 0)

// Week streaks: an unfinished week neither counts nor breaks the run.
const weekRows = [...many('2026-09-08', 3), ...many('2026-09-15', 3), ...many('2026-09-22', 3), row('2026-09-29')]
assert.deepEqual(goalProgress({ amount: 3, unit: 'week' }, weekRows, thursday).streak, { current: 3, best: 3, unit: 'week' })
assert.deepEqual(goalProgress({ amount: 3, unit: 'week' }, [], thursday).streak, { current: 0, best: 0, unit: 'week' })

// Month streaks walk calendar months, including short ones.
const monthRows = [...many('2027-01-10', 2), ...many('2027-02-28', 2), ...many('2027-03-31', 2)]
assert.deepEqual(goalProgress({ amount: 2, unit: 'month' }, monthRows, at('2027-03-31')).streak, { current: 3, best: 3, unit: 'month' })

console.log('Goal: validation, working-day targets, pace, met, days left, per-day need, projection, derived targets, recent weeks and streaks pass')
