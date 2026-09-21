import { NextResponse } from 'next/server'
import { finalizeWorkspaceArtifacts } from '@/lib/finalizeWorkspace'
import { contentHash, readWorkspace, updateWorkspace, WorkspaceRevisionConflict } from '@/lib/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json() as { revision?: unknown }
    if (!Number.isInteger(body.revision)) throw new Error('revision is required')
    const current = await readWorkspace(key)
    if (current.revision !== body.revision) throw new WorkspaceRevisionConflict(body.revision as number, current.revision)
    if (current.pendingProposal) throw new Error('accept or reject the pending proposal before finalizing')
    const finalized = await finalizeWorkspaceArtifacts(key, current.draftYaml)
    const workspace = await updateWorkspace(key, current.revision, (record) => ({
      ...record, acceptedBaseHash: contentHash(record.draftYaml),
    }))
    return NextResponse.json({ workspace, finalized })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof WorkspaceRevisionConflict ? 409 : 400 })
  }
}
