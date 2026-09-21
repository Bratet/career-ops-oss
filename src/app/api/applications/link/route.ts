import { NextResponse } from 'next/server'
import { readRows } from '@/lib/tracker'
import { listFolders } from '@/lib/applications'
import { readIndex, writeIndex, reconcile } from '@/lib/appIndex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Seed the tracker-row -> folder index by matching names and dates.
 *
 * Only writes links it can justify, and never overwrites one that already
 * exists, so running it twice is safe and manual links always win.
 */
export async function POST() {
  const [rows, folders, existing] = await Promise.all([readRows(), listFolders(), readIndex()])

  const claimed = new Set(Object.values(existing))
  const unlinkedRows = rows.filter((r) => !existing[String(r.id)])
  const freeFolders = folders.map((f) => f.folder).filter((f) => !claimed.has(f))

  const matches = reconcile(unlinkedRows, freeFolders)
  const next = { ...existing }
  for (const m of matches) next[String(m.id)] = m.folder
  await writeIndex(next)

  return NextResponse.json({
    linked: matches.length,
    matches,
    stillUnlinkedRows: rows.length - Object.keys(next).length,
    stillUnclaimedFolders: folders.length - new Set(Object.values(next)).size,
  })
}
