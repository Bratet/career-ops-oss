import { randomUUID } from 'crypto'
import { copyFile, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { getApplication } from './applications'
import { APP_FILES, PATHS } from './paths'
import { cleanupRender, renderYaml } from './render'
import { acceptedTailoringNotes } from './tailoring/notes'
import type { WorkspaceProposal } from './workspaces'
import { workspaceInputs } from './workspaces'

export async function finalizeWorkspaceArtifacts(
  key: string,
  yaml: string,
  proposal?: WorkspaceProposal | null,
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
  const notesName = app.folder.docs.find((doc) => doc.key === 'notes')?.name ?? APP_FILES.notes
  const suffix = `${process.pid}-${randomUUID()}`
  const yamlPath = join(dir, yamlName)
  const pdfPath = join(dir, pdfName)
  const notesPath = join(dir, notesName)
  const yamlTemp = `${yamlPath}.${suffix}.tmp`
  const pdfTemp = `${pdfPath}.${suffix}.tmp`
  const notesTemp = `${notesPath}.${suffix}.tmp`
  try {
    await Promise.all([writeFile(yamlTemp, yaml, 'utf-8'), copyFile(render.pdfPath, pdfTemp)])
    let hasNotes = false
    if (proposal?.kind === 'tailoring') {
      let current = ''
      try { current = await readFile(notesPath, 'utf-8') } catch {}
      const notes = acceptedTailoringNotes(current, {
        ops: proposal.ops.filter((_, index) => proposal.choices[index] !== false),
        requirementActions: proposal.requirementActions,
      }, yaml, { pages: render.pages, fill: render.fill })
      await writeFile(notesTemp, notes, 'utf-8')
      hasNotes = true
    }
    // All complete files exist before any accepted artifact is replaced.
    await rename(yamlTemp, yamlPath)
    await rename(pdfTemp, pdfPath)
    if (hasNotes) await rename(notesTemp, notesPath)
    return { pages: render.pages, fill: render.fill, yamlName, pdfName }
  } finally {
    await cleanupRender(render.pdfPath)
    await Promise.all([yamlTemp, pdfTemp, notesTemp].map((path) => rm(path, { force: true }).catch(() => {})))
  }
}
