import { NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'
import { getSkillForRunner } from '@/lib/skills/registry'
import { startSkillRun, type RunRecorder } from '@/lib/skills/runs'
import {
  fitInputChanges, hasFitInputChanges, keepConfirmedRows, parseProfileFit, profileFitPrompt,
  profileFitRefreshPrompt, profileFitSchema, sameRequirements,
} from '@/lib/profileFit'
import {
  contentHash, fitBasisFields, readWorkspace, updateWorkspace, workspaceInputs,
  type ApplicationWorkspace, WorkspaceRevisionConflict,
} from '@/lib/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  let run: RunRecorder | null = null
  try {
    const body = await req.json().catch(() => ({})) as { skillId?: unknown }
    const inputs = await workspaceInputs(key)
    if (!inputs.analysis || !inputs.masterYaml) throw new Error('job analysis and master resume are required')
    const skillId = typeof body.skillId === 'string' ? body.skillId : 'profile-fit'
    const [skill, engine] = await Promise.all([getSkillForRunner(skillId, 'profile-fit'), getEngine('job-analysis')])
    // Background work must not compete with draft autosaves for a client-held
    // revision. Claim the job from the latest server state and make duplicate
    // Strict Mode / Fast Refresh requests harmless.
    let current = await readWorkspace(key)
    if (current.fit.status === 'running' || current.fit.status === 'ready') {
      return NextResponse.json({ workspace: current })
    }
    let workspace: ApplicationWorkspace
    try {
      workspace = await updateWorkspace(key, current.revision, markRunning)
    } catch (error) {
      if (!(error instanceof WorkspaceRevisionConflict)) throw error
      current = await readWorkspace(key)
      if (current.fit.status === 'running' || current.fit.status === 'ready') {
        return NextResponse.json({ workspace: current })
      }
      workspace = await updateWorkspace(key, current.revision, markRunning)
    }
    // Reuse the report the candidate has been correcting whenever it assessed
    // this same requirement list; only a changed job description starts over.
    const previous = workspace.fit.report && sameRequirements(workspace.fit.report, inputs.analysis) ? workspace.fit.report : null
    const basis = workspace.fit.basis ?? null
    const changes = previous && basis && basis.jdHash === contentHash(inputs.jd)
      ? fitInputChanges(basis, { master: inputs.masterYaml, guidance: inputs.guidance })
      : null
    if (previous && changes && !hasFitInputChanges(changes)) {
      workspace = await updateLatest(key, (latest) => ({
        ...latest, fit: { ...latest.fit, ...fitBasisFields(inputs), status: 'ready', error: null },
      }))
      return NextResponse.json({ workspace })
    }
    run = await startSkillRun({
      feature: 'profile-fit', skill, engine: engine.id, applicationKey: key,
      inputSummary: { requirements: inputs.analysis.requirements.length, mode: previous ? 'refresh' : 'full' },
    })
    const status = await engine.status()
    if (!status.ok) throw new Error(status.reason ?? `${engine.id} is unavailable`)
    const raw = await engine.runStructured<unknown>({
      prompt: previous
        ? profileFitRefreshPrompt(skill.instructions, inputs.analysis, inputs.masterYaml, inputs.guidance, previous, changes)
        : profileFitPrompt(skill.instructions, inputs.analysis, inputs.masterYaml, inputs.guidance),
      schema: profileFitSchema,
      signal: req.signal,
    })
    let report = parseProfileFit(raw, inputs.analysis)
    if (previous) report = keepConfirmedRows(report, previous, !!changes?.guidance.removed.length)
    await run.complete({ verdict: report.verdict, coverage: report.coverage })
    workspace = await updateLatest(key, (latest) => {
      // A correction saved from the analysis chat while this ran already
      // reflects the current inputs; it wins over the background result.
      if (JSON.stringify(latest.fit.report) !== JSON.stringify(workspace.fit.report)) {
        return { ...latest, fit: { ...latest.fit, status: 'ready', error: null } }
      }
      return {
        ...latest, fit: { ...latest.fit, ...fitBasisFields(inputs), status: 'ready', report, runId: run!.id, error: null, completedAt: new Date().toISOString() },
      }
    })
    return NextResponse.json({ workspace })
  } catch (error) {
    const message = (error as Error).message
    if (run) await run.fail(message).catch(() => {})
    try {
      await updateLatest(key, (workspace) => ({
        ...workspace, fit: { ...workspace.fit, status: 'error', runId: run?.id ?? workspace.fit.runId, error: message },
      }))
    } catch {}
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

function markRunning(current: ApplicationWorkspace): ApplicationWorkspace {
  return { ...current, fit: { ...current.fit, status: 'running', error: null, startedAt: new Date().toISOString() } }
}

async function updateLatest(
  key: string,
  mutate: (workspace: ApplicationWorkspace) => ApplicationWorkspace,
): Promise<ApplicationWorkspace> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readWorkspace(key)
    try { return await updateWorkspace(key, current.revision, mutate) } catch (error) {
      if (!(error instanceof WorkspaceRevisionConflict) || attempt === 3) throw error
    }
  }
  throw new Error('could not update fit state')
}
