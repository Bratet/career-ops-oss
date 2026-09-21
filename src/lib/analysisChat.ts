import { parseProfileFit } from './profileFit'
import { readWorkspace, updateWorkspace, workspaceInputs, WorkspaceRevisionConflict, type ApplicationWorkspace } from './workspaces'

/** Save only the assessment; concurrent resume autosaves are safe to preserve. */
export async function saveAnalysisChatReport(key: string, base: ApplicationWorkspace, value: unknown): Promise<boolean> {
  if (JSON.stringify(value) === JSON.stringify(base.fit.report)) return false
  const { analysis } = await workspaceInputs(key)
  if (!analysis || !base.fit.report || base.fit.status !== 'ready') throw new Error('Wait for the fit analysis to finish, then retry your correction.')
  const rows = (value as { requirements?: unknown } | null)?.requirements
  if (!Array.isArray(rows) || rows.length !== analysis.requirements.length || rows.some((row, index) =>
    row?.requirement !== analysis.requirements[index].text || row?.weight !== analysis.requirements[index].weight || row?.rank !== analysis.requirements[index].rank,
  )) throw new Error('The analysis correction changed the job requirements. Your report was preserved; retry the correction.')
  const report = parseProfileFit(value, analysis)
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readWorkspace(key)
    if (JSON.stringify(current.fit) !== JSON.stringify(base.fit)) throw new Error('The fit analysis changed during this discussion. Retry against the updated analysis.')
    try {
      await updateWorkspace(key, current.revision, (latest) => ({
        ...latest,
        fit: { ...latest.fit, report, error: null, completedAt: new Date().toISOString() },
      }))
      return true
    } catch (error) {
      if (!(error instanceof WorkspaceRevisionConflict) || attempt === 3) throw error
    }
  }
  return false
}
