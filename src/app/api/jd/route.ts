import { NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'
import { EngineError } from '@/lib/engine/types'
import { jdAnalysisSchema, jdAnalysisParser, jdPrompt } from '@/lib/tailoring/jd'
import { getSkillForRunner } from '@/lib/skills/registry'
import { startSkillRun, type RunRecorder } from '@/lib/skills/runs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Analyze a pasted job posting with this feature's configured engine.
 *
 * Streams NDJSON so the UI can show progress: the call routinely takes 20-60s,
 * and a silent spinner that long reads as a hang.
 */
export async function POST(req: Request) {
  const { jd, skillId = 'analyze-job' } = (await req.json()) as { jd: string; skillId?: string }
  if (typeof jd !== 'string' || jd.trim().length < 40) {
    return NextResponse.json({ error: 'Paste the job posting first (at least a few lines).' }, { status: 400 })
  }

  const engine = await getEngine('job-analysis')
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      let run: RunRecorder | null = null

      try {
        const skill = await getSkillForRunner(skillId, 'job-analysis')
        run = await startSkillRun({
          feature: 'analyze-job',
          skill,
          engine: engine.id,
          inputSummary: { postingCharacters: jd.length },
        })
        run.event('start', `${engine.id} started ${skill.metadata.name} v${skill.metadata.version}`)
        send({ type: 'start', engine: engine.id, runId: run.id, skillId: skill.metadata.id, skillVersion: skill.metadata.version })

        const status = await engine.status()
        if (!status.ok) {
          const message = status.reason ?? `${engine.id} is unavailable`
          run.event('error', message)
          await run.fail(message)
          send({ type: 'error', message })
          return
        }

        const progress = `${engine.id} is reading the posting…`
        run.event('progress', progress)
        send({ type: 'progress', message: progress })

        const raw = await engine.runStructured<unknown>({
          prompt: jdPrompt(jd, skill.instructions),
          schema: jdAnalysisSchema,
          signal: req.signal,
        })

        const parsed = jdAnalysisParser.safeParse(raw)
        if (!parsed.success) {
          const message = `${engine.id} returned an unexpected shape: ${parsed.error.issues[0]?.message}`
          run.event('error', message)
          await run.fail(message)
          send({ type: 'error', message })
        } else {
          const result = {
            company: parsed.data.company,
            role: parsed.data.role,
            requirements: parsed.data.requirements.length,
            keywords: parsed.data.keywords.length,
            language: parsed.data.language,
          }
          run.event('result', `extracted ${result.requirements} requirements and ${result.keywords} keywords`)
          await run.complete(result)
          send({ type: 'done', analysis: parsed.data, runId: run.id })
        }
      } catch (err) {
        const message =
          err instanceof EngineError
            ? `${err.message}${err.stderr ? ` — ${err.stderr.split('\n').filter(Boolean).slice(-1)[0]}` : ''}`
            : (err as Error).message
        run?.event('error', message)
        if (run) await run.fail(message).catch(() => {})
        send({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' },
  })
}
