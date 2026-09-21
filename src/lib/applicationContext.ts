import { getApplication, readDoc } from './applications'
import { APP_FILES } from './paths'
import { readWorkspace } from './workspaces'

/** Context supplied to the resume-editing agent for one application. */
export async function applicationEditorContext(applicationKey: string): Promise<string> {
  const app = await getApplication(applicationKey)
  if (!app) throw new Error('application not found')
  const folder = app.folder?.folder
  const yamlName = app.folder?.docs.find((doc) => doc.key === 'yaml')?.name
  const notesName = app.folder?.docs.find((doc) => doc.key === 'notes')?.name
  const [jd, acceptedYaml, notes] = folder
    ? await Promise.all([
        readDoc(folder, APP_FILES.jd),
        yamlName ? readDoc(folder, yamlName) : null,
        notesName ? readDoc(folder, notesName) : null,
      ])
    : [null, null, null]

  let workspace = null
  try { workspace = await readWorkspace(applicationKey) } catch {}

  return JSON.stringify({
    applicationKey,
    applicationFolder: folder ?? null,
    tracker: app.row ? {
      id: app.row.id,
      company: app.row.company,
      role: app.row.role,
      status: app.row.status,
      score: app.row.score,
      date: app.row.date,
      notes: app.row.notes,
    } : null,
    jobPosting: clip(jd, 24_000),
    currentDraft: clip(workspace?.draftYaml ?? acceptedYaml, 36_000),
    fitReport: workspace?.fit.report ?? null,
    tailoringNotes: clip(notes, 16_000),
  }, null, 2)
}

function clip(value: string | null, length: number): string | null {
  if (!value || value.length <= length) return value
  return `${value.slice(0, length)}\n\n[truncated]`
}
