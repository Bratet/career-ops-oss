import { NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'
import { getSkill } from '@/lib/skills/registry'
import { parseSkill } from '@/lib/skills/parser'
import { learningPrompt, learningTurns } from '@/lib/skills/learning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (id !== 'tailor-cv' && id !== 'analyze-job' && id !== 'profile-fit') throw new Error('Unsupported learning target')
    const body = await req.json()
    const turns = learningTurns(body.turns)
    const skill = await getSkill(id)
    const engine = await getEngine('editor-chat')
    const result = await engine.runStructured<{ markdown: string; summary: string; profileNotes: string }>({
      prompt: learningPrompt(skill.markdown, turns, id),
      signal: req.signal,
      schema: {
        type: 'object', additionalProperties: false, required: ['markdown', 'summary', 'profileNotes'],
        properties: { markdown: { type: 'string' }, summary: { type: 'string' }, profileNotes: { type: 'string' } },
      },
    })
    const proposed = parseSkill(result.markdown)
    if (JSON.stringify(proposed.metadata) !== JSON.stringify(skill.metadata)) {
      throw new Error('The proposal changed skill metadata. Retry to generate an instruction-only update.')
    }
    return NextResponse.json({ ...result, before: skill.markdown, expectedVersion: skill.metadata.version })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
