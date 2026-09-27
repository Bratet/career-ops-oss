import { parseProfileFit } from './profileFit'
import { fitBasisFields, readWorkspace, updateWorkspace, workspaceInputs, WorkspaceRevisionConflict, type ApplicationWorkspace } from './workspaces'

/**
 * Save only the assessment; concurrent resume autosaves are safe to preserve.
 * The chat works incrementally on the report it was shown, so a queued refresh
 * does not block it: the agent read the current masters and guidance, so its
 * saved report becomes the up-to-date one and the refresh is no longer needed.
 */
export async function saveAnalysisChatReport(key: string, base: ApplicationWorkspace, value: unknown): Promise<boolean> {
  if (JSON.stringify(value) === JSON.stringify(base.fit.report)) return false
  const inputs = await workspaceInputs(key)
  const { analysis } = inputs
  if (!analysis || !base.fit.report) throw new Error('Wait for the first fit analysis to finish, then retry your correction.')
  const rows = (value as { requirements?: unknown } | null)?.requirements
  if (!Array.isArray(rows) || rows.length !== analysis.requirements.length || rows.some((row, index) =>
    row?.requirement !== analysis.requirements[index].text || row?.weight !== analysis.requirements[index].weight || row?.rank !== analysis.requirements[index].rank,
  )) throw new Error('The analysis correction changed the job requirements. Your report was preserved; retry the correction.')
  const report = parseProfileFit(value, analysis)
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readWorkspace(key)
    if (JSON.stringify(current.fit.report) !== JSON.stringify(base.fit.report)) throw new Error('The fit analysis changed during this discussion. Retry against the updated analysis.')
    try {
      await updateWorkspace(key, current.revision, (latest) => ({
        ...latest,
        fit: { ...latest.fit, ...fitBasisFields(inputs), status: 'ready', report, error: null, completedAt: new Date().toISOString() },
      }))
      return true
    } catch (error) {
      if (!(error instanceof WorkspaceRevisionConflict) || attempt === 3) throw error
    }
  }
  return false
}
