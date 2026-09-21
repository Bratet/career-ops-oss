import { NextResponse } from 'next/server'
import { listSkillRuns } from '@/lib/skills/runs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const applicationKey = url.searchParams.get('applicationKey') || undefined
  const requested = Number(url.searchParams.get('limit') || 100)
  const limit = Number.isInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100
  return NextResponse.json({ runs: await listSkillRuns({ applicationKey, limit }) })
}
