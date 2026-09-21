import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'

const BIN = process.env.CAREER_OPS_CODEX_BIN || 'codex'

export interface CodexAppServerResult {
  text: string
  threadId: string
}

/**
 * Run one Codex turn through app-server so the UI receives genuine message and
 * reasoning-summary deltas. `codex exec --json` only emits completed messages.
 */
export function runCodexAppServer(opts: {
  prompt: string
  cwd: string
  model?: string
  outputSchema?: object
  threadId?: string | null
  persist?: boolean
  sandbox: 'read-only' | 'workspace-write'
  signal?: AbortSignal
  onDelta?: (text: string) => void
  onReasoning?: (text: string) => void
  onActivity?: (text: string) => void
}): Promise<CodexAppServerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, ['app-server', '--stdio'], {
      cwd: opts.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams

    let stdoutBuffer = ''
    let stderr = ''
    let threadId = opts.threadId ?? null
    let streamedText = ''
    let completedText = ''
    let settled = false
    const timer = setTimeout(() => fail(new Error('Codex app-server timed out')), 900_000)

    const send = (message: Record<string, unknown>) => {
      if (!child.stdin.destroyed) child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    const abort = () => fail(new DOMException('The operation was aborted', 'AbortError'))
    opts.signal?.addEventListener('abort', abort, { once: true })

    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += String(chunk)
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try { handle(JSON.parse(line) as Record<string, unknown>) } catch { /* startup diagnostics are not protocol messages */ }
      }
    })
    child.on('error', fail)
    child.on('close', (code) => {
      if (!settled) fail(new Error(explainExit(code, stderr)))
    })

    send({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'career-ops', title: 'career-ops', version: '0.1.0' },
        capabilities: { experimentalApi: true, requestAttestation: false },
      },
    })

    function handle(event: Record<string, unknown>) {
      const error = asRecord(event.error)
      if (error) {
        fail(new Error(String(error.message ?? 'Codex app-server request failed')))
        return
      }

      if (event.id === 1) {
        send({ method: 'initialized' })
        send(opts.threadId ? {
          id: 2,
          method: 'thread/resume',
          params: {
            threadId: opts.threadId,
            cwd: opts.cwd,
            model: opts.model || null,
            approvalPolicy: 'never',
            sandbox: opts.sandbox,
            excludeTurns: true,
          },
        } : {
          id: 2,
          method: 'thread/start',
          params: {
            cwd: opts.cwd,
            model: opts.model || null,
            approvalPolicy: 'never',
            sandbox: opts.sandbox,
            ephemeral: opts.persist !== true,
          },
        })
        return
      }

      if (event.id === 2) {
        const result = asRecord(event.result)
        const thread = asRecord(result?.thread)
        if (typeof thread?.id !== 'string') {
          fail(new Error('Codex app-server did not return a thread'))
          return
        }
        threadId = thread.id
        send({
          id: 3,
          method: 'turn/start',
          params: {
            threadId,
            input: [{ type: 'text', text: opts.prompt, text_elements: [] }],
            outputSchema: opts.outputSchema ?? null,
            summary: 'concise',
          },
        })
        return
      }

      const params = asRecord(event.params)
      if (event.method === 'item/agentMessage/delta' && typeof params?.delta === 'string') {
        streamedText += params.delta
        opts.onDelta?.(params.delta)
        return
      }
      if (event.method === 'item/reasoning/summaryTextDelta' && typeof params?.delta === 'string') {
        opts.onReasoning?.(params.delta)
        return
      }
      if (event.method === 'item/started') {
        const item = asRecord(params?.item)
        if (item?.type === 'fileChange') opts.onActivity?.('Editing the CV…')
        if (item?.type === 'commandExecution') opts.onActivity?.('Using a tool…')
        return
      }
      if (event.method === 'item/completed') {
        const item = asRecord(params?.item)
        if (item?.type === 'agentMessage' && typeof item.text === 'string') completedText = item.text
        return
      }
      if (event.method === 'turn/completed') {
        const turn = asRecord(params?.turn)
        if (turn?.status === 'failed') {
          const turnError = asRecord(turn.error)
          fail(new Error(String(turnError?.message ?? 'Codex turn failed')))
          return
        }
        succeed()
      }
    }

    function succeed() {
      if (settled || !threadId) return
      settled = true
      cleanup()
      resolve({ text: streamedText || completedText, threadId })
      child.kill('SIGTERM')
    }

    function fail(reason: Error) {
      if (settled) return
      settled = true
      cleanup()
      child.kill('SIGTERM')
      reject(reason)
    }

    function cleanup() {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', abort)
      if (!child.stdin.destroyed) child.stdin.end()
    }
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function explainExit(code: number | null, stderr: string): string {
  const detail = stderr.trim().split('\n').slice(-8).join('\n')
  return detail ? `Codex app-server exited ${code}: ${detail}` : `Codex app-server exited ${code}`
}
