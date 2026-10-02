import { NextResponse } from 'next/server'
import { GOAL_MAX, clearGoal, parseGoal, readGoal, writeGoal } from '@/lib/goal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ goal: await readGoal() })
}

export async function PUT(req: Request) {
  const goal = parseGoal(await req.json().catch(() => null))
  if (!goal) {
    return NextResponse.json(
      { error: `Set a whole number from 1 to ${GOAL_MAX}, per day, week or month.` },
      { status: 400 },
    )
  }
  await writeGoal(goal)
  return NextResponse.json({ goal })
}

export async function DELETE() {
  await clearGoal()
  return NextResponse.json({ goal: null })
}
