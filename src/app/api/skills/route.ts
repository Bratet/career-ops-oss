import { NextResponse } from 'next/server'
import { duplicateSkill, listSkills } from '@/lib/skills/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ skills: await listSkills() })
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { sourceId?: unknown; id?: unknown; name?: unknown }
    if (typeof body.sourceId !== 'string' || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'sourceId and id are required' }, { status: 400 })
    }
    const skill = await duplicateSkill(body.sourceId, body.id, typeof body.name === 'string' ? body.name : undefined)
    return NextResponse.json({ skill }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
