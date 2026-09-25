import { mkdir, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { APP_FILES, PATHS, slugify } from '@/lib/paths'
import { addRow } from '@/lib/tracker'
import { linkFolder } from '@/lib/appIndex'
import { seedYaml, requirementMap, jdMarkdown } from '@/lib/tailoring/seed'
import { jdAnalysisParser } from '@/lib/tailoring/jd'
import { attachSkillRunToApplication } from '@/lib/skills/runs'
import { createWorkspace } from '@/lib/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create an application folder from an analyzed JD.
 *
 * Writes the folder first and the tracker row last: a folder with no row shows
 * up in the UI as unlinked and is easy to fix, whereas a row pointing at a
 * folder that was never created is a dangling reference.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { analysis: unknown; jd: string; url?: string; runId?: string }

  const parsed = jdAnalysisParser.safeParse(body.analysis)
  if (!parsed.success) return NextResponse.json({ error: 'invalid analysis payload' }, { status: 400 })
  if (typeof body.jd !== 'string' || !body.jd.trim()) {
    return NextResponse.json({ error: 'the job posting text is required' }, { status: 400 })
  }

  const analysis = parsed.data
  const date = new Date().toISOString().slice(0, 10)
  const slug = slugify(analysis.company) || 'application'
  const folder = `${slug}-${date}`
  const dir = join(PATHS.applications, folder)

  try {
    await access(dir)
    return NextResponse.json({ error: `workspace/applications/${folder} already exists` }, { status: 409 })
  } catch {
    // does not exist, which is what we want
  }

  await mkdir(dir, { recursive: true })
  await Promise.all([
    writeFile(join(dir, 'jd.md'), jdMarkdown(body.jd, body.url ?? ''), 'utf-8'),
    // The editor's tailoring passes need the analysis back in structured form, and
    // tailoring-notes.md is lossy markdown. Without this the pass has to re-read
    // the posting with another model call before it can start.
    writeFile(join(dir, 'jd-analysis.json'), JSON.stringify(analysis, null, 2) + '\n', 'utf-8'),
    writeFile(join(dir, APP_FILES.yaml), await seedYaml(analysis), 'utf-8'),
    writeFile(join(dir, 'tailoring-notes.md'), requirementMap(analysis), 'utf-8'),
  ])

  let rowId: number | null = null
  let rowError: string | null = null
  let runLinkError: string | null = null
  try {
    const row = await addRow({
      date,
      company: analysis.company,
      role: analysis.role,
      score: 'N/A',
      status: 'Preparing',
      pdf: '❌',
      report: '—',
      notes: `Created in the app. ${analysis.summary ?? ''}`.trim().replace(/\|/g, '/'),
    })
    rowId = row.id
    await linkFolder(row.id, folder)
  } catch (err) {
    // The folder is on disk and usable; the row can be added by hand.
    rowError = (err as Error).message
  }

  if (typeof body.runId === 'string' && body.runId) {
    try {
      await attachSkillRunToApplication(body.runId, folder)
    } catch (err) {
      runLinkError = (err as Error).message
    }
  }

  let workspaceError: string | null = null
  try {
    await createWorkspace(folder)
  } catch (err) {
    workspaceError = (err as Error).message
  }

  return NextResponse.json({ folder, key: folder, rowId, rowError, runLinkError, workspaceError })
}
