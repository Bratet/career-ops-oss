import { appendFile, mkdir, readFile, readdir, rename, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { PATHS } from '../paths'
import type { EngineId } from '../engine/types'
import type { SkillDocument, SkillRunner } from './types'

export type SkillRunStatus = 'running' | 'complete' | 'failed'

export interface SkillRunSummary {
  id: string
  feature: string
  skillId: string
  skillName: string
  skillVersion: number
  runner: SkillRunner
  engine: EngineId
  applicationKey: string | null
  status: SkillRunStatus
  startedAt: string
  completedAt: string | null
  inputSummary: Record<string, string | number | boolean | null>
  error: string | null
}

export interface SkillRunEvent {
  at: string
  type: string
  message?: string
  data?: unknown
}

export interface SkillRunDetail extends SkillRunSummary {
  events: SkillRunEvent[]
  result: unknown
}

export interface RunRecorder {
  id: string
  event(type: string, message?: string, data?: unknown): void
  complete(result: unknown): Promise<void>
  fail(error: string): Promise<void>
}

const RUN_ID = /^\d{8}T\d{6}-[a-f0-9]{8}$/

export async function startSkillRun(opts: {
  feature: string
  skill: SkillDocument
  engine: EngineId
  applicationKey?: string | null
  inputSummary?: SkillRunSummary['inputSummary']
  /** Tests may isolate run storage; production always uses PATHS.runs. */
  root?: string
}): Promise<RunRecorder> {
  const now = new Date()
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15)
  const id = `${stamp}-${randomUUID().replace(/-/g, '').slice(0, 8)}`
  const dir = runDir(id, opts.root)
  await mkdir(dir, { recursive: true })

  let metadata: SkillRunSummary = {
    id,
    feature: opts.feature,
    skillId: opts.skill.metadata.id,
    skillName: opts.skill.metadata.name,
    skillVersion: opts.skill.metadata.version,
    runner: opts.skill.metadata.runner,
    engine: opts.engine,
    applicationKey: opts.applicationKey ?? null,
    status: 'running',
    startedAt: now.toISOString(),
    completedAt: null,
    inputSummary: opts.inputSummary ?? {},
    error: null,
  }
  await writeJson(join(dir, 'metadata.json'), metadata)

  // Event calls deliberately do not make UI progress wait on disk. The queue
  // preserves order and complete/fail flush it before finalizing metadata.
  let queue = Promise.resolve()
  const event = (type: string, message?: string, data?: unknown) => {
    const row: SkillRunEvent = { at: new Date().toISOString(), type, ...(message ? { message } : {}), ...(data === undefined ? {} : { data }) }
    queue = queue.then(() => appendFile(join(dir, 'events.ndjson'), `${JSON.stringify(row)}\n`, 'utf-8'))
  }

  let finalized = false
  const finish = async (status: 'complete' | 'failed', result: unknown, error: string | null) => {
    if (finalized) return
    finalized = true
    await queue
    if (result !== undefined) await writeJson(join(dir, 'result.json'), result)
    metadata = { ...metadata, status, completedAt: new Date().toISOString(), error }
    await writeJson(join(dir, 'metadata.json'), metadata)
  }

  return {
    id,
    event,
    complete: (result) => finish('complete', result, null),
    fail: (error) => finish('failed', undefined, error),
  }
}

export async function listSkillRuns(opts: { applicationKey?: string; limit?: number; root?: string } = {}): Promise<SkillRunSummary[]> {
  let ids: string[]
  try {
    ids = await readdir(opts.root ?? PATHS.runs)
  } catch {
    return []
  }

  const rows = await Promise.all(ids.filter((id) => RUN_ID.test(id)).map(async (id) => {
    try {
      return JSON.parse(await readFile(join(runDir(id, opts.root), 'metadata.json'), 'utf-8')) as SkillRunSummary
    } catch {
      return null
    }
  }))
  return rows
    .filter((run): run is SkillRunSummary => !!run && (!opts.applicationKey || run.applicationKey === opts.applicationKey))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, opts.limit ?? 100)
}

export async function getSkillRun(id: string, root?: string): Promise<SkillRunDetail> {
  const dir = runDir(id, root)
  const metadata = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf-8')) as SkillRunSummary
  let events: SkillRunEvent[] = []
  let result: unknown = null
  try {
    events = (await readFile(join(dir, 'events.ndjson'), 'utf-8'))
      .split('\n').filter(Boolean).map((line) => JSON.parse(line) as SkillRunEvent)
  } catch {}
  try {
    result = JSON.parse(await readFile(join(dir, 'result.json'), 'utf-8'))
  } catch {}
  return { ...metadata, events, result }
}

/** Attach a pre-creation analysis run once its application folder has an ID. */
export async function attachSkillRunToApplication(id: string, applicationKey: string, root?: string): Promise<void> {
  if (!applicationKey.trim()) throw new Error('application key is required')
  const path = join(runDir(id, root), 'metadata.json')
  const metadata = JSON.parse(await readFile(path, 'utf-8')) as SkillRunSummary
  await writeJson(path, { ...metadata, applicationKey: applicationKey.trim() })
}

function runDir(id: string, root = PATHS.runs): string {
  if (!RUN_ID.test(id)) throw new Error('invalid run id')
  return join(root, id)
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  await rename(temp, path)
}
