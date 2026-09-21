import { spawn } from 'child_process'

export interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

/**
 * Both CLIs are long-running and must stay interruptible, so everything goes
 * through spawn with a signal. Never execFileSync — it would block the server.
 */
export function runCli(
  bin: string,
  args: string[],
  opts: { cwd?: string; signal?: AbortSignal; timeoutMs?: number; onStdout?: (chunk: string) => void } = {},
): Promise<SpawnResult> {
  // A tailoring pass on a large prompt genuinely runs for several minutes, and a
  // SIGKILL mid-answer costs the whole call. The ceiling is here to catch a hung
  // CLI, not to bound a slow one.
  const { cwd, signal, timeoutMs = 900_000, onStdout } = opts
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      signal,
      env: process.env,
      // stdin MUST be closed, not an open pipe. `codex exec` reads extra prompt
      // text from stdin and blocks forever waiting for EOF if one is left open,
      // which looks exactly like the model hanging.
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)

    child.stdout.on('data', (d) => {
      const s = String(d)
      stdout += s
      onStdout?.(s)
    })
    child.stderr.on('data', (d) => (stderr += String(d)))
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}

/** `<bin> --version`, or null when the binary isn't reachable. */
export async function probeVersion(bin: string, args: string[] = ['--version']): Promise<string | null> {
  try {
    const { code, stdout, stderr } = await runCli(bin, args, { timeoutMs: 15_000 })
    return code === 0 ? (stdout || stderr).trim().split('\n')[0] : null
  } catch {
    return null
  }
}
