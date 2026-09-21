import { readFile } from 'fs/promises'
import { parse } from 'yaml'
import { CANDIDATE } from './candidate'
import { PATHS } from './paths'

/**
 * The hard rules, in TypeScript.
 *
 * Each one exists because it failed silently at least once across the first 40+
 * applications. The comments say which, because a rule whose reason is lost gets
 * "simplified" away by the next person to read it.
 */

export type Mode = 'master' | 'tailored' | 'general'
export type FailureKind =
  | 'forbidden-name' | 'location' | 'em-dash' | 'placeholder'
  | 'design' | 'jd-archive' | 'page-count' | 'yaml' | 'render'

export interface Failure {
  kind: FailureKind
  /** Dotted YAML path, e.g. cv.sections.Experience[0].highlights[2] — the UI jumps the cursor here. */
  where: string
  why: string
}

/**
 * Names that must never appear on a generated resume/cover letter, in any
 * language, in any role — e.g. a past employer's confidential client names.
 * Configured per candidate in config/candidate.json; empty by default.
 */
const FORBIDDEN = CANDIDATE.confidentialTerms

/** [text](url) is a markdown link and fine. [anything else] is an unfilled placeholder. */
const PLACEHOLDER_RE = /\[[^\]\n]*\](?!\()/g

interface StringHit { path: string; value: string }

/** Walk every string under a node, recording its dotted path; flag location keys en route. */
function walk(node: unknown, path: string, out: StringHit[], failures: Failure[]): void {
  if (node === null || node === undefined) return

  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, out, failures))
    return
  }

  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'location') {
        failures.push({
          kind: 'location',
          where: `${path}.${k}`,
          // A visible location can get a CV filtered out before a human reads it,
          // e.g. when applying across borders.
          why: "a 'location:' key is present; no location ever goes on a generated CV",
        })
      }
      walk(v, `${path}.${k}`, out, failures)
    }
    return
  }

  if (typeof node === 'string') out.push({ path, value: node })
}

function flatten(node: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k))
    }
  } else {
    out[prefix] = node
  }
  return out
}

async function designSpec(): Promise<Record<string, unknown>> {
  // Match the template used by previews, including changes during a running app session.
  const doc = parse(await readFile(PATHS.tailoredDesign, 'utf-8')) as { design: unknown }
  return flatten(doc.design)
}

export interface ContentResult {
  ok: boolean
  failures: Failure[]
  mode: Mode
  /** Parsed document, when the YAML was valid. */
  doc: Record<string, unknown> | null
}

/** Content and design rules. Never touches a PDF. */
export async function checkContent(text: string, mode: Mode): Promise<ContentResult> {
  let doc: Record<string, unknown>
  try {
    doc = (parse(text) ?? {}) as Record<string, unknown>
  } catch (err) {
    return {
      ok: false,
      mode,
      doc: null,
      failures: [{ kind: 'yaml', where: 'document', why: (err as Error).message.split('\n')[0] }],
    }
  }

  const failures: Failure[] = []
  const strings: StringHit[] = []
  walk(doc.cv ?? {}, 'cv', strings, failures)

  for (const { path, value } of strings) {
    for (const name of FORBIDDEN) {
      if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(value)) {
        failures.push({ kind: 'forbidden-name', where: path, why: `forbidden name "${name}" appears` })
      }
    }
    if (value.includes('—')) {
      failures.push({
        kind: 'em-dash',
        where: path,
        why: 'em dash present; strongest AI tell to a recruiter',
      })
    }
    for (const m of value.matchAll(PLACEHOLDER_RE)) {
      failures.push({ kind: 'placeholder', where: path, why: `bracketed placeholder ${JSON.stringify(m[0])}` })
    }
  }

  // Master and tailored share one design spec, so both are held to it. Without
  // this the profile preview silently rendered the master's own drifted block and
  // looked nothing like the CV an application actually ships.
  if (mode !== 'general') failures.push(...(await checkDesign(doc.design)))

  return { ok: failures.length === 0, failures, mode, doc }
}

/**
 * Every resume's design block must equal templates/tailored-design.yaml, with
 * page.size the single permitted edit. That file is the one theme in the repo.
 *
 * Notably this catches header.connections.phone_number_format: renderCV defaults
 * it to "national", which strips the country code and shipped an undialable
 * number on every CV for nine days in July 2026.
 */
async function checkDesign(design: unknown): Promise<Failure[]> {
  if (!design) {
    return [{ kind: 'design', where: 'design', why: 'no design block; copy templates/tailored-design.yaml verbatim' }]
  }

  const spec = { ...(await designSpec()) }
  const actual = flatten(design)

  const size = actual['page.size']
  const failures: Failure[] = []
  if (size !== 'a4' && size !== 'us-letter') {
    failures.push({
      kind: 'design',
      where: 'design.page.size',
      why: `is ${JSON.stringify(size)}; must be a4, or us-letter for US/Canada`,
    })
  }
  delete actual['page.size']
  delete spec['page.size']

  const keys = [...new Set([...Object.keys(actual), ...Object.keys(spec)])].sort()
  const diffs = keys.filter((k) => String(actual[k] ?? '<missing>') !== String(spec[k] ?? '<missing>'))

  // A few drifted keys are worth naming individually. A wholesale mismatch means
  // the block was hand-built or copied from an older design, and listing 20 keys
  // buries the content failures that actually need reading.
  if (diffs.length > 3) {
    failures.push({
      kind: 'design',
      where: 'design',
      why:
        `does not match templates/tailored-design.yaml (${diffs.length} keys differ, including ` +
        `${diffs.slice(0, 3).join(', ')}). Replace the whole block with that file, changing only page.size.`,
    })
  } else {
    for (const k of diffs) {
      failures.push({
        kind: 'design',
        where: `design.${k}`,
        why: `is ${JSON.stringify(actual[k] ?? null)}, spec says ${JSON.stringify(spec[k] ?? null)}`,
      })
    }
  }

  return failures
}

/**
 * The one-page rule.
 *
 * The escape hatch exists because an academic CV legitimately ran to two pages
 * (the Twente PhD application). There is no comparable case for naming a client,
 * which is why confidentiality has no override.
 */
export function checkPages(
  info: { pages: number; fill: number } | null,
  mode: Mode,
  { allowMultipage = false } = {},
): { failures: Failure[]; notes: string[] } {
  const failures: Failure[] = []
  const notes: string[] = []

  if (!info) return { failures, notes: ['page count not verified'] }

  notes.push(`${info.pages} page(s), first-page fill ${info.fill}%`)
  if (mode !== 'tailored') return { failures, notes }

  if (info.pages !== 1) {
    if (allowMultipage) notes.push(`${info.pages} pages, allowed explicitly`)
    else {
      failures.push({
        kind: 'page-count',
        where: `${info.pages} pages`,
        why: 'a tailored CV is one page. Cut content, or allow multipage if this is deliberately an academic CV.',
      })
    }
  } else if (info.fill < 80) {
    notes.push(`fill ${info.fill}% is under 80%, room for another bullet`)
  }
  return { failures, notes }
}
