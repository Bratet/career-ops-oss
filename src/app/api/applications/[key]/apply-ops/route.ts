import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { getApplication } from '@/lib/applications'
import { APP_FILES, PATHS } from '@/lib/paths'
import { applyNotesPatch, cutsFromOps } from '@/lib/tailoring/notes'
import { applyOps, type Op } from '@/lib/tailoring/ops'
import { jdAnalysisParser } from '@/lib/tailoring/jd'
import { parse } from 'yaml'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Apply an operation set to YAML text and hand back the result.
 *
 * The change checklist replays through here rather than undoing locally, so the
 * applier and its guards have exactly one implementation and it lives on the
 * server. Nothing is written to disk: the editor owns the buffer and Save owns
 * the file.
 */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const { yaml, ops, syncNotes } = (await req.json()) as { yaml: string; ops: Op[]; syncNotes?: boolean }

  if (typeof yaml !== 'string' || !yaml.trim()) {
    return NextResponse.json({ error: 'yaml (non-empty string) is required' }, { status: 400 })
  }
  if (!Array.isArray(ops)) {
    return NextResponse.json({ error: 'ops (array) is required' }, { status: 400 })
  }

  try {
    const result = applyOps(yaml, ops, { master: await masterFor(key, yaml) })
    // Turning a change off in the editor sends the whole surviving set, so the
    // cut table can be rebuilt from it and never describes a cut that was undone.
    if (syncNotes) await syncCutTable(key, result.applied)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

/** Resolve server-owned evidence for checklist replay; stale imports fail by fingerprint. */
async function masterFor(key: string, yaml: string): Promise<string> {
  const app = await getApplication(key)
  let language = parse(yaml)?.locale?.language === 'french' ? 'fr' : 'en'
  if (app?.folder) {
    try {
      const raw = await readFile(join(PATHS.applications, app.folder.folder, APP_FILES.analysis), 'utf-8')
      const analysis = jdAnalysisParser.parse(JSON.parse(raw))
      language = analysis.language
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return readFile(PATHS.masters[language === 'fr' ? 'fr' : 'en'], 'utf-8')
}

/** Rewrite the notes' cut table from the operations that are still live. */
async function syncCutTable(key: string, ops: Op[]): Promise<void> {
  const app = await getApplication(key)
  if (!app?.folder) return
  const name = app.folder.docs.find((d) => d.key === 'notes')?.name ?? APP_FILES.notes
  const path = join(PATHS.applications, app.folder.folder, name)
  try {
    const md = await readFile(path, 'utf-8')
    await writeFile(path, applyNotesPatch(md, { cuts: cutsFromOps(ops) }), 'utf-8')
  } catch {
    // no notes file in this folder; nothing to keep in sync
  }
}
