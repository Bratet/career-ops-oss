import { readFile, writeFile, rename } from 'fs/promises'
import { PATHS } from '../paths'
import { claudeEngine } from './claude'
import { codexEngine } from './codex'
import type { Engine, EngineId, EngineStatus, ModelOption } from './types'

export * from './types'

const ENGINES: Record<EngineId, Engine> = {
  claude: claudeEngine,
  codex: codexEngine,
}

export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[]
// Parsing the posting and assessing profile fit share the job-analysis choice.
export const AI_FEATURES = ['job-analysis', 'tailoring', 'editor-chat'] as const
export type AiFeature = typeof AI_FEATURES[number]

export interface FeatureEngineSettings {
  engine: EngineId
  /** Model choice per CLI for this feature, so switching away and back is lossless. */
  models: Partial<Record<EngineId, string>>
}

export interface Settings {
  features: Record<AiFeature, FeatureEngineSettings>
}

const DEFAULT_CHOICE: FeatureEngineSettings = { engine: 'claude', models: {} }
let settingsWrite = Promise.resolve()

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && value in ENGINES
}

export function isAiFeature(value: unknown): value is AiFeature {
  return typeof value === 'string' && AI_FEATURES.includes(value as AiFeature)
}

/**
 * Read per-feature preferences and transparently import the former global shape.
 * Expanding legacy settings in memory keeps existing installs stable without
 * rewriting user configuration merely because the app was opened. Obsolete
 * profile-fit preferences are ignored in favor of the visible job-analysis choice.
 */
export async function readSettings(): Promise<Settings> {
  let saved: unknown = {}
  try { saved = JSON.parse(await readFile(PATHS.settings, 'utf-8')) } catch { /* defaults */ }
  return parseSettings(saved)
}

export function parseSettings(value: unknown): Settings {
  const saved = isRecord(value) ? value : {}
  const legacy: FeatureEngineSettings = {
    engine: isEngineId(saved.engine) ? saved.engine : DEFAULT_CHOICE.engine,
    models: readModels(saved.models),
  }
  const rawFeatures = isRecord(saved.features) ? saved.features : {}
  const features = Object.fromEntries(AI_FEATURES.map((feature) => {
    const raw = isRecord(rawFeatures[feature]) ? rawFeatures[feature] : null
    return [feature, {
      engine: isEngineId(raw?.engine) ? raw.engine : legacy.engine,
      models: raw ? readModels(raw.models) : { ...legacy.models },
    } satisfies FeatureEngineSettings]
  })) as Record<AiFeature, FeatureEngineSettings>

  return { features }
}

export function patchFeatureSettings(
  settings: Settings,
  feature: AiFeature,
  patch: { engine?: EngineId; model?: string },
): Settings {
  const current = structuredClone(settings)
  const choice = current.features[feature]
  const targetEngine = patch.engine ?? choice.engine
  current.features[feature] = {
    engine: targetEngine,
    models: patch.model === undefined
      ? { ...choice.models }
      : { ...choice.models, [targetEngine]: patch.model },
  }
  return current
}

export async function writeFeatureSettings(
  feature: AiFeature,
  patch: { engine?: EngineId; model?: string },
): Promise<Settings> {
  let saved!: Settings
  const operation = settingsWrite.then(async () => {
    saved = patchFeatureSettings(await readSettings(), feature, patch)
    const temp = `${PATHS.settings}.tmp-${process.pid}`
    await writeFile(temp, `${JSON.stringify(saved, null, 2)}\n`, 'utf-8')
    await rename(temp, PATHS.settings)
  })
  settingsWrite = operation.catch(() => {})
  await operation
  return saved
}

export function modelFor(choice: FeatureEngineSettings, engine: EngineId): string {
  return choice.models[engine] ?? ENGINES[engine].defaultModel
}

/** Resolve exactly one task's configured CLI and model. */
export async function getEngine(feature: AiFeature): Promise<Engine> {
  const settings = await readSettings()
  const choice = settings.features[feature]
  const base = ENGINES[choice.engine]
  const model = modelFor(choice, choice.engine)
  return {
    ...base,
    runStructured: (opts) => base.runStructured({ ...opts, model: opts.model ?? model }),
  }
}

export function engineById(id: EngineId): Engine {
  return ENGINES[id]
}

export async function allStatuses(): Promise<EngineStatus[]> {
  return Promise.all(Object.values(ENGINES).map((engine) => engine.status()))
}

export async function allModels(): Promise<Record<EngineId, ModelOption[]>> {
  const entries = await Promise.all(ENGINE_IDS.map(async (id) => [id, await ENGINES[id].models()] as const))
  return Object.fromEntries(entries) as Record<EngineId, ModelOption[]>
}

function readModels(value: unknown): Partial<Record<EngineId, string>> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(ENGINE_IDS.flatMap((id) => typeof value[id] === 'string' ? [[id, value[id]]] : []))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
