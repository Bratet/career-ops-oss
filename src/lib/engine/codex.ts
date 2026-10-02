import { PATHS } from '../paths'
import { probeVersion } from './spawn'
import { runCodexAppServer } from './codexAppServer'
import { codexModels, resolveCodexModel } from './codexModels'
import {
  EngineError,
  type Engine,
  type EngineStatus,
  type RunOptions,
} from './types'

/**
 * Codex CLI as the LLM engine.
 *
 * Auth comes from `codex login` against the ChatGPT subscription. Calls use the
 * local app-server protocol so structured output and live deltas can coexist.
 */

const BIN = process.env.CAREER_OPS_CODEX_BIN || 'codex'

export const codexEngine: Engine = {
  id: 'codex',
  // Empty resolves to the top of the catalog; see resolveCodexModel.
  defaultModel: '',

  models: codexModels,

  async status(): Promise<EngineStatus> {
    const version = await probeVersion(BIN)
    return version
      ? { id: 'codex', ok: true, version }
      : { id: 'codex', ok: false, reason: `\`${BIN}\` not found on PATH. Install Codex CLI and run \`codex login\`.` }
  },

  async runStructured<T>({ prompt, schema, cwd, signal, onEvent, model: chosen, thread }: RunOptions): Promise<T> {
    const model = await resolveCodexModel(chosen ?? '')
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
