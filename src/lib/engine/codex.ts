import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { PATHS } from '../paths'
import { probeVersion } from './spawn'
import { runCodexAppServer } from './codexAppServer'
import {
  CLI_DEFAULT,
  EngineError,
  type Engine,
  type EngineStatus,
  type ModelOption,
  type RunOptions,
} from './types'

/**
 * Codex CLI as the LLM engine.
 *
 * Auth comes from `codex login` against the ChatGPT subscription. Calls use the
 * local app-server protocol so structured output and live deltas can coexist.
 */

const BIN = process.env.CAREER_OPS_CODEX_BIN || 'codex'
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex')

/**
 * Codex refreshes `models_cache.json` itself, so the catalog tracks the account
 * rather than a list hardcoded here that would go stale. `visibility` is the
 * CLI's own pick-list flag — hidden entries are internal.
 */
async function cachedModels(): Promise<ModelOption[]> {
  try {
    const cache = JSON.parse(await readFile(join(CODEX_HOME, 'models_cache.json'), 'utf-8'))
    if (!Array.isArray(cache?.models)) return []
    return cache.models
      .filter((m: Record<string, unknown>) => typeof m?.slug === 'string' && m.slug && m.visibility !== 'hide')
      .sort((a: Record<string, number>, b: Record<string, number>) => (a.priority ?? 99) - (b.priority ?? 99))
      .map((m: Record<string, string>) => ({
        id: m.slug,
        label: m.display_name || m.slug,
        note: m.description,
      }))
  } catch {
    return []
  }
}

export const codexEngine: Engine = {
  id: 'codex',
  // Codex has always run on whatever `~/.codex/config.toml` names; keep that.
  defaultModel: '',

  async models(): Promise<ModelOption[]> {
    return [CLI_DEFAULT, ...(await cachedModels())]
  },

  async status(): Promise<EngineStatus> {
    const version = await probeVersion(BIN)
    return version
      ? { id: 'codex', ok: true, version }
      : { id: 'codex', ok: false, reason: `\`${BIN}\` not found on PATH. Install Codex CLI and run \`codex login\`.` }
  },

  async runStructured<T>({ prompt, schema, cwd, signal, onEvent, model, thread }: RunOptions): Promise<T> {
    onEvent?.({ type: 'start', message: `Asking Codex${model ? ` (${model})` : ''}…` })

    const result = await runCodexAppServer({
      prompt,
      outputSchema: schema,
      model,
      cwd: cwd ?? PATHS.root,
      sandbox: 'read-only',
      signal,
      threadId: thread?.id,
      persist: !!thread,
      onReasoning: (message) => onEvent?.({ type: 'reasoning', message }),
      onActivity: (message) => onEvent?.({ type: 'progress', message }),
    })
    if (thread) thread.id = result.threadId
    const raw = result.text.trim()
    if (!raw) throw new EngineError('codex produced no output', 'codex')

    try {
      onEvent?.({ type: 'done' })
      return JSON.parse(raw) as T
    } catch {
      throw new EngineError('codex returned output that was not JSON', 'codex', raw.slice(0, 2000))
    }
  },
}
