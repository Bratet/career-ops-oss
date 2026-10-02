import { NextResponse } from 'next/server'
import { findExistingApplications } from '@/lib/duplicates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Earlier applications that look like the same job, checked before creating a new one. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { company?: unknown; role?: unknown; jd?: unknown }
  if (typeof body.company !== 'string' || !body.company.trim()) {
    return NextResponse.json({ error: 'company is required' }, { status: 400 })
  }
  const matches = await findExistingApplications({
    company: body.company,
    role: typeof body.role === 'string' ? body.role : '',
    jd: typeof body.jd === 'string' ? body.jd : null,
  })
  return NextResponse.json({ matches })
}
