import { NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'
import { getSkillForRunner } from '@/lib/skills/registry'
import { startSkillRun, type RunRecorder } from '@/lib/skills/runs'
import { resumeReviewParser, resumeReviewPrompt, resumeReviewReplyParser, resumeReviewReplySchema, resumeReviewSchema, reviewRequestParser } from '@/lib/resumeReview'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  const input = reviewRequestParser.safeParse(await req.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Invalid review request.' }, { status: 400 })

  let run: RunRecorder | undefined
  try {
    const [engine, skill] = await Promise.all([getEngine('editor-chat'), getSkillForRunner('review-resume', 'text-artifact')])
    run = await startSkillRun({
      feature: 'review-resume', skill, engine: engine.id,
      inputSummary: { source: input.data.source, characters: input.data.yaml.length, renderedPdf: false, followUp: Boolean(input.data.message) },
    })
    run.event('start', input.data.message ? 'Reconsidering resume review feedback' : 'Reviewing the current resume draft')
    const raw = await engine.runStructured<unknown>({
      prompt: resumeReviewPrompt(skill.instructions, input.data),
      schema: input.data.message ? resumeReviewReplySchema : resumeReviewSchema,
      signal: req.signal,
    })
    const response = input.data.message ? resumeReviewReplyParser.parse(raw) : { reply: '', review: resumeReviewParser.parse(raw) }
    const { review, reply } = response
    await run.complete({ findings: review.findings.length, questions: review.questions.length })
    return NextResponse.json({ review, reply, runId: run.id, skillVersion: skill.metadata.version, engine: engine.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resume review failed.'
    await run?.fail(message).catch(() => {})
    return NextResponse.json({ error: message, runId: run?.id }, { status: 500 })
  }
}
