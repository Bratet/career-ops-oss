import { spawn } from 'child_process'
import { access } from 'fs/promises'
import { dirname, join } from 'path'
import { NextResponse } from 'next/server'
import { getApplication } from '@/lib/applications'
import { APP_FILES, PATHS } from '@/lib/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The finalized artifacts already live on disk, so there is nothing to download:
 * this hands back the absolute path and selects the file in the OS file browser
 * (Explorer, Finder) so it can be dragged straight into an application form.
 * Linux falls back to opening the containing folder; xdg-open has no "select" verb.
 */
function revealInFileBrowser(path: string): boolean {
  if (process.platform === 'darwin') spawn('open', ['-R', path], { stdio: 'ignore', detached: true }).unref()
  else if (process.platform === 'win32') spawn('explorer', ['/select,' + path], { stdio: 'ignore', detached: true }).unref()
  else if (process.platform === 'linux') spawn('xdg-open', [dirname(path)], { stdio: 'ignore', detached: true }).unref()
  else return false
  return true
}
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json().catch(() => ({})) as { doc?: unknown; reveal?: unknown }
    const doc = typeof body.doc === 'string' ? body.doc : 'pdf'
    if (!Object.prototype.hasOwnProperty.call(APP_FILES, doc)) throw new Error(`unknown document "${doc}"`)

    const app = await getApplication(key)
    if (!app?.folder) throw new Error('no folder for this application')
    const name = app.folder.docs.find((entry) => entry.key === doc)?.name ?? APP_FILES[doc as keyof typeof APP_FILES]
    const path = join(PATHS.applications, app.folder.folder, name)
    await access(path).catch(() => { throw new Error(`${name} has not been finalized yet`) })

    const revealed = body.reveal !== false && revealInFileBrowser(path)
    return NextResponse.json({ path, name, revealed })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
