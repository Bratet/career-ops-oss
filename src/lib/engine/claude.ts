import { readFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { join } from 'path'
import { PATHS } from '../paths'
import { runCli, probeVersion } from './spawn'
import {
  CLI_DEFAULT,
  EngineError,
  modelArgs,
  type Engine,
  type EngineStatus,
  type ModelOption,
  type RunOptions,
} from './types'

/**
 * Claude Code as the LLM engine.
 *
 * Auth comes from `claude login` — the Pro/Max subscription session, not an API
 * key. Nothing here reads ANTHROPIC_API_KEY, and it must not: setting one would
 * silently switch to metered billing.
 */

const BIN = process.env.CAREER_OPS_CLAUDE_BIN || 'claude'

/**
 * Family aliases follow the CLI's recommended version; full IDs pin a version.
 * Availability still depends on the signed-in account and CLI version.
 * https://code.claude.com/docs/en/model-config
 */
const BUILT_IN: ModelOption[] = [
  { id: 'opus', label: 'Opus (CLI recommended)', note: 'Follows the CLI’s recommended Opus version' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-opus-4-5-20251101', label: 'Opus 4.5' },
  { id: 'sonnet', label: 'Sonnet (CLI recommended)', note: 'Follows the CLI’s recommended Sonnet version' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
  { id: 'haiku', label: 'Haiku (CLI recommended)', note: 'Follows the CLI’s recommended Haiku version' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
]

/**
 * Anything extra the account has access to, as the CLI itself last saw it.
 * Read-only and best-effort: a missing or reshaped file falls back to the
 * built-in catalog above.
 */
async function extraModels(): Promise<ModelOption[]> {
  try {
    const raw = await readFile(join(homedir(), '.claude.json'), 'utf-8')
    const cache = JSON.parse(raw)?.additionalModelOptionsCache
    if (!Array.isArray(cache)) return []
    return cache
      .filter((m) => typeof m?.value === 'string' && m.value)
      .map((m) => ({
        id: m.value as string,
        label: typeof m.label === 'string' && m.label ? m.label : (m.value as string),
        note: typeof m.description === 'string' ? m.description : undefined,
      }))
  } catch {
    return []
  }
}

export const claudeEngine: Engine = {
  id: 'claude',
  defaultModel: 'opus',

  async models(): Promise<ModelOption[]> {
    const extra = await extraModels()
    const seen = new Set<string>()
    return [...BUILT_IN, ...extra, CLI_DEFAULT].filter((model) => {
      if (seen.has(model.id)) return false
      seen.add(model.id)
      return true
    })
  },

  async status(): Promise<EngineStatus> {
    const version = await probeVersion(BIN)
    return version
      ? { id: 'claude', ok: true, version }
      : { id: 'claude', ok: false, reason: `\`${BIN}\` not found on PATH. Install Claude Code and run \`claude login\`.` }
  },

  async runStructured<T>({ prompt, schema, cwd, signal, onEvent, model, thread, streamSummary }: RunOptions): Promise<T> {
    onEvent?.({ type: 'start', message: `Asking Claude${model ? ` (${model})` : ''}…` })

    const existingThread = thread?.id ?? null
    const threadId = existingThread ?? (thread ? randomUUID() : null)
    const streamState: { envelope: ClaudeResult<T> | null } = { envelope: null }
    const parser = createJsonlParser((event) => {
      if (event.type === 'result') streamState.envelope = event as ClaudeResult<T>

      // This is Claude's ordinary assistant text, not a hidden thinking block.
      // The prompt asks for a concise user-facing decision summary before the
      // StructuredOutput tool, which makes the tailoring chat genuinely live.
      const delta = textDelta(event)
      if (streamSummary && delta) onEvent?.({ type: 'reasoning', message: delta })

      if (structuredOutputStarted(event)) {
        onEvent?.({ type: 'progress', message: 'Claude is finalizing a validated proposal…' })
      }
    })

    const { code, stdout, stderr } = await runCli(
      BIN,
      [
        '-p', streamSummary
          ? `${prompt}\n\nBefore calling StructuredOutput, write a concise user-facing summary of the evidence and page-fit decision you made. Do not reveal private chain-of-thought.`
          : prompt,
        '--output-format', 'stream-json',
        '--include-partial-messages',
        '--verbose',
        '--json-schema', JSON.stringify(schema),
        ...modelArgs(model),
        // Analysis only. The app writes every file itself; the model never does.
        '--permission-mode', 'plan',
        '--add-dir', cwd ?? PATHS.root,
        ...(threadId ? (existingThread ? ['--resume', threadId] : ['--session-id', threadId]) : []),
      ],
      { cwd: cwd ?? PATHS.root, signal, onStdout: parser.push },
    )
    parser.flush()

    if (code !== 0) throw new EngineError(`claude exited ${code}`, 'claude', stderr.slice(0, 2000))

    const envelope = streamState.envelope
    if (!envelope) throw new EngineError('claude returned no final result event', 'claude', stdout.slice(-2000))

    if (envelope.is_error) {
      throw new EngineError(`claude reported an error (${envelope.subtype ?? 'unknown'})`, 'claude', envelope.result)
    }

    if (thread) thread.id = envelope.session_id ?? threadId

    // structured_output is the validated object; `result` is the same thing as a
    // string. Prefer the former and fall back only if the schema path was skipped.
    const out = envelope.structured_output ?? (envelope.result ? (JSON.parse(envelope.result) as T) : null)
    if (!out) throw new EngineError('claude returned no structured output', 'claude', stdout.slice(0, 1000))

    onEvent?.({ type: 'done' })
    return out
  },
}

interface ClaudeResult<T> extends Record<string, unknown> {
  type: 'result'
  session_id?: string
  structured_output?: T
  result?: string
  is_error?: boolean
  subtype?: string
}

function createJsonlParser(onEvent: (event: Record<string, unknown>) => void) {
  let buffer = ''
  const parseLine = (line: string) => {
    if (!line.trim()) return
    try { onEvent(JSON.parse(line) as Record<string, unknown>) } catch { /* CLI diagnostics are not events */ }
  }
  return {
    push(chunk: string) {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) parseLine(line)
    },
    flush() {
      parseLine(buffer)
      buffer = ''
    },
  }
}

function textDelta(event: Record<string, unknown>): string | null {
  if (event.type !== 'stream_event') return null
  const streamEvent = asRecord(event.event)
  const delta = asRecord(streamEvent?.delta)
  return streamEvent?.type === 'content_block_delta' && delta?.type === 'text_delta' && typeof delta.text === 'string'
    ? delta.text
    : null
}

function structuredOutputStarted(event: Record<string, unknown>): boolean {
  if (event.type !== 'stream_event') return false
  const streamEvent = asRecord(event.event)
  const block = asRecord(streamEvent?.content_block)
  return streamEvent?.type === 'content_block_start' && block?.type === 'tool_use' && block.name === 'StructuredOutput'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}
