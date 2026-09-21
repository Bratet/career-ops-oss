import { NextResponse } from 'next/server'
import { readWorkspace, updateWorkspace, WorkspaceRevisionConflict } from '@/lib/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    return NextResponse.json({ workspace: await readWorkspace(key) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json() as { revision?: unknown; draftYaml?: unknown }
    if (!Number.isInteger(body.revision)) throw new Error('revision is required')
    if (body.draftYaml !== undefined && typeof body.draftYaml !== 'string') throw new Error('draftYaml must be a string')
    const workspace = await updateWorkspace(key, body.revision as number, (current) => ({
      ...current,
      ...(typeof body.draftYaml === 'string' ? { draftYaml: body.draftYaml } : {}),
    }))
    return NextResponse.json({ workspace })
  } catch (error) {
    const conflict = error instanceof WorkspaceRevisionConflict
    return NextResponse.json(
      { error: (error as Error).message, ...(conflict ? { actualRevision: error.actual } : {}) },
      { status: conflict ? 409 : 400 },
    )
  }
}
