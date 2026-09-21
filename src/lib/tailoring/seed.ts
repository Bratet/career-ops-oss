import { readFile } from 'fs/promises'
import { parse, stringify } from 'yaml'
import { PATHS, type Lang } from '../paths'
import { rankedRequirements, type JdAnalysis } from './jd'

/**
 * Build the starting YAML for a new application.
 *
 * This is a faithful copy of the language-matched master with the tailored
 * design block stamped in. It deliberately does NOT cut anything: selection is
 * the next piece of work, and a seed that silently dropped content would be
 * worse than one that starts complete and overflows.
 */

export async function seedYaml(analysis: JdAnalysis): Promise<string> {
  const lang: Lang = analysis.language === 'fr' ? 'fr' : 'en'
  const master = parse(await readFile(PATHS.masters[lang], 'utf-8')) as Record<string, unknown>
  const design = parse(await readFile(PATHS.tailoredDesign, 'utf-8')) as { design: Record<string, unknown> }

  const page = { ...(design.design.page as Record<string, unknown>), size: analysis.paperSize }

  const doc: Record<string, unknown> = {
    cv: master.cv,
    design: { ...design.design, page },
  }
  // The FR master carries a locale block; the tailored copy needs it too.
  if (master.locale) doc.locale = master.locale

  return stringify(doc, { lineWidth: 0, defaultStringType: 'QUOTE_SINGLE', defaultKeyType: 'PLAIN' })
}

/**
 * Refresh only the locked presentation block of an existing workspace draft.
 * Content and locale remain untouched. Invalid in-progress YAML is returned as
 * written so workspace recovery and autosave never become destructive.
 */
export async function withTailoredDesign(text: string, requestedSize: 'a4' | 'us-letter' = 'a4'): Promise<string> {
  try {
    const doc = parse(text) as Record<string, unknown>
    if (!doc || typeof doc !== 'object' || !doc.cv) return text
    const spec = parse(await readFile(PATHS.tailoredDesign, 'utf-8')) as { design: Record<string, unknown> }
    const currentDesign = doc.design && typeof doc.design === 'object' ? doc.design as Record<string, unknown> : {}
    const currentPage = currentDesign.page && typeof currentDesign.page === 'object' ? currentDesign.page as Record<string, unknown> : {}
    const size = currentPage.size === 'us-letter' || currentPage.size === 'a4' ? currentPage.size : requestedSize
    doc.design = { ...spec.design, page: { ...(spec.design.page as Record<string, unknown>), size } }
    return stringify(doc, { lineWidth: 0, defaultStringType: 'QUOTE_SINGLE', defaultKeyType: 'PLAIN' })
  } catch {
    return text
  }
}

/**
 * The requirement map that seeds tailoring-notes.md.
 *
 * The table starts at "review"; the tailoring pass fills evidence and its
 * lead/prove/support/gap decision after working through the ranked requirements.
 */
export function requirementMap(analysis: JdAnalysis): string {
  const rows = rankedRequirements(analysis).map(
    (r) => `| ${r.weight} ${r.rank} | ${escapePipes(r.text)} | ${escapePipes(r.priorityReason)} | | review |`,
  )

  return [
    `# ${analysis.company} — ${analysis.role}`,
    '',
    [analysis.location, analysis.workMode, analysis.seniority].filter(Boolean).join(' · '),
    '',
    '## Requirement map',
    '',
    '| Priority | JD requirement | Why it ranks here | Evidence on master | Action |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '## Keywords',
    '',
    analysis.keywords.join(', ') || '_none extracted_',
    '',
    '## Cut from the master',
    '',
    '| What | Why |',
    '|---|---|',
    '',
    '## Gaps',
    '',
    '## Result',
    '',
  ].join('\n')
}

/** A '|' would break the markdown table the map lives in. */
function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|')
}

export function jdMarkdown(jd: string, url: string): string {
  // The URL goes on line 1 by convention; postings vanish within weeks and the
  // link is the only way back to the original.
  return `${url || '(no source URL given)'}\n\n${jd.trim()}\n`
}
