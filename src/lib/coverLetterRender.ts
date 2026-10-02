import { randomUUID } from 'crypto'
import { access, copyFile, mkdtemp, rename, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import { getApplication, readDoc } from './applications'
import { checkLetter, letterInputs, senderFromResume, wordCount, type CoverLetter, type CoverLetterSender } from './coverLetter'
import { runCli } from './engine/spawn'
import { APP_FILES, PATHS } from './paths'
import { pdfPageInfo } from './pdf'
import { cleanupRender, type RenderResult } from './render'
import { CANDIDATE } from './candidate'

/**
 * Cover letters render through templates/cover-letter.typ with typst-py, the
 * Typst binding rendercv already installs, and the fonts rendercv ships. That
 * keeps the letter on the same XCharter typography as the resume without a
 * separate Typst install.
 */

// Small enough for argv; the letter itself goes through stdin.
const SCRIPT = [
  'import json, os, sys, typst, rendercv_fonts',
  'r = json.load(sys.stdin)',
  '# Typst loads the signature root-relative, which needs a leading slash.',
  "sig = r['inputs'].get('signature', '')",
  "if sig and not sig.startswith('/'): r['inputs']['signature'] = '/' + sig",
  'f = os.path.dirname(rendercv_fonts.__file__)',
  'fonts = [os.path.join(f, d) for d in os.listdir(f) if os.path.isdir(os.path.join(f, d))]',
  "typst.compile(r['template'], output=r['output'], root=r['root'], font_paths=fonts, sys_inputs=r['inputs'])",
].join('\n')

let pythonCache: string[] | null = null

async function findPython(): Promise<string[] | null> {
  if (pythonCache) return pythonCache
  for (const candidate of [['python'], ['python3'], ['py', '-3']]) {
    try {
      const { code } = await runCli(candidate[0], [...candidate.slice(1), '-c', 'import typst, rendercv_fonts'], { timeoutMs: 20_000 })
      if (code === 0) return (pythonCache = candidate)
    } catch {
      // try the next candidate
    }
  }
  return null
}

/** "config/signature.png" when the signature exists, else the letter renders unsigned. */
async function signaturePath(): Promise<string> {
  try {
    await access(PATHS.signature)
    return relative(PATHS.root, PATHS.signature).split('\\').join('/')
  } catch {
    return ''
  }
}

export interface LetterRenderResult extends RenderResult {
  words: number
}

export async function renderCoverLetter(letter: CoverLetter, sender: CoverLetterSender, opts: { signal?: AbortSignal } = {}): Promise<LetterRenderResult> {
  const started = Date.now()
  const words = wordCount(letter.content)
  const content = checkLetter(letter, CANDIDATE.confidentialTerms)
  const fail = (why: string): LetterRenderResult => ({
    ok: false, pdfPath: null, pages: null, fill: null, words, notes: [], ms: Date.now() - started,
    failures: [...content, { kind: 'render', where: 'typst', why }],
  })

  const python = await findPython()
  if (!python) return fail('typst is not available to Python. It ships with rendercv: pip install "rendercv[full]"')

  // The render- prefix lets renderStore and cleanupRender manage this like a resume preview.
  const dir = await mkdtemp(join(tmpdir(), 'career-ops-render-'))
  const pdfPath = join(dir, 'preview.pdf')
  try {
    const { code, stderr } = await runCli(python[0], [...python.slice(1), '-c', SCRIPT], {
      cwd: PATHS.root,
      signal: opts.signal,
      timeoutMs: 60_000,
      input: JSON.stringify({ template: PATHS.coverLetterTemplate, output: pdfPath, root: PATHS.root, inputs: letterInputs(letter, sender, await signaturePath()) }),
    })
    if (code !== 0) {
      await rm(dir, { recursive: true, force: true })
      return fail(typstError(stderr))
    }
    const info = await pdfPageInfo(pdfPath)
    const failures = [...content]
    if (info && info.pages !== 1) {
      failures.push({ kind: 'page-count', where: 'content', why: `the letter runs to ${info.pages} pages; a cover letter must fit on one` })
    }
    return { ok: failures.length === 0, pdfPath, pages: info?.pages ?? null, fill: info?.fill ?? null, failures, notes: [], words, ms: Date.now() - started }
  } catch (err) {
    await rm(dir, { recursive: true, force: true })
    if ((err as Error).name === 'AbortError') return { ...fail('superseded'), failures: content, notes: ['render superseded'] }
    return fail((err as Error).message)
  }
}

/** Typst reports the actionable error first; the Python traceback around it is noise. */
function typstError(stderr: string): string {
  const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean)
  const error = lines.find((line) => /error:/i.test(line))
  return (error ?? lines.at(-1) ?? 'typst failed with no output').slice(0, 500)
}

/** The sender block and paper size come from the application's finalized resume. */
export async function letterSender(key: string): Promise<{ sender: CoverLetterSender; paper: CoverLetter['paper'] }> {
  const app = await getApplication(key)
  const yamlName = app?.folder?.docs.find((doc) => doc.key === 'yaml')?.name
  if (!app?.folder?.has.pdf || !yamlName) throw new Error('Finalize a resume before writing a cover letter')
  const yaml = await readDoc(app.folder.folder, yamlName)
  if (!yaml) throw new Error('the finalized resume could not be read')
  const { sender, paper } = senderFromResume(yaml)
  // The letter uses name and email; the phone remains on the resume.
  return { sender: { ...sender, phone: '' }, paper }
}

/**
 * Write the reviewed letter next to the resume: the PDF to send, plus the
 * template inputs that reproduce it, both replaced atomically.
 */
export async function finalizeCoverLetter(key: string, letter: CoverLetter): Promise<{ pdfName: string; inputName: string; words: number }> {
  const app = await getApplication(key)
  if (!app?.folder) throw new Error('no folder for this application')
  if (!letter.content.trim()) throw new Error('the letter has no body yet')
  const { sender } = await letterSender(key)
  const render = await renderCoverLetter(letter, sender)
  if (!render.ok || !render.pdfPath) {
    if (render.pdfPath) await cleanupRender(render.pdfPath)
    throw new Error(render.failures[0]?.why ?? 'the cover letter could not be rendered')
  }

  const dir = join(PATHS.applications, app.folder.folder)
  const pdfName = APP_FILES.letterPdf
  const inputName = app.folder.docs.find((doc) => doc.key === 'letterInput')?.name ?? APP_FILES.letterInput
  const suffix = `${process.pid}-${randomUUID()}`
  const pdfTemp = join(dir, `${pdfName}.${suffix}.tmp`)
  const inputTemp = join(dir, `${inputName}.${suffix}.tmp`)
  try {
    await Promise.all([
      copyFile(render.pdfPath, pdfTemp),
      writeFile(inputTemp, `${JSON.stringify(letterInputs(letter, sender, await signaturePath()), null, 2)}\n`, 'utf-8'),
    ])
    // Both complete files exist before either finalized artifact is replaced.
    await rename(pdfTemp, join(dir, pdfName))
    await rename(inputTemp, join(dir, inputName))
    return { pdfName, inputName, words: render.words }
  } finally {
    await cleanupRender(render.pdfPath)
    await Promise.all([pdfTemp, inputTemp].map((path) => rm(path, { force: true }).catch(() => {})))
  }
}
