import { NextResponse } from 'next/server'
import { assertLetterBase, CoverLetterConflict, coverLetterSchema } from '@/lib/coverLetter'
import { finalizeCoverLetter } from '@/lib/coverLetterRender'
import { readWorkspace, updateWorkspace } from '@/lib/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Save the reviewed draft, then write the PDF and its template inputs into the
 * application folder. A client whose `base` is stale is refused before any
 * file is touched, so it cannot replace a newer finalized letter.
 */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json()
    const letter = coverLetterSchema.parse(body.letter)
    assertLetterBase((await readWorkspace(key)).coverLetter, body.base)
    const finalized = await finalizeCoverLetter(key, letter)
    const workspace = await readWorkspace(key)
    await updateWorkspace(key, workspace.revision, (current) => ({ ...current, coverLetter: letter }))
    return NextResponse.json({ finalized })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof CoverLetterConflict ? 409 : 400 })
  }
}
