import { NextResponse } from 'next/server'
import { renderYaml } from '@/lib/render'
import { put } from '@/lib/renderStore'
import type { Mode } from '@/lib/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Render YAML text to a PDF and apply the rules.
 *
 * The client aborts this when the next keystroke lands, which surfaces here as a
 * dropped connection; renderYaml treats that as "superseded", not an error.
 */
export async function POST(req: Request) {
  let body: { yaml?: unknown; mode?: Mode; allowMultipage?: boolean }
  try {
    body = await req.json()
  } catch {
    // The client aborts this request whenever the next keystroke lands, which can
    // cut the body off mid-read. Treat that as superseded, not a crash.
    return NextResponse.json({ error: 'request body was not readable (likely a superseded request)' }, { status: 400 })
  }
  const { yaml, mode, allowMultipage } = body

  if (typeof yaml !== 'string') {
    return NextResponse.json({ error: 'yaml (string) is required' }, { status: 400 })
  }

  const result = await renderYaml(yaml, mode === 'general' ? 'general' : mode === 'master' ? 'master' : 'tailored', {
    signal: req.signal,
    allowMultipage,
  })

  return NextResponse.json({
    ok: result.ok,
    token: result.pdfPath ? put(result.pdfPath) : null,
    pages: result.pages,
    fill: result.fill,
    failures: result.failures,
    notes: result.notes,
    ms: result.ms,
  })
}
