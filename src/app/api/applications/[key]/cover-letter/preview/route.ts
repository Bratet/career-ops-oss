import { NextResponse } from 'next/server'
import { coverLetterSchema } from '@/lib/coverLetter'
import { letterSender, renderCoverLetter } from '@/lib/coverLetterRender'
import { put } from '@/lib/renderStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Render the draft for the live preview. Like the resume preview, the client
 * aborts this when the next keystroke lands, and that is not an error.
 */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const letter = coverLetterSchema.parse((await req.json()).letter)
    const { sender } = await letterSender(key)
    const result = await renderCoverLetter(letter, sender, { signal: req.signal })
    return NextResponse.json({
      ok: result.ok,
      token: result.pdfPath ? put(result.pdfPath) : null,
      pages: result.pages,
      words: result.words,
      failures: result.failures,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
