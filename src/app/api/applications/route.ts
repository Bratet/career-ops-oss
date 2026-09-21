import { NextResponse } from 'next/server'
import { listApplications, listFolders } from '@/lib/applications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const [applications, folders] = await Promise.all([listApplications(), listFolders()])
  return NextResponse.json({ applications, folders: folders.map((f) => f.folder) })
}
