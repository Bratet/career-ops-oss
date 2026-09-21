export type EngineId = 'claude' | 'codex'

export interface EngineStatus {
  id: EngineId
  ok: boolean
  version?: string
  reason?: string
}

/**
 * A model the engine's CLI will accept behind `--model`. The empty id means
 * "pass no flag" — whatever the CLI is configured to use itself.
 */
export interface ModelOption {
  id: string
  label: string
  note?: string
}

export const CLI_DEFAULT: ModelOption = {
  id: '',
  label: 'CLI default',
  note: 'Whatever the CLI is already configured to use',
}

/** `--model <id>`, or nothing at all for the CLI's own default. */
export function modelArgs(model: string | undefined): string[] {
  return model ? ['--model', model] : []
}

export interface EngineEvent {
  type: 'start' | 'progress' | 'reasoning' | 'text' | 'done' | 'error'
  message?: string
  data?: unknown
}

/**
 * Mutable handle for a short-lived CLI conversation.
 *
 * Callers keep this object for a multi-pass task. Each adapter fills in the
 * native Claude/Codex thread id after the first turn and resumes that exact
 * agent on later turns. Nothing is persisted by the app once the task ends.
 */
export interface EngineThread {
  id: string | null
}

export interface RunOptions {
  prompt: string
  /** JSON Schema the result must satisfy. */
  schema: object
  cwd?: string
  signal?: AbortSignal
  onEvent?: (e: EngineEvent) => void
  /** Model id for this call. Defaults to the one saved in settings. */
  model?: string
  /** Resume the same native CLI agent across an iterative workflow. */
  thread?: EngineThread
  /** Ask the CLI for safe, user-facing decision notes and stream them. */
  streamSummary?: boolean
}

export interface Engine {
  id: EngineId
  /** Used when nothing is saved for this engine yet. */
  defaultModel: string
  /** What the local CLI says it can run, newest first. */
  models(): Promise<ModelOption[]>
  status(): Promise<EngineStatus>
  runStructured<T>(opts: RunOptions): Promise<T>
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly engine: EngineId,
    readonly stderr?: string,
  ) {
    super(message)
    this.name = 'EngineError'
  }
}
