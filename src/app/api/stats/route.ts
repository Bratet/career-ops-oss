import { NextResponse } from 'next/server'
import { computeStats } from '@/lib/applications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await computeStats())
}
