import { NextResponse } from 'next/server'
import { getApplication, readDoc } from '@/lib/applications'
import { linkFolder, unlinkFolder } from '@/lib/appIndex'
import { updateRow } from '@/lib/tracker'
import { ApplicationNotFoundError, deleteApplication } from '@/lib/deleteApplication'
import { readWorkspace, updateWorkspace } from '@/lib/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const app = await getApplication(key)
  if (!app) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const folder = app.folder?.folder
  const [jd, notes, yaml] = folder
    ? await Promise.all([
        readDoc(folder, 'jd.md'),
        readDoc(folder, 'tailoring-notes.md'),
        (async () => {
          const name = app.folder?.docs.find((d) => d.key === 'yaml')?.name
          return name ? readDoc(folder, name) : null
        })(),
      ])
    : [null, null, null]

  return NextResponse.json({ ...app, jd, notes, yaml })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const body = (await req.json()) as { status?: string; notes?: string; folder?: string | null }

  const app = await getApplication(key)
  if (!app) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    if (body.folder !== undefined && app.row) {
      if (body.folder) await linkFolder(app.row.id, body.folder)
      else await unlinkFolder(app.row.id)
    }

    if ((body.status || body.notes !== undefined) && app.row) {
      await updateRow(app.row.id, {
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      })
    }

    if (body.status === 'Applied') {
      const workspace = await readWorkspace(key)
      if (!workspace.appliedAt) {
        await updateWorkspace(key, workspace.revision, (current) => ({
          ...current, appliedAt: current.appliedAt ?? new Date().toISOString(),
        }))
      }
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }

  const updatedKey = body.folder ?? key
  return NextResponse.json(await getApplication(updatedKey) ?? await getApplication(key))
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params

  try {
    return NextResponse.json(await deleteApplication(key))
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: err instanceof ApplicationNotFoundError ? 404 : 500 },
    )
  }
}
