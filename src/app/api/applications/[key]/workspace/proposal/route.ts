import { NextResponse } from 'next/server'
import { finalizeWorkspaceArtifacts } from '@/lib/finalizeWorkspace'
import { contentHash, makeProposal, updateWorkspace, WorkspaceRevisionConflict } from '@/lib/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json() as Record<string, unknown>
    if (!Number.isInteger(body.revision) || typeof body.currentYaml !== 'string' || typeof body.beforeYaml !== 'string') {
      throw new Error('revision, beforeYaml, and currentYaml are required')
    }
    const workspace = await updateWorkspace(key, body.revision as number, (current) => {
      if (current.pendingProposal) throw new Error('resolve the current proposal before creating another')
      const proposal = makeProposal({
        kind: body.kind === 'assistant' ? 'assistant' : 'tailoring',
        beforeYaml: body.beforeYaml as string,
        operationBaseYaml: typeof body.operationBaseYaml === 'string' ? body.operationBaseYaml : undefined,
        currentYaml: body.currentYaml as string,
        ops: Array.isArray(body.ops) ? body.ops as never[] : [],
        requirementActions: Array.isArray(body.requirementActions) ? body.requirementActions as never[] : [],
        render: {
          pages: typeof body.pages === 'number' ? body.pages : null,
          fill: typeof body.fill === 'number' ? body.fill : null,
        },
        runId: typeof body.runId === 'string' ? body.runId : null,
      })
      return { ...current, draftYaml: proposal.currentYaml, pendingProposal: proposal }
    })
    return NextResponse.json({ workspace })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof WorkspaceRevisionConflict ? 409 : 400 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json() as { revision?: unknown; action?: unknown; yaml?: unknown; choices?: unknown }
    if (!Number.isInteger(body.revision) || (body.action !== 'accept' && body.action !== 'reject' && body.action !== 'update')) {
      throw new Error('revision and a valid action are required')
    }
    let finalized: Awaited<ReturnType<typeof finalizeWorkspaceArtifacts>> | null = null
    let proposalForFinalize = null
    if (body.action === 'accept') {
      const current = await import('@/lib/workspaces').then((module) => module.readWorkspace(key))
      if (current.revision !== body.revision) throw new WorkspaceRevisionConflict(body.revision as number, current.revision)
      if (!current.pendingProposal) throw new Error('no pending proposal')
      const yaml = typeof body.yaml === 'string' ? body.yaml : current.draftYaml
      if (yaml !== current.draftYaml) throw new Error('the draft changed since this proposal was reviewed')
      proposalForFinalize = current.pendingProposal
      finalized = await finalizeWorkspaceArtifacts(key, yaml, proposalForFinalize)
    }
    const workspace = await updateWorkspace(key, body.revision as number, (current) => {
      const proposal = current.pendingProposal
      if (!proposal) throw new Error('no pending proposal')
      if (body.action === 'update') {
        if (typeof body.yaml !== 'string' || !Array.isArray(body.choices)) throw new Error('yaml and choices are required')
        return { ...current, draftYaml: body.yaml, pendingProposal: { ...proposal, currentYaml: body.yaml, choices: body.choices as boolean[] } }
      }
      if (body.action === 'reject') return { ...current, draftYaml: proposal.beforeYaml, pendingProposal: null }
      return { ...current, pendingProposal: null, acceptedBaseHash: contentHash(current.draftYaml) }
    })
    return NextResponse.json({ workspace, finalized })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof WorkspaceRevisionConflict ? 409 : 400 })
  }
}
