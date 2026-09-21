import { readFile, writeFile, rename } from 'fs/promises'
import { PATHS } from './paths'
import { STATUSES, type Status } from './statuses'

/**
 * data/applications.md is the only database in this repo and it is git-tracked,
 * so every write here is atomic (temp + rename) and byte-conservative: a row the
 * app did not touch comes back out exactly as it went in.
 *
 * Format: a GFM table, one physical line per row, newest first (highest # at the
 * TOP). Notes are long prose and must never contain a literal '|'.
 */

export { STATUSES, RESPONDED_STATUSES, SENT_STATUSES, type Status } from './statuses'

export interface TrackerRow {
  id: number
  date: string
  company: string
  role: string
  score: string
  status: string
  pdf: string
  report: string
  notes: string
}

interface ParsedTracker {
  /** Everything before the header row, kept verbatim. */
  preamble: string[]
  header: string
  separator: string
  rows: TrackerRow[]
  /** Original physical row lines, updated only for rows explicitly changed. */
  rawRows: string[]
  /** Trailing newline presence, so serialize round-trips exactly. */
  trailingNewline: boolean
}

const HEADER_RE = /^\|\s*#\s*\|/

function splitRow(line: string): string[] {
  // '| a | b |' -> ['', ' a ', ' b ', ''] -> ['a', 'b']
  return line.split('|').slice(1, -1).map((c) => c.trim())
}

export function parseTracker(text: string): ParsedTracker {
  const trailingNewline = text.endsWith('\n')
  const lines = text.split('\n')
  if (trailingNewline) lines.pop()

  const headerIdx = lines.findIndex((l) => HEADER_RE.test(l))
  if (headerIdx === -1) throw new Error('applications.md: no header row found')

  const preamble = lines.slice(0, headerIdx)
  const header = lines[headerIdx]
  const separator = lines[headerIdx + 1] ?? ''
  const rows: TrackerRow[] = []
  const rawRows: string[] = []

  for (const line of lines.slice(headerIdx + 2)) {
    if (!line.trim()) continue
    const c = splitRow(line)
    if (c.length !== 9) {
      throw new Error(`applications.md: expected 9 columns, got ${c.length} in: ${line.slice(0, 80)}`)
    }
    rows.push({
      id: Number(c[0]),
      date: c[1],
      company: c[2],
      role: c[3],
      score: c[4],
      status: c[5],
      pdf: c[6],
      report: c[7],
      notes: c[8],
    })
    rawRows.push(line)
  }

  return { preamble, header, separator, rows, rawRows, trailingNewline }
}

export function serializeTracker(t: ParsedTracker): string {
  const body = t.rows.map((r, index) => t.rawRows[index] ?? rowLine(r))
  const lines = [...t.preamble, t.header, t.separator, ...body]
  return lines.join('\n') + (t.trailingNewline ? '\n' : '')
}

export async function readTracker(path = PATHS.tracker): Promise<ParsedTracker> {
  return parseTracker(await readFile(path, 'utf-8'))
}

export async function readRows(): Promise<TrackerRow[]> {
  return (await readTracker()).rows
}

/** A '|' in any cell would split the row and silently corrupt the table. */
function assertNoPipes(row: TrackerRow) {
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.includes('|')) {
      throw new Error(`tracker: '|' is not allowed in the ${k} field; it would break the table`)
    }
  }
}

async function writeTrackerFile(t: ParsedTracker, path = PATHS.tracker) {
  const text = serializeTracker(t)
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, text, 'utf-8')
  await rename(tmp, path)
}

/** Patch one row in place. Every other line comes back byte-identical. */
export async function updateRow(id: number, patch: Partial<Omit<TrackerRow, 'id'>>): Promise<TrackerRow> {
  const t = await readTracker()
  const idx = t.rows.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`tracker: no row with # ${id}`)

  const next = { ...t.rows[idx], ...patch }
  assertNoPipes(next)
  // A handful of legacy rows carry a status from before the set was fixed
  // (row 43 is 'Tailored'). Keeping one is fine; introducing a new one is not.
  if (patch.status && patch.status !== t.rows[idx].status && !STATUSES.includes(patch.status as Status)) {
    throw new Error(`tracker: '${patch.status}' is not a canonical status`)
  }
  t.rows[idx] = next
  t.rawRows[idx] = rowLine(next)
  await writeTrackerFile(t)
  return next
}

/** Remove one row while preserving every untouched line byte-for-byte. */
export async function deleteRow(id: number, path = PATHS.tracker): Promise<TrackerRow> {
  const t = await readTracker(path)
  const idx = t.rows.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`tracker: no row with # ${id}`)

  const [deleted] = t.rows.splice(idx, 1)
  t.rawRows.splice(idx, 1)
  await writeTrackerFile(t, path)
  return deleted
}

/** Highest # currently in the file. Always a fresh full scan, never a tail read. */
export async function nextId(): Promise<number> {
  const rows = await readRows()
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1
}

/** Insert a new row at the TOP, preserving highest-# -first ordering. */
export async function addRow(row: Omit<TrackerRow, 'id'> & { id?: number }): Promise<TrackerRow> {
  const t = await readTracker()
  const id = row.id ?? t.rows.reduce((max, r) => Math.max(max, r.id), 0) + 1

  const dup = t.rows.find(
    (r) => r.company.toLowerCase() === row.company.toLowerCase() && r.role.toLowerCase() === row.role.toLowerCase(),
  )
  if (dup) throw new Error(`tracker: # ${dup.id} already covers ${row.company} — ${row.role}`)

  const full: TrackerRow = { ...row, id }
  assertNoPipes(full)
  t.rows.unshift(full)
  t.rawRows.unshift(rowLine(full))
  await writeTrackerFile(t)
  return full
}

function rowLine(r: TrackerRow): string {
  return `| ${r.id} | ${r.date} | ${r.company} | ${r.role} | ${r.score} | ${r.status} | ${r.pdf} | ${r.report} | ${r.notes} |`
}
