import type { Op } from './ops'
import { gapsFrom, type RequirementAction } from './rules'
import { parse } from 'yaml'

/**
 * Fill tailoring-notes.md in from what the passes returned.
 *
 * seed.ts writes the ranked requirement table with an Action column of "review"
 * and three empty sections. This is a mechanical merge of the tailoring output
 * into that stub, not another model call.
 *
 * It rewrites only the sections it owns. Anything the user typed into the
 * file by hand outside them survives untouched.
 */

export interface NotesPatch {
  requirementActions?: RequirementAction[]
  cuts?: { what: string; why: string }[]
  gaps?: string[]
  result?: string
}

/** Build the durable notes only when a reviewed tailoring proposal is accepted. */
export function acceptedTailoringNotes(
  md: string,
  result: { ops: Op[]; requirementActions: RequirementAction[] },
  yaml: string,
  render: { pages: number | null; fill: number | null },
): string {
  let headline: string | null = null
  try {
    headline = (parse(yaml)?.cv?.headline as string) ?? null
  } catch {
    // The accepting route validates YAML and reports the useful error there.
  }

  const updated = applyNotesPatch(md, {
    requirementActions: result.requirementActions,
    cuts: cutsFromOps(result.ops),
    gaps: gapsFrom(result.requirementActions),
    result: resultLine(render.pages, render.fill, headline),
  })
  const changes = result.ops.map(op => `| ${CELL(op.op)} | ${CELL(op.path)} | ${CELL(op.sourcePath ?? '')} | ${CELL(op.why)} |`)
  return replaceSection(updated, 'Changes', changes.length
    ? ['| Action | Destination | Master source | Reason |', '|---|---|---|---|', ...changes].join('\n')
    : '_General resume retained without changes._')
}

const CELL = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()

/**
 * Compare requirement text across the escaping the table applies, and across the
 * "[must] " prefix the prompt shows the requirements with — the model echoes it
 * back often enough that matching on the raw string silently fills nothing.
 */
const norm = (s: string) =>
  s
    .replace(/\\\|/g, '|')
    .replace(/^\s*\[(must|nice)\]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

export function applyNotesPatch(md: string, patch: NotesPatch): string {
  let out = md
  if (patch.requirementActions?.length) out = fillRequirementMap(out, patch.requirementActions)
  if (patch.cuts) {
    out = out.replace('## Cut from the master', '## Cut from the general resume')
    out = replaceSection(out, 'Cut from the general resume', cutsTable(patch.cuts))
  }
  if (patch.gaps) out = replaceSection(out, 'Gaps', gapsList(patch.gaps))
  if (patch.result) out = replaceSection(out, 'Result', patch.result)
  return out
}

/**
 * Fill the Evidence and Action columns.
 *
 * The pass is asked for one row per requirement in the order it was given them,
 * so position is the primary key and text the fallback. Text alone is too
 * fragile: the model rewraps and re-punctuates the requirement often enough that
 * a text-only match quietly fills nothing at all.
 */
function fillRequirementMap(md: string, actions: RequirementAction[]): string {
  const byText = new Map(actions.map((a) => [norm(a.requirement), a]))
  const lines = md.split('\n')

  const isDataRow = (line: string) => {
    if (!line.startsWith('|') || line.startsWith('|---') || line.includes('JD requirement')) return false
    const cells = line.split('|')
    return cells.length === 6 || cells.length === 7
  }

  const positional = lines.filter(isDataRow).length === actions.length
  let seen = 0

  return lines
    .map((line) => {
      if (!isDataRow(line)) return line
      // New rows have five cells; historical notes have four and remain editable.
      const cells = line.split('|')
      const requirementIndex = cells.length === 7 ? 2 : 1
      const hit = positional ? actions[seen++] : byText.get(norm(cells[requirementIndex]))
      if (!hit) return line

      if (cells.length === 7) {
        return `| ${cells[1].trim()} | ${cells[2].trim()} | ${cells[3].trim()} | ${CELL(hit.evidence ?? '')} | ${hit.action} |`
      }
      return `| ${cells[1].trim()} | ${cells[2].trim()} | ${CELL(hit.evidence ?? '')} | ${hit.action} |`
    })
    .join('\n')
}

function cutsTable(cuts: { what: string; why: string }[]): string {
  const head = '| What | Why |\n|---|---|'
  if (!cuts.length) return `${head}\n| nothing cut | |`
  return [head, ...cuts.map((c) => `| ${CELL(c.what)} | ${CELL(c.why)} |`)].join('\n')
}

/**
 * The cut table, built from the operations that are actually live.
 *
 * Deriving it from the ops rather than from a list the model returns alongside
 * them is what keeps the file honest when a row is unchecked in the editor: the
 * table is a view of the edit set, so it cannot drift from it.
 */
export function cutsFromOps(ops: Op[]): { what: string; why: string }[] {
  return ops.filter((o) => o.op === 'drop').map((o) => ({ what: describeTarget(o), why: o.why }))
}

/** What was actually removed, read back from the fingerprint the applier recorded. */
function describeTarget(op: Op): string {
  const raw = (op.expect ?? '').trim()
  if (!raw) return op.path

  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const entry = JSON.parse(raw) as Record<string, unknown> | unknown[]
      if (!Array.isArray(entry)) {
        const label = [entry.position, entry.company, entry.name].filter(Boolean).join(', ')
        if (label) return label
      }
      // A whole section drops as an array; name it by its path instead.
      return op.path.split('.').pop() ?? op.path
    } catch {
      return op.path
    }
  }

  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw
}

function gapsList(gaps: string[]): string {
  if (!gaps.length) return '_None. Every stated requirement has evidence somewhere in the profile._'
  return [
    ...gaps.map((g) => `- ${g.trim()}`),
    '',
    '_A gap is not a reason to skip the application. Postings are aspirational._',
  ].join('\n')
}

/**
 * Replace the body under a `## Heading`, up to the next `## ` or the end.
 *
 * A missing section is appended rather than dropped: the historical folders
 * predate this file's layout and several are missing sections entirely.
 */
function replaceSection(md: string, heading: string, body: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase())

  if (start === -1) return `${md.replace(/\s*$/, '')}\n\n## ${heading}\n\n${body}\n`

  let end = start + 1
  while (end < lines.length && !lines[end].startsWith('## ')) end++

  return [...lines.slice(0, start + 1), '', body, '', ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n')
}

/** The Result line, written from what actually rendered. */
export function resultLine(pages: number | null, fill: number | null, headline: string | null): string {
  const bits = [
    pages === null ? 'page count not verified' : `${pages} page${pages === 1 ? '' : 's'}`,
    fill === null ? null : `${fill}% fill`,
    headline ? `headline used: "${headline}"` : 'no headline',
  ].filter(Boolean)
  return bits.join(', ')
}
