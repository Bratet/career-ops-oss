import { NextResponse } from 'next/server'
import { getSkillRun } from '@/lib/skills/runs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ run: await getSkillRun((await params).id) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 })
  }
}
