import { randomUUID } from 'crypto'
import { copyFile, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { getApplication } from './applications'
import { APP_FILES, PATHS } from './paths'
import { cleanupRender, renderYaml } from './render'
import { acceptedTailoringNotes } from './tailoring/notes'
import type { WorkspaceProposal } from './workspaces'
import { workspaceInputs } from './workspaces'

/**
 * Record an accepted tailoring proposal in the application's notes. Accepting
 * only keeps the changes in the draft; the PDF is produced by finalizing.
 */
export async function writeAcceptedTailoringNotes(key: string, yaml: string, proposal: WorkspaceProposal): Promise<void> {
  if (proposal.kind !== 'tailoring') return
  const app = await getApplication(key)
  if (!app?.folder) throw new Error('no folder for this application')
  const notesName = app.folder.docs.find((doc) => doc.key === 'notes')?.name ?? APP_FILES.notes
  const notesPath = join(PATHS.applications, app.folder.folder, notesName)
  let current = ''
  try { current = await readFile(notesPath, 'utf-8') } catch {}
  const notes = acceptedTailoringNotes(current, {
    ops: proposal.ops.filter((_, index) => proposal.choices[index] !== false),
    requirementActions: proposal.requirementActions,
  }, yaml, proposal.render)
  const notesTemp = `${notesPath}.${process.pid}-${randomUUID()}.tmp`
  try {
    await writeFile(notesTemp, notes, 'utf-8')
    await rename(notesTemp, notesPath)
  } finally {
    await rm(notesTemp, { force: true }).catch(() => {})
  }
}

export async function finalizeWorkspaceArtifacts(
  key: string,
  yaml: string,
): Promise<{ pages: number; fill: number | null; yamlName: string; pdfName: string }> {
  const app = await getApplication(key)
  if (!app?.folder) throw new Error('no folder for this application')
  const { general } = await workspaceInputs(key)
  const render = await renderYaml(yaml, general ? 'general' : 'tailored')
  if (!render.ok || (!general && render.pages !== 1) || !render.pages || !render.pdfPath) {
    if (render.pdfPath) await cleanupRender(render.pdfPath)
    throw new Error(render.failures[0]?.why ?? 'the resume could not be verified as one page')
  }

  const dir = join(PATHS.applications, app.folder.folder)
  const yamlName = app.folder.docs.find((doc) => doc.key === 'yaml')?.name ?? APP_FILES.yaml
  const pdfName = APP_FILES.pdf
  const suffix = `${process.pid}-${randomUUID()}`
  const yamlPath = join(dir, yamlName)
  const pdfPath = join(dir, pdfName)
  const yamlTemp = `${yamlPath}.${suffix}.tmp`
  const pdfTemp = `${pdfPath}.${suffix}.tmp`
  try {
    await Promise.all([writeFile(yamlTemp, yaml, 'utf-8'), copyFile(render.pdfPath, pdfTemp)])
    // Both complete files exist before any finalized artifact is replaced.
    await rename(yamlTemp, yamlPath)
    await rename(pdfTemp, pdfPath)
    return { pages: render.pages, fill: render.fill, yamlName, pdfName }
  } finally {
    await cleanupRender(render.pdfPath)
    await Promise.all([yamlTemp, pdfTemp].map((path) => rm(path, { force: true }).catch(() => {})))
  }
}
