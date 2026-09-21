import { NextResponse } from 'next/server'
import { getSkill, saveSkill, SkillVersionConflict } from '@/lib/skills/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ skill: await getSkill((await params).id) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json() as { markdown?: unknown; expectedVersion?: unknown }
    if (typeof body.markdown !== 'string') {
      return NextResponse.json({ error: 'markdown must be a string' }, { status: 400 })
    }
    return NextResponse.json({ skill: await saveSkill(id, body.markdown, typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof SkillVersionConflict ? 409 : 400 })
  }
}
