import { NextResponse } from 'next/server'
import { parseSkill, RUNNER_PLACEHOLDERS } from '@/lib/skills/parser'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json() as { markdown?: unknown }
    if (typeof body.markdown !== 'string') throw new Error('markdown must be a string')
    const skill = parseSkill(body.markdown)
    if (skill.metadata.id !== id) throw new Error('the id in frontmatter must match the skill URL')
    return NextResponse.json({
      ok: true,
      runner: skill.metadata.runner,
      placeholders: RUNNER_PLACEHOLDERS[skill.metadata.runner],
      characters: skill.instructions.length,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
