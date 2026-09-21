import { writeFile } from 'fs/promises'
import { join } from 'path'
import { APP_FILES, PATHS, type Lang } from '../paths'
import { getApplication, readDoc } from '../applications'
import type { Engine } from '../engine'
import { EngineError } from '../engine/types'
import { jdAnalysisParser, jdAnalysisSchema, jdPrompt, type JdAnalysis } from './jd'
import { getSkillForRunner } from '../skills/registry'

/**
 * Everything a tailoring pass needs about one application, gathered from disk.
 *
 * The analysis is the awkward part: folders created before jd-analysis.json
 * existed (all 40 historical ones) have the posting but not the structure. Those
 * get it derived from jd.md once and cached, so the cost lands on the first
 * Tailor click for that folder and never again.
 */

export interface TailorContext {
  dir: string
  folder: string
  analysis: JdAnalysis
  /** The tailored YAML's real filename; the historical folders do not all use the canonical one. */
  yamlName: string
  notesName: string
  lang: Lang
}

export class ContextError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export async function loadContext(
  key: string,
  engine: Engine,
  onProgress?: (message: string) => void,
): Promise<TailorContext> {
  const app = await getApplication(key)
  if (!app?.folder) throw new ContextError('no folder for this application', 404)

  const folder = app.folder.folder
  const dir = join(PATHS.applications, folder)
  const yamlName = app.folder.docs.find((d) => d.key === 'yaml')?.name ?? APP_FILES.yaml
  const notesName = app.folder.docs.find((d) => d.key === 'notes')?.name ?? APP_FILES.notes

  const analysis = await loadAnalysis(folder, dir, engine, onProgress)
  return { dir, folder, analysis, yamlName, notesName, lang: analysis.language === 'fr' ? 'fr' : 'en' }
}

async function loadAnalysis(
  folder: string,
  dir: string,
  engine: Engine,
  onProgress?: (message: string) => void,
): Promise<JdAnalysis> {
  const cached = await readDoc(folder, APP_FILES.analysis)
  if (cached) {
    const raw = JSON.parse(cached)
    const parsed = jdAnalysisParser.safeParse(raw)
    if (parsed.success && hasExplicitRanking(raw)) return parsed.data
    // A malformed or pre-ranking cache is worth replacing rather than failing
    // or pretending original posting order is a deliberate priority decision.
  }

  const jd = await readDoc(folder, APP_FILES.jd)
  if (!jd || jd.trim().length < 40) {
    throw new ContextError(
      `${folder} has no usable ${APP_FILES.jd}. The posting is what tailoring argues against, so it has to be there.`,
    )
  }

  onProgress?.('reading the archived posting (this folder predates the stored analysis)')
  const skill = await getSkillForRunner('analyze-job', 'job-analysis')
  const raw = await engine.runStructured<unknown>({ prompt: jdPrompt(jd, skill.instructions), schema: jdAnalysisSchema })
  const parsed = jdAnalysisParser.safeParse(raw)
  if (!parsed.success) {
    throw new ContextError(`${engine.id} returned an unexpected shape: ${parsed.error.issues[0]?.message}`)
  }

  await writeFile(join(dir, APP_FILES.analysis), JSON.stringify(parsed.data, null, 2) + '\n', 'utf-8')
  return parsed.data
}

function hasExplicitRanking(raw: unknown): boolean {
  const requirements = (raw as { requirements?: unknown })?.requirements
  return Array.isArray(requirements) && requirements.every((requirement) => {
    const row = requirement as { rank?: unknown; priorityReason?: unknown }
    return Number.isInteger(row.rank) && (row.rank as number) > 0 && typeof row.priorityReason === 'string' && row.priorityReason.trim().length > 0
  })
}

/** One readable line out of whatever the pass threw. Shared by both routes. */
export function describe(err: unknown): string {
  if (err instanceof ContextError) return err.message
  if (err instanceof EngineError) {
    const tail = err.stderr?.split('\n').filter(Boolean).slice(-1)[0]
    return tail ? `${err.message} — ${tail}` : err.message
  }
  return (err as Error).message
}
