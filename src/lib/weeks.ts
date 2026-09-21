import type { TrackerRow } from './tracker'

/** Monday-anchored week key for a YYYY-MM-DD date. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

export interface WeekBucket {
  week: string
  label: string
  count: number
  partial: boolean
}

/**
 * Applications bucketed by week, with empty weeks filled in so the gaps are
 * visible rather than silently compressed away.
 */
export function byWeek(rows: TrackerRow[], today = new Date()): WeekBucket[] {
  if (rows.length === 0) return []

  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.date) continue
    const k = weekStart(r.date)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  const keys = [...counts.keys()].sort()
  const current = weekStart(today.toISOString().slice(0, 10))
  const out: WeekBucket[] = []

  const cursor = new Date(`${keys[0]}T00:00:00Z`)
  const end = new Date(`${current}T00:00:00Z`)

  while (cursor <= end) {
    const k = cursor.toISOString().slice(0, 10)
    out.push({
      week: k,
      label: new Date(`${k}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', timeZone: 'UTC',
      }),
      count: counts.get(k) ?? 0,
      partial: k === current,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }

  return out
}

/** Pipeline order for the funnel. Statuses outside it keep their own row at the end. */
export const STAGE_ORDER = ['Evaluated', 'Tailored', 'Applied', 'Responded', 'Interview', 'Offer']

export function funnelData(byStatus: { status: string; count: number }[]) {
  const known = STAGE_ORDER.map((status) => ({
    status,
    count: byStatus.find((s) => s.status === status)?.count ?? 0,
  })).filter((s) => s.count > 0)

  const rest = byStatus
    .filter((s) => !STAGE_ORDER.includes(s.status))
    .sort((a, b) => b.count - a.count)

  return [...known, ...rest]
}
