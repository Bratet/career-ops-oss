import { writeFile, rename } from 'fs/promises'
import { join, resolve } from 'path'
import { NextResponse } from 'next/server'
import { APP_FILES, PATHS } from '@/lib/paths'
import { getApplication } from '@/lib/applications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Save the tailored YAML back into its application folder. */
export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const { yaml, fileName } = (await req.json()) as { yaml: string; fileName: string }

  if (typeof yaml !== 'string' || !yaml.trim()) {
    return NextResponse.json({ error: 'yaml (non-empty string) is required' }, { status: 400 })
  }

  const app = await getApplication(key)
  if (!app?.folder) return NextResponse.json({ error: 'no folder for this application' }, { status: 404 })

  const dir = join(PATHS.applications, app.folder.folder)
  const target = resolve(dir, fileName || APP_FILES.yaml)
  if (!target.startsWith(dir + '/')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const tmp = `${target}.tmp-${process.pid}`
  await writeFile(tmp, yaml, 'utf-8')
  await rename(tmp, target)
  return NextResponse.json({ saved: true })
}
