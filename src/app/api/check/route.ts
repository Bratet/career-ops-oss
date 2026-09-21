import { NextResponse } from 'next/server'
import { checkContent } from '@/lib/validate'
import type { Mode } from '@/lib/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Content rules only, no render. Fast enough to run at keystroke speed. */
export async function POST(req: Request) {
  const { yaml, mode } = (await req.json()) as { yaml: string; mode: Mode }
  if (typeof yaml !== 'string') {
    return NextResponse.json({ error: 'yaml (string) is required' }, { status: 400 })
  }
  const result = await checkContent(yaml, mode === 'master' ? 'master' : 'tailored')
  return NextResponse.json({ ok: result.ok, failures: result.failures, mode: result.mode })
}
