import assert from 'node:assert/strict'
import { byWeek, weekStart } from '../src/lib/weeks'
import type { TrackerRow } from '../src/lib/tracker'

const today = new Date('2026-09-27T12:00:00Z')
const row = (date: string): TrackerRow => ({ id: 1, date, company: 'Example', role: 'Engineer', score: '', status: 'Preparing', pdf: '', report: '', notes: '' })

assert.equal(weekStart('2026-09-27'), '2026-09-21')
assert.equal(weekStart('2026-09-28'), '2026-09-28')
for (const rows of [[], [row('')], [row('2026-10-05')]]) {
  assert.deepEqual(byWeek(rows, today), [{ week: '2026-09-21', label: '21 Sept', count: 0, partial: true }])
}
const history = byWeek([row('2026-09-07'), row('2026-09-08')], today)
assert.deepEqual(history.map(({ week, count, partial }) => ({ week, count, partial })), [
  { week: '2026-09-07', count: 2, partial: false },
  { week: '2026-09-14', count: 0, partial: false },
  { week: '2026-09-21', count: 0, partial: true },
])
assert.equal(byWeek([row('2026-09-27')], today)[0].count, 1)
assert.equal(byWeek([], new Date('2026-09-28T00:00:00Z'))[0].week, '2026-09-28')
assert.deepEqual(byWeek([], new Date('2027-01-01T12:00:00Z')).map(({ week, count, partial }) => ({ week, count, partial })), [
  { week: '2026-12-28', count: 0, partial: true },
])
console.log('Weekly chart: current week included for empty, undated, future-only and historical data; Monday and year boundaries pass')
