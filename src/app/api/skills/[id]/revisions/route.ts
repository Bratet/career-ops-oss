import { NextResponse } from 'next/server'
import { listSkillRevisions, restoreSkillRevision } from '@/lib/skills/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ revisions: await listSkillRevisions((await params).id) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json() as { file?: unknown }
    if (typeof body.file !== 'string') throw new Error('revision file is required')
    return NextResponse.json({ skill: await restoreSkillRevision(id, body.file) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
