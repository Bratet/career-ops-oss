import assert from 'node:assert/strict'
import { activityGrid, daysBetween, lastAppliedDate, localIso, periodActivity } from '../src/lib/activity'
import type { TrackerRow } from '../src/lib/tracker'

let id = 0
const row = (date: string, status = 'Applied'): TrackerRow => ({ id: ++id, date, company: 'Example', role: 'Engineer', score: '', status, pdf: '', report: '', notes: '' })
// Local noon, so the test holds in any machine timezone.
const at = (iso: string) => new Date(`${iso}T12:00:00`)

const thursday = at('2026-10-01')
assert.equal(localIso(thursday), '2026-10-01')

// Only sent applications count; skips, discards and drafts do not.
const mixed = [
  row('2026-09-29'), row('2026-09-29', 'Interview'), row('2026-09-30', 'SKIP'),
  row('2026-09-30', 'Discarded'), row('2026-10-01', 'Preparing'), row('2026-10-01', 'Evaluated'), row(''),
]
const week = periodActivity(mixed, 'week', thursday)
assert.equal(week.start, '2026-09-28')
assert.equal(week.end, '2026-10-04')
assert.equal(week.applied, 2)

// Every day of the week is listed, zeros and days still ahead included.
assert.deepEqual(week.days.map((d) => d.date), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
assert.deepEqual(week.days.map((d) => d.future), [false, false, false, false, true, true, true])
assert.deepEqual(week.days.map((d) => d.today), [false, false, false, true, false, false, false])
assert.equal(week.elapsedDays, 4)
assert.equal(week.activeDays, 1)

// Last week is compared over the same days elapsed, not the whole week.
const history = [row('2026-09-22'), row('2026-09-23'), row('2026-09-26'), row('2026-09-27'), row('2026-09-29')]
const fair = periodActivity(history, 'week', thursday)
assert.equal(fair.previousSoFar, 2)
assert.equal(fair.previousTotal, 4)

// Months use calendar bounds and handle a shorter previous month.
const october = periodActivity([row('2026-09-01'), row('2026-09-30'), row('2026-10-01')], 'month', thursday)
assert.equal(october.start, '2026-10-01')
assert.equal(october.end, '2026-10-31')
assert.equal(october.days.length, 31)
assert.equal(october.applied, 1)
assert.equal(october.previousSoFar, 1)
assert.equal(october.previousTotal, 2)
const march = periodActivity([row('2027-02-01'), row('2027-02-28')], 'month', at('2027-03-31'))
assert.equal(march.previousSoFar, 2)
assert.equal(periodActivity([], 'month', at('2027-01-15')).start, '2027-01-01')
assert.equal(periodActivity([row('2026-12-31')], 'month', at('2027-01-15')).previousTotal, 1)

// A future-dated row never counts as done.
assert.equal(periodActivity([row('2026-10-03')], 'week', thursday).applied, 0)
assert.equal(lastAppliedDate([row('2026-09-20'), row('2026-10-03'), row('2026-09-25', 'SKIP')], thursday), '2026-09-20')
assert.equal(lastAppliedDate([row('2026-09-25', 'Discarded')], thursday), null)
assert.equal(daysBetween('2026-09-20', '2026-10-01'), 11)

// The grid: Monday-first weeks ending with the current one, with no gaps.
const grid = activityGrid([row('2026-09-29'), row('2026-09-29'), row('2026-07-06')], 16, thursday)
assert.equal(grid.length, 16)
assert.ok(grid.every((w) => w.length === 7))
assert.equal(grid[0][0].date, '2026-06-15')
assert.equal(grid[15][0].date, '2026-09-28')
const flat = grid.flat()
assert.ok(flat.every((d, i) => i === 0 || daysBetween(flat[i - 1].date, d.date) === 1))
assert.equal(flat.find((d) => d.date === '2026-09-29')?.applied, 2)
assert.equal(flat.find((d) => d.date === '2026-07-06')?.applied, 1)
assert.equal(flat.filter((d) => d.future).length, 3)

console.log('Activity: sent-only counts, full weeks and months, fair comparisons, month lengths, future dates and the daily grid pass')
