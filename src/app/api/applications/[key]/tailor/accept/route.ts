import { randomUUID } from 'crypto'
import { readFile, rename, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { NextResponse } from 'next/server'
import { getApplication } from '@/lib/applications'
import { APP_FILES, PATHS } from '@/lib/paths'
import { acceptedTailoringNotes } from '@/lib/tailoring/notes'
import type { Op } from '@/lib/tailoring/ops'
import type { RequirementAction } from '@/lib/tailoring/rules'
import { cleanupRender, renderYaml } from '@/lib/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Commit the exact reviewed buffer and its tailoring record together. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const body = await req.json() as {
    yaml?: unknown
    ops?: unknown
    requirementActions?: unknown
  }

  if (typeof body.yaml !== 'string' || !body.yaml.trim()) {
    return NextResponse.json({ error: 'yaml (non-empty string) is required' }, { status: 400 })
  }
  if (!Array.isArray(body.ops) || !Array.isArray(body.requirementActions)) {
    return NextResponse.json({ error: 'tailoring operations and requirement actions are required' }, { status: 400 })
  }

  // Re-render the exact reviewed buffer on the server. The user may have
  // unchecked an operation or edited YAML after the proposal was measured, so
  // client-reported page numbers are never accepted as proof of one-page fit.
  const render = await renderYaml(body.yaml, 'tailored')
  try {
    if (!render.ok || render.pages !== 1) {
      const failure = render.failures[0]
      return NextResponse.json({
        error: failure?.why ?? 'the tailored CV could not be verified as one page',
        pages: render.pages,
        fill: render.fill,
      }, { status: 400 })
    }
  } finally {
    if (render.pdfPath) await cleanupRender(render.pdfPath)
  }

  const app = await getApplication(key)
  if (!app?.folder) return NextResponse.json({ error: 'no folder for this application' }, { status: 404 })

  const dir = join(PATHS.applications, app.folder.folder)
  const yamlName = app.folder.docs.find((doc) => doc.key === 'yaml')?.name ?? APP_FILES.yaml
  const notesName = app.folder.docs.find((doc) => doc.key === 'notes')?.name ?? APP_FILES.notes
  const yamlPath = resolve(dir, yamlName)
  const notesPath = resolve(dir, notesName)
  if (!yamlPath.startsWith(`${dir}/`) || !notesPath.startsWith(`${dir}/`)) {
    return NextResponse.json({ error: 'forbidden application file path' }, { status: 403 })
  }
  const suffix = `${process.pid}-${randomUUID()}`
  const yamlTemp = `${yamlPath}.tmp-${suffix}`
  const notesTemp = `${notesPath}.tmp-${suffix}`

  try {
    let notes: string | null = null
    try {
      const current = await readFile(notesPath, 'utf-8')
      notes = acceptedTailoringNotes(
        current,
        {
          ops: body.ops as Op[],
          requirementActions: body.requirementActions as RequirementAction[],
        },
        body.yaml,
        {
          pages: render.pages,
          fill: render.fill,
        },
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    await Promise.all([
      writeFile(yamlTemp, body.yaml, 'utf-8'),
      notes === null ? Promise.resolve() : writeFile(notesTemp, notes, 'utf-8'),
    ])
    await rename(yamlTemp, yamlPath)
    if (notes !== null) await rename(notesTemp, notesPath)
    return NextResponse.json({ saved: true })
  } catch (error) {
    await Promise.all([
      rm(yamlTemp, { force: true }).catch(() => {}),
      rm(notesTemp, { force: true }).catch(() => {}),
    ])
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
