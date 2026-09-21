import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { APP_FILES, PATHS, slugify } from '@/lib/paths'
import { generalApplicationSchema } from '@/lib/generalApplication'
import { addRow } from '@/lib/tracker'
import { linkFolder } from '@/lib/appIndex'
import { createWorkspace } from '@/lib/workspaces'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const parsed = generalApplicationSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const details = parsed.data
  let yaml: string
  try { yaml = await readFile(PATHS.ownCv[details.language], 'utf-8') } catch {
    return NextResponse.json({ error: 'General resume source is missing. Check Profile before retrying.' }, { status: 404 })
  }
  const date = new Date().toISOString().slice(0, 10)
  const folder = `${slugify(details.company) || 'application'}-${date}`
  const dir = join(PATHS.applications, folder)
  try { await mkdir(dir) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return NextResponse.json({ error: `An application for this company already exists today: ${folder}` }, { status: 409 })
    throw error
  }
  await Promise.all([
    writeFile(join(dir, APP_FILES.yaml), yaml, 'utf-8'),
    writeFile(join(dir, APP_FILES.general), JSON.stringify(details, null, 2) + '\n', 'utf-8'),
    writeFile(join(dir, APP_FILES.notes), `# General resume application\n\nNo job description supplied. Uses a copy of the ${details.language.toUpperCase()} general resume.\n\nCompany: ${details.company}\nRole: ${details.role || 'Not specified'}\nLocation: ${details.location || 'Not specified'}\nContact: ${details.contact || 'Not specified'}\nURL: ${details.url}\n\n${details.notes}\n`, 'utf-8'),
  ])
  let warning: string | null = null
  try {
    const row = await addRow({ date, company: details.company, role: details.role || 'General inquiry', score: 'N/A', status: 'Preparing', pdf: '❌', report: '—', notes: 'No job description. General resume application.' })
    await linkFolder(row.id, folder)
  } catch (error) { warning = `Application saved, but tracker linking failed: ${(error as Error).message}` }
  await createWorkspace(folder)
  return NextResponse.json({ key: folder, warning })
}
