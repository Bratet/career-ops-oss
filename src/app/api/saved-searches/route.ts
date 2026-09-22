import { NextResponse } from 'next/server'
import { z } from 'zod'
import { savedSearchesSchema } from '@/lib/savedSearchSchema'
import { savedSearchStore } from '@/lib/savedSearches'

export const runtime = 'nodejs'

export async function PUT(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Cross-origin writes are not allowed.' }, { status: 403 })
  }
  const body = await request.json().catch(() => null)
  const parsed = z.object({ searches: savedSearchesSchema, revision: z.string() }).strict().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the search name, URL, and field lengths.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await savedSearchStore.save(parsed.data.searches, parsed.data.revision))
  } catch (error) {
    if (error instanceof Error && error.message === 'CONFLICT') {
      return NextResponse.json({ error: 'These searches changed in another tab. Reload the page before saving again.' }, { status: 409 })
    }
    console.error('Could not save searches', error)
    return NextResponse.json({ error: 'Could not save your searches. Try again.' }, { status: 500 })
  }
}
