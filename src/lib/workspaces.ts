import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { getApplication, readDoc } from './applications'
import { APP_FILES, PATHS } from './paths'
import { jdAnalysisParser, type JdAnalysis } from './tailoring/jd'
import type { Op } from './tailoring/ops'
import type { RequirementAction } from './tailoring/rules'
import type { ProfileFitReport } from './profileFit'
import { withTailoredDesign } from './tailoring/seed'
import { generalApplicationSchema, type GeneralApplication } from './generalApplication'

const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const VERSION = 1
const writes = new Map<string, Promise<unknown>>()

export type FitJobStatus = 'idle' | 'queued' | 'running' | 'ready' | 'error'

export interface WorkspaceProposal {
  id: string
  kind: 'tailoring' | 'assistant'
  createdAt: string
  beforeYaml: string
  /** Stable master-resume snapshot that the audited operations target. */
  operationBaseYaml?: string
  currentYaml: string
  ops: Op[]
  requirementActions: RequirementAction[]
  choices: boolean[]
  render: { pages: number | null; fill: number | null }
  runId: string | null
}

export interface ApplicationWorkspace {
  version: 1
  general?: boolean
  generalDetails?: GeneralApplication | null
  applicationKey: string
  revision: number
  createdAt: string
  updatedAt: string
  appliedAt: string | null
  draftYaml: string
  acceptedBaseHash: string
  pendingProposal: WorkspaceProposal | null
  fit: {
    status: FitJobStatus
    report: ProfileFitReport | null
    runId: string | null
    error: string | null
    jdHash: string
    masterHash: string
    startedAt: string | null
    completedAt: string | null
  }
}

export class WorkspaceRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`workspace changed: expected revision ${expected}, found ${actual}`)
    this.name = 'WorkspaceRevisionConflict'
  }
}

export function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function workspaceInputs(key: string): Promise<{
  analysis: JdAnalysis | null; jd: string; masterYaml: string; acceptedYaml: string; general: boolean; generalDetails: GeneralApplication | null
}> {
  const app = await getApplication(key)
  if (!app) throw new Error('application not found')
  const folder = app.folder?.folder
  const yamlName = app.folder?.docs.find((doc) => doc.key === 'yaml')?.name
  const [jd, analysisText, acceptedYaml] = folder ? await Promise.all([
    readDoc(folder, APP_FILES.jd), readDoc(folder, APP_FILES.analysis),
    yamlName ? readDoc(folder, yamlName) : Promise.resolve(null),
  ]) : [null, null, null]
  let analysis: JdAnalysis | null = null
  if (analysisText) {
    const parsed = jdAnalysisParser.safeParse(JSON.parse(analysisText))
    if (parsed.success) analysis = parsed.data
  }
  let masterYaml = ''
  const metadata = folder ? await readDoc(folder, APP_FILES.general) : null
  const general = metadata ? generalApplicationSchema.parse(JSON.parse(metadata)) : null
  try { masterYaml = await readFile(general ? PATHS.ownCv[general.language] : PATHS.masters[analysis?.language ?? 'en'], 'utf-8') } catch {}
  return { analysis, jd: jd ?? '', masterYaml, acceptedYaml: acceptedYaml ?? masterYaml, general: !!general, generalDetails: general }
}

export async function readWorkspace(key: string): Promise<ApplicationWorkspace> {
  assertKey(key)
  try {
    const record = JSON.parse(await readFile(workspacePath(key), 'utf-8')) as ApplicationWorkspace
    if (record.version !== VERSION || record.applicationKey !== key) throw new Error('invalid workspace record')
    const inputs = await workspaceInputs(key)
    const refreshed = refreshFitState(record, inputs)
    if (!refreshed.pendingProposal && !inputs.general) {
      refreshed.draftYaml = await withTailoredDesign(refreshed.draftYaml, inputs.analysis?.paperSize ?? 'a4')
    }
    return refreshed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return createWorkspace(key)
  }
}

export async function createWorkspace(key: string): Promise<ApplicationWorkspace> {
  assertKey(key)
  const inputs = await workspaceInputs(key)
  const now = new Date().toISOString()
  const canFit = !!inputs.analysis && !!inputs.masterYaml
  const draftYaml = inputs.general ? inputs.acceptedYaml : await withTailoredDesign(inputs.acceptedYaml, inputs.analysis?.paperSize ?? 'a4')
  const record: ApplicationWorkspace = {
    version: VERSION, general: inputs.general, applicationKey: key, revision: 1, createdAt: now, updatedAt: now, appliedAt: null,
    draftYaml, generalDetails: inputs.generalDetails, acceptedBaseHash: contentHash(draftYaml), pendingProposal: null,
    fit: {
      status: canFit ? 'queued' : 'idle', report: null, runId: null, error: null,
      jdHash: contentHash(inputs.jd), masterHash: contentHash(inputs.masterYaml), startedAt: null, completedAt: null,
    },
  }
  await mkdir(PATHS.workspaces, { recursive: true })
  await atomicWrite(workspacePath(key), record)
  return record
}

function refreshFitState(record: ApplicationWorkspace, inputs: Awaited<ReturnType<typeof workspaceInputs>>): ApplicationWorkspace {
  const jdHash = contentHash(inputs.jd)
  const masterHash = contentHash(inputs.masterYaml)
  const staleRun = record.fit.status === 'running' && !!record.fit.startedAt
    && Date.now() - Date.parse(record.fit.startedAt) > 10 * 60_000
  const revisionFailure = record.fit.status === 'error' && record.fit.error?.startsWith('workspace changed: expected revision')
  if (record.fit.jdHash !== jdHash || record.fit.masterHash !== masterHash || staleRun || revisionFailure) {
    return {
      ...record,
      fit: {
        ...record.fit, status: inputs.analysis && inputs.masterYaml ? 'queued' : 'idle',
        error: staleRun ? 'The previous fit run was interrupted and can be retried.' : null,
        jdHash, masterHash, startedAt: null,
      },
    }
  }
  return record
}

export async function updateWorkspace(
  key: string,
  expectedRevision: number,
  mutate: (current: ApplicationWorkspace) => ApplicationWorkspace,
): Promise<ApplicationWorkspace> {
  return withWrite(key, async () => {
    const current = await readWorkspace(key)
    if (current.revision !== expectedRevision) throw new WorkspaceRevisionConflict(expectedRevision, current.revision)
    const now = new Date().toISOString()
    const next = { ...mutate(structuredClone(current)), version: VERSION, applicationKey: key, revision: current.revision + 1, updatedAt: now } as ApplicationWorkspace
    await mkdir(PATHS.workspaces, { recursive: true })
    await atomicWrite(workspacePath(key), next)
    return next
  })
}

export function makeProposal(input: Omit<WorkspaceProposal, 'id' | 'createdAt' | 'choices'>): WorkspaceProposal {
  return { ...input, id: randomUUID(), createdAt: new Date().toISOString(), choices: input.ops.map(() => true) }
}

function assertKey(key: string): void {
  if (!KEY.test(key)) throw new Error('invalid application key')
}

function workspacePath(key: string): string {
  assertKey(key)
  return join(PATHS.workspaces, `${key}.json`)
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  await rename(temp, path)
}

async function withWrite<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const prior = writes.get(key) ?? Promise.resolve()
  const result = prior.catch(() => {}).then(operation)
  writes.set(key, result)
  try { return await result } finally { if (writes.get(key) === result) writes.delete(key) }
}
