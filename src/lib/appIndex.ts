import { readFile, writeFile, rename } from 'fs/promises'
import { PATHS, slugify } from './paths'
import type { TrackerRow } from './tracker'

/**
 * The tracker stores a display name ("Xccelerated (part of Xebia)"); the folder
 * is "xccelerated-2026-08-06". Nothing links them.
 *
 * Rather than add a column to applications.md — whose format the tailor-resume
 * skill and the memory rules both depend on — the link lives in a sidecar.
 * Applications created in the app write the folder and the link together, so the
 * guessing below only ever has to cover the 40 legacy folders.
 */

export type AppIndex = Record<string, string> // tracker id -> folder name

export async function readIndex(): Promise<AppIndex> {
  try {
    return JSON.parse(await readFile(PATHS.appIndex, 'utf-8'))
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

export async function writeIndex(index: AppIndex): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => Number(b) - Number(a)))
  const tmp = `${PATHS.appIndex}.tmp-${process.pid}`
  await writeFile(tmp, JSON.stringify(sorted, null, 2) + '\n', 'utf-8')
  await rename(tmp, PATHS.appIndex)
}

export async function linkFolder(id: number, folder: string): Promise<AppIndex> {
  const index = await readIndex()
  index[String(id)] = folder
  await writeIndex(index)
  return index
}

export async function unlinkFolder(id: number): Promise<AppIndex> {
  const index = await readIndex()
  delete index[String(id)]
  await writeIndex(index)
  return index
}

export interface Match {
  id: number
  folder: string
  confidence: 'exact' | 'date+prefix' | 'date-only'
}

/**
 * Best-effort seeding. Only returns matches it can justify:
 *   exact       slug(company) === folder slug AND dates agree
 *   date+prefix one folder that day whose slug shares a prefix with the company
 *   date-only   exactly one unclaimed folder on that date, and one row on it
 * Anything ambiguous is left out, to be linked by hand in the UI.
 */
export function reconcile(rows: TrackerRow[], folders: string[]): Match[] {
  const parsed = folders.map((f) => {
    const m = f.match(/^(.*)-(\d{4}-\d{2}-\d{2})$/)
    return m ? { folder: f, slug: m[1], date: m[2] } : { folder: f, slug: f, date: '' }
  })

  const claimed = new Set<string>()
  const matches: Match[] = []

  const take = (id: number, folder: string, confidence: Match['confidence']) => {
    claimed.add(folder)
    matches.push({ id, folder, confidence })
  }

  const free = () => parsed.filter((p) => !claimed.has(p.folder))

  for (const row of rows) {
    const want = slugify(row.company)
    const hit = free().find((p) => p.slug === want && p.date === row.date)
    if (hit) take(row.id, hit.folder, 'exact')
  }

  for (const row of rows) {
    if (matches.some((m) => m.id === row.id)) continue
    const want = slugify(row.company)
    const sameDay = free().filter((p) => p.date === row.date)
    const prefix = sameDay.filter((p) => p.slug.startsWith(want) || want.startsWith(p.slug))
    if (prefix.length === 1) take(row.id, prefix[0].folder, 'date+prefix')
  }

  for (const row of rows) {
    if (matches.some((m) => m.id === row.id)) continue
    const sameDay = free().filter((p) => p.date === row.date)
    const rowsThatDay = rows.filter((r) => r.date === row.date && !matches.some((m) => m.id === r.id))
    if (sameDay.length === 1 && rowsThatDay.length === 1) take(row.id, sameDay[0].folder, 'date-only')
  }

  return matches
}
