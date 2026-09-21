import { NextResponse } from 'next/server'
import { runEditorAgent } from '@/lib/editorAgent'
import { applicationEditorContext } from '@/lib/applicationContext'
import type { Mode } from '@/lib/validate'
import { readWorkspace } from '@/lib/workspaces'
import { saveAnalysisChatReport } from '@/lib/analysisChat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

export async function POST(req: Request) {
  let body: {
    reviewOnly?: unknown
    conversation?: unknown
    yaml?: unknown
    mode?: unknown
    message?: unknown
    applicationKey?: unknown
    sessionId?: unknown
    stream?: unknown
  }
  try {
    body = await req.json()
    validate(body)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const responseStream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      try {
        const applicationKey = typeof body.applicationKey === 'string' && body.applicationKey
          ? body.applicationKey
          : null
        const context = applicationKey ? await applicationEditorContext(applicationKey) : null
        const analysisWorkspace = applicationKey && body.reviewOnly === true ? await readWorkspace(applicationKey) : null
        const result = await runEditorAgent({
          sessionId: body.sessionId as string,
          yaml: body.yaml as string,
          mode: body.mode as Mode,
          message: (body.message as string).trim(),
          applicationContext: context,
          conversation: parseConversation(body.conversation),
          reviewOnly: body.reviewOnly === true,
          fitReport: analysisWorkspace?.fit.status === 'ready' ? analysisWorkspace.fit.report : null,
          signal: req.signal,
          onEvent: (event) => {
            if (event.type === 'activity' || body.stream === true) send({ ...event })
          },
        })
        const analysisUpdated = applicationKey && analysisWorkspace && result.fitReport !== undefined
          ? await saveAnalysisChatReport(applicationKey, analysisWorkspace, result.fitReport)
          : false
        send({ type: 'done', ...result, analysisUpdated, answer: result.answer + (analysisUpdated ? '\n\nAnalysis saved. The overview now reflects these corrections.' : '') })
      } catch (error) {
        send({ type: 'error', message: (error as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(responseStream, {
    headers: {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}

function validate(body: {
  yaml?: unknown
  mode?: unknown
  message?: unknown
  sessionId?: unknown
}) {
  if (typeof body.yaml !== 'string' || !body.yaml.trim()) throw new Error('yaml is required')
  if (body.yaml.length > 250_000) throw new Error('yaml is too large for editor chat')
  if (body.mode !== 'master' && body.mode !== 'tailored') throw new Error('invalid editor mode')
  if (typeof body.message !== 'string' || !body.message.trim()) throw new Error('message is required')
  if (body.message.length > 8_000) throw new Error('message must be 8,000 characters or fewer')
  if (typeof body.sessionId !== 'string') throw new Error('editor session is required')
}

function parseConversation(value: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) throw new Error('invalid conversation')
  let size = 0
  return value.map((turn) => {
    if (!turn || (turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.content !== 'string') throw new Error('invalid conversation turn')
    size += turn.content.length
    if (size > 500_000) throw new Error('conversation is too large')
    return { role: turn.role, content: turn.content }
  })
}
