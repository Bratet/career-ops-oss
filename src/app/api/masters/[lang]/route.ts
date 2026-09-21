import { readFile, writeFile, rename } from 'fs/promises'
import { NextResponse } from 'next/server'
import { PATHS, type Lang } from '@/lib/paths'
import { parse } from 'yaml'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pathFor(lang: string, req: Request): string | null {
  const family = new URL(req.url).searchParams.get('family') ?? 'masters'
  if (family !== 'masters' && family !== 'ownCv') return null
  return lang === 'en' || lang === 'fr' ? PATHS[family][lang as Lang] : null
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const file = pathFor(lang, _req)
  if (!file) return NextResponse.json({ error: 'lang must be en or fr' }, { status: 400 })
  try {
    return NextResponse.json({ lang, yaml: await readFile(file, 'utf-8') })
  } catch {
    return NextResponse.json({ error: 'master not found' }, { status: 404 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const file = pathFor(lang, req)
  if (!file) return NextResponse.json({ error: 'lang must be en or fr' }, { status: 400 })

  const { yaml } = (await req.json()) as { yaml: string }
  if (typeof yaml !== 'string' || !yaml.trim()) {
    return NextResponse.json({ error: 'yaml (non-empty string) is required' }, { status: 400 })
  }

  try {
    if (!parse(yaml)?.cv) throw new Error('missing cv')
  } catch {
    return NextResponse.json({ error: 'Valid resume YAML with a cv section is required' }, { status: 400 })
  }
  const tmp = `${file}.tmp-${randomUUID()}`
  await writeFile(tmp, yaml, 'utf-8')
  await rename(tmp, file)
  return NextResponse.json({ lang, saved: true })
}
