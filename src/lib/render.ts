import { spawn } from 'child_process'
import { mkdtemp, writeFile, rm, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { delimiter, join } from 'path'
import { APP_FILES, PATHS } from './paths'
import { pdfPageInfo } from './pdf'
import { checkContent, checkPages, type Failure, type Mode } from './validate'

/**
 * Async rendercv wrapper.
 *
 * Renders into a per-request temp dir so concurrent previews never collide on
 * the shared rendercv_output/, and captures stderr rather than inheriting it so
 * YAML errors reach the UI instead of the terminal.
 */

export interface RenderResult {
  ok: boolean
  /** Absolute path to the produced PDF, when one was produced. */
  pdfPath: string | null
  pages: number | null
  fill: number | null
  failures: Failure[]
  notes: string[]
  ms: number
}

const RENDER_TIMEOUT_MS = 60_000

function run(bin: string, args: string[], cwd: string, signal?: AbortSignal) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      signal,
      env: {
        ...process.env,
        // patches/sitecustomize.py carries the rendercv 2.8 nested-bullet fix.
        PYTHONPATH: [PATHS.patches, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
        // Without this rendercv crashes on a unicode check mark on some platforms.
        PYTHONIOENCODING: 'utf-8',
      },
    })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), RENDER_TIMEOUT_MS)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}

let rendercvCache: { bin: string; args: string[]; version: string } | null = null

/** Is rendercv reachable, and which binary is it? Cached after the first hit. */
export async function findRendercv(force = false) {
  if (rendercvCache && !force) return rendercvCache
  for (const [bin, args] of [['rendercv', []], ['python3', ['-m', 'rendercv']]] as [string, string[]][]) {
    try {
      const { code, stdout, stderr } = await run(bin, [...args, '--version'], PATHS.root)
      if (code === 0) {
        rendercvCache = { bin, args, version: (stdout || stderr).trim() }
        return rendercvCache
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}

/**
 * Render YAML text to a PDF in a fresh temp dir, then apply the rules.
 *
 * Content rules run first: if the YAML names a client or carries an em dash,
 * there is no point spending 750ms on a render to say so.
 */
export async function renderYaml(
  text: string,
  mode: Mode,
  opts: { signal?: AbortSignal; allowMultipage?: boolean } = {},
): Promise<RenderResult> {
  const started = Date.now()
  const content = await checkContent(text, mode)
  const fail = (failures: Failure[], notes: string[] = []): RenderResult => ({
    ok: false, pdfPath: null, pages: null, fill: null, failures, notes, ms: Date.now() - started,
  })

  // Invalid YAML cannot be rendered at all, so stop before spawning anything.
  if (content.failures.some((f) => f.kind === 'yaml')) return fail(content.failures)

  const rendercv = await findRendercv()
  if (!rendercv) {
    return fail([
      ...content.failures,
      {
        kind: 'render',
        where: 'environment',
        why: 'rendercv is not installed or not on PATH. Install with: pip install "rendercv[full]"',
      },
    ])
  }

  const dir = await mkdtemp(join(tmpdir(), 'career-ops-render-'))
  const yamlPath = join(dir, mode === 'master' ? 'master-resume-preview.yaml' : APP_FILES.yaml)
  const pdfPath = join(dir, 'preview.pdf')

  try {
    await writeFile(yamlPath, text, 'utf-8')
    const { code, stderr } = await run(
      rendercv.bin,
      [...rendercv.args, 'render', yamlPath,
       '--pdf-path', pdfPath,
       '--dont-generate-markdown', '--dont-generate-html', '--dont-generate-png', '--quiet'],
      dir,
      opts.signal,
    )

    if (code !== 0) {
      await rm(dir, { recursive: true, force: true })
      return fail([...content.failures, { kind: 'render', where: 'rendercv', why: lastUsefulLine(stderr) }])
    }

    const info = await pdfPageInfo(pdfPath)
    const page = checkPages(info, mode, { allowMultipage: opts.allowMultipage })
    const failures = [...content.failures, ...page.failures]

    return {
      ok: failures.length === 0,
      pdfPath,
      pages: info?.pages ?? null,
      fill: info?.fill ?? null,
      failures,
      notes: page.notes,
      ms: Date.now() - started,
    }
  } catch (err) {
    await rm(dir, { recursive: true, force: true })
    // An aborted render was superseded by a newer keystroke; that is not an error.
    if ((err as Error).name === 'AbortError') return fail([], ['render superseded'])
    return fail([...content.failures, { kind: 'render', where: 'rendercv', why: (err as Error).message }])
  }
}

/**
 * rendercv's tracebacks are long and the actionable line is at the end, wrapped
 * in box-drawing characters.
 */
function lastUsefulLine(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.replace(/[\u2500-\u257f]/g, '').trim())
    .filter(Boolean)
  return lines.length ? lines[lines.length - 1].slice(0, 500) : 'rendercv failed with no output'
}

/** Discard a temp render directory once its PDF has been served. */
export async function cleanupRender(pdfPath: string): Promise<void> {
  if (!pdfPath.includes('career-ops-render-')) return
  await rm(join(pdfPath, '..'), { recursive: true, force: true })
}

/** Page count from PNG output, when only the count is needed. */
export async function pageCount(text: string, mode: Mode): Promise<number | null> {
  const rendercv = await findRendercv()
  if (!rendercv) return null
  const dir = await mkdtemp(join(tmpdir(), 'career-ops-pages-'))
  try {
    const yamlPath = join(dir, mode === 'master' ? 'master-resume-preview.yaml' : APP_FILES.yaml)
    await writeFile(yamlPath, text, 'utf-8')
    const { code } = await run(
      rendercv.bin,
      [...rendercv.args, 'render', yamlPath, '--png-path', join(dir, 'p.png'),
       '--dont-generate-markdown', '--dont-generate-html', '--dont-generate-pdf', '--quiet'],
      dir,
    )
    return code === 0 ? (await readdir(dir)).filter((f) => f.endsWith('.png')).length : null
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
