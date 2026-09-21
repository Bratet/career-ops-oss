import { readFile } from 'fs/promises'
import { join, resolve, relative, isAbsolute, extname, sep } from 'path'
import { NextResponse } from 'next/server'
import { PATHS } from '@/lib/paths'
import { getApplication } from '@/lib/applications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.yaml': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string; path: string[] }> }) {
  const { key, path } = await params
  const app = await getApplication(key)
  if (!app?.folder) return new NextResponse('not found', { status: 404 })

  const dir = join(PATHS.applications, app.folder.folder)
  const target = resolve(dir, ...path)

  // Never serve outside the application's own folder, whatever the path segments say.
  // path.relative (not a hardcoded "/") so this also works with Windows' "\" separator.
  const rel = relative(dir, target)
  if (rel !== '' && (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))) {
    return new NextResponse('forbidden', { status: 403 })
  }

  try {
    const buf = await readFile(target)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'content-disposition': 'inline',
        'cache-control': 'no-store',
      },
    })
  } catch {
    return new NextResponse('not found', { status: 404 })
  }
}
