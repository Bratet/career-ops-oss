import { readdir, stat, readFile } from 'fs/promises'
import { join } from 'path'
import { APP_FILES, PATHS } from './paths'
import { readIndex } from './appIndex'
import { readRows, type TrackerRow } from './tracker'
import { RESPONDED_STATUSES, SENT_STATUSES } from './statuses'

/**
 * Joins the tracker to what is actually on disk.
 *
 * Every file in an application folder is optional. Of the 40 historical folders
 * exactly one has the full set, so the inventory is derived by looking, never by
 * assuming the documented layout holds.
 */

export interface FolderDoc {
  key: keyof typeof APP_FILES | 'other'
  name: string
  size: number
}

export interface AppFolder {
  folder: string
  slug: string
  date: string
  docs: FolderDoc[]
  has: Record<keyof typeof APP_FILES, boolean>
}

export interface Application {
  row: TrackerRow | null
  folder: AppFolder | null
  /** URL key for /applications/[key]: the folder name, else "row-{id}". */
  key: string
  workspace?: {
    fit: string | null
    pending: boolean
    resume: 'draft' | 'finalized' | 'missing'
  }
}

const CANONICAL = Object.entries(APP_FILES) as [keyof typeof APP_FILES, string][]

/** A folder that predates the naming convention still gets classified by shape. */
function classify(name: string): keyof typeof APP_FILES | 'other' {
  for (const [key, canonical] of CANONICAL) if (name === canonical) return key
  const lower = name.toLowerCase()
  if (lower === 'jd.md') return 'jd'
  if (lower.startsWith('cover-letter') && lower.endsWith('.json')) return 'letterInput'
  if (lower.startsWith('cover-letter')) return 'letterPdf'
  if (lower.endsWith('tailoring-notes.md')) return 'notes'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  if (lower.endsWith('.pdf')) return 'pdf'
  return 'other'
}

export async function listFolders(): Promise<AppFolder[]> {
  let entries
  try {
    entries = await readdir(PATHS.applications, { withFileTypes: true })
  } catch {
    return []
  }

  const folders: AppFolder[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const files = (await readdir(join(PATHS.applications, e.name), { withFileTypes: true })).filter((f) => f.isFile())

    const docs: FolderDoc[] = []
    for (const f of files) {
      const s = await stat(join(PATHS.applications, e.name, f.name))
      docs.push({ key: classify(f.name), name: f.name, size: s.size })
    }

    const has = Object.fromEntries(CANONICAL.map(([k]) => [k, docs.some((d) => d.key === k)])) as AppFolder['has']
    const m = e.name.match(/^(.*)-(\d{4}-\d{2}-\d{2})$/)

    folders.push({
      folder: e.name,
      slug: m?.[1] ?? e.name,
      date: m?.[2] ?? '',
      docs: docs.sort((a, b) => a.name.localeCompare(b.name)),
      has,
    })
  }

  return folders.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.folder.localeCompare(b.folder))
}

export async function listApplications(): Promise<Application[]> {
  const [rows, folders, index] = await Promise.all([readRows(), listFolders(), readIndex()])
  const byName = new Map(folders.map((f) => [f.folder, f]))
  const linked = new Set<string>()

  const apps: Application[] = rows.map((row) => {
    const folderName = index[String(row.id)]
    const folder = folderName ? byName.get(folderName) ?? null : null
    if (folder) linked.add(folder.folder)
    return { row, folder, key: folder?.folder ?? `row-${row.id}` }
  })

  // Folders with no tracker row still deserve to be visible rather than silently dropped.
  for (const f of folders) {
    if (!linked.has(f.folder)) apps.push({ row: null, folder: f, key: f.folder })
  }

  await Promise.all(apps.map(async (app) => {
    try {
      const workspace = JSON.parse(await readFile(join(PATHS.workspaces, `${app.key}.json`), 'utf-8')) as {
        draftYaml?: string; pendingProposal?: unknown; fit?: { report?: { verdict?: string } | null }
      }
      app.workspace = {
        fit: workspace.fit?.report?.verdict ?? null,
        pending: !!workspace.pendingProposal,
        resume: app.folder?.has.pdf ? 'finalized' : workspace.draftYaml ? 'draft' : 'missing',
      }
    } catch {
      app.workspace = { fit: null, pending: false, resume: app.folder?.has.pdf ? 'finalized' : app.folder?.has.yaml ? 'draft' : 'missing' }
    }
  }))

  return apps.sort((a, b) => {
    const da = a.row?.date ?? a.folder?.date ?? ''
    const db = b.row?.date ?? b.folder?.date ?? ''
    return db.localeCompare(da) || (b.row?.id ?? 0) - (a.row?.id ?? 0)
  })
}

export async function getApplication(key: string): Promise<Application | null> {
  return (await listApplications()).find((a) => a.key === key) ?? null
}

/** Read a text doc from an application folder, or null when it isn't there. */
export async function readDoc(folder: string, name: string): Promise<string | null> {
  try {
    return await readFile(join(PATHS.applications, folder, name), 'utf-8')
  } catch {
    return null
  }
}

export interface Stats {
  total: number
  sent: number
  responded: number
  responseRate: number | null
  avgScore: number | null
  byStatus: { status: string; count: number }[]
  byDay: { date: string; count: number }[]
  scoreBuckets: { bucket: string; count: number }[]
  thisWeek: number
  lastWeek: number
  perDayRecent: number
}

function weekKey(offset: number, today: Date): [string, string] {
  const end = new Date(today)
  end.setDate(end.getDate() - offset * 7)
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
}

export async function computeStats(today = new Date()): Promise<Stats> {
  const rows = await readRows()

  const scores = rows
    .map((r) => Number.parseFloat(r.score))
    .filter((n) => Number.isFinite(n))

  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)

  const days = new Map<string, number>()
  for (const r of rows) days.set(r.date, (days.get(r.date) ?? 0) + 1)

  const buckets = ['<3.0', '3.0-3.4', '3.5-3.9', '4.0-4.4', '4.5+']
  const bucketOf = (n: number) => (n < 3 ? 0 : n < 3.5 ? 1 : n < 4 ? 2 : n < 4.5 ? 3 : 4)
  const bucketCounts = new Array(buckets.length).fill(0)
  for (const s of scores) bucketCounts[bucketOf(s)]++

  const [tws, twe] = weekKey(0, today)
  const [lws, lwe] = weekKey(1, today)
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b

  const sent = rows.filter((r) => SENT_STATUSES.includes(r.status)).length
  const responded = rows.filter((r) => RESPONDED_STATUSES.includes(r.status)).length

  const sortedDays = [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
  const span =
    sortedDays.length > 1
      ? (Date.parse(sortedDays[sortedDays.length - 1][0]) - Date.parse(sortedDays[0][0])) / 86_400_000 + 1
      : 1

  return {
    total: rows.length,
    sent,
    responded,
    responseRate: sent > 0 ? responded / sent : null,
    avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    byStatus: [...counts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    byDay: sortedDays.map(([date, count]) => ({ date, count })),
    scoreBuckets: buckets.map((bucket, i) => ({ bucket, count: bucketCounts[i] })),
    thisWeek: rows.filter((r) => inRange(r.date, tws, twe)).length,
    lastWeek: rows.filter((r) => inRange(r.date, lws, lwe)).length,
    perDayRecent: rows.length / span,
  }
}
