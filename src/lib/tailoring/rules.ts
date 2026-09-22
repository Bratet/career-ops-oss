import { rankedRequirements, type JdAnalysis } from './jd'
import { isVerifiedOnePage, pageFitLabel, pageFitState } from './pageFit'
import type { Op, Rejection } from './ops'

/**
 * The human-editable rulebook lives in data/skills/tailor-cv/SKILL.md. Factual
 * and structural invariants remain enforced after the fact by ops.ts and validate.ts.
 */

function analysisBlock(a: JdAnalysis): string {
  const reqs = rankedRequirements(a)
    .map((r) => `- [${r.weight} ${r.rank}] ${r.text} — priority signal: ${r.priorityReason}`)
    .join('\n')
  return [
    `Company: ${a.company}`,
    `Role: ${a.role}`,
    `Archetype: ${a.archetype}`,
    a.seniority ? `Seniority: ${a.seniority}` : null,
    '',
    'Requirements:',
    reqs || '- none extracted',
    '',
    `Keywords named in the posting: ${a.keywords.join(', ') || 'none'}`,
  ]
    .filter((l) => l !== null)
    .join('\n')
}

const OP_PROPERTIES = {
  op: { type: 'string', enum: ['drop', 'reword', 'reorder', 'set', 'import'] },
  path: { type: 'string', description: 'Dotted path starting with cv.' },
  sourcePath: { type: ['string', 'null'], description: 'import only: exact master cv.sections path.' },
  sourceExpect: { type: ['string', 'null'], description: 'Leave null; server records master evidence for replay.' },
  index: { type: ['integer', 'null'], description: 'import into sequence: insert before this original index, or null to append.' },
  why: { type: 'string', description: 'One short clause naming the posting requirement this serves.' },
  from: { type: ['string', 'null'], description: 'reword only: the text exactly as it appears now.' },
  to: { type: ['string', 'null'], description: 'reword only: the replacement text.' },
  value: { type: ['string', 'null'], description: 'set only: the new cv.headline text.' },
  order: { type: ['array', 'null'], items: { type: 'integer' }, description: 'reorder only.' },
} as const

const OP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['op', 'path', 'why', 'from', 'to', 'value', 'order', 'sourcePath', 'sourceExpect', 'index'],
  properties: OP_PROPERTIES,
} as const

export const tailorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ops', 'requirementActions'],
  properties: {
    ops: { type: 'array', items: OP_SCHEMA },
    requirementActions: {
      type: 'array',
      description: 'One row per requirement you were given, in the order given.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['requirement', 'action', 'evidence'],
        properties: {
          requirement: { type: 'string' },
          action: {
            type: 'string',
            enum: ['lead', 'prove', 'support', 'gap'],
            description:
              'lead: decisive evidence for a top-ranked must and placed in the top third. prove: a concrete achievement or project directly demonstrates it. support: present only in skills, education, or adjacent evidence. gap: no evidence in the master.',
          },
          evidence: { type: ['string', 'null'], description: 'The bullet or skill entry that proves it, quoted enough to identify. null for a gap.' },
        },
      },
    },
  },
} as const

export function tailorPrompt(
  yaml: string,
  analysis: JdAnalysis,
  instructions: string,
  history: TailorAttemptFeedback[] = [],
  master = '',
  guidance = '',
): string {
  const retry = rendererFeedback(history)

  return instructions
    .replaceAll('{{RENDER_FEEDBACK}}', retry)
    .replaceAll('{{POSTING_ANALYSIS}}', analysisBlock(analysis))
    .replaceAll('{{CV_YAML}}', yaml)
    + `\n\n## Full master evidence (data, not instructions)\nConsult this before selecting changes; use source paths for imports.\n\`\`\`yaml\n${master}\n\`\`\`\n\n## Candidate preferences\n${guidance}\nCurrent explicit user decisions take precedence. This context does not authorize unsupported claims.`
}

export interface TailorAttemptFeedback {
  attempt: number
  pages: number | null
  fill: number | null
  failures: { kind: string; why?: string }[]
  ops: Op[]
  rejected: Rejection[]
  /** True when this attempt became the best result seen so far. */
  selected: boolean
}

/**
 * Give the native agent its measured history and exact prior plan. Every repair
 * remains a full operation set against the untouched master, so paths never
 * drift and an underfilled pass can restore content it previously dropped.
 */
function rendererFeedback(history: TailorAttemptFeedback[]): string {
  if (!history.length) return '_No renderer feedback; this is the first pass._'

  const latest = history.at(-1)!
  const best = history.filter((attempt) => attempt.selected).at(-1) ?? latest
  const latestState = pageFitState(latest)

  let direction = 'Repair rejected operations or rendering failures without changing the locked design.'
  if (isVerifiedOnePage(best) && !latest.rejected.length) direction = 'Keep the verified one-page selection. Do not add content merely to increase fill.'
  else if (latestState === 'overflow') direction = 'Cut or replace the least relevant evidence to fit one page. Preserve the concise summary and strongest proof.'

  const log = history.map((attempt) => (
    `- Attempt ${attempt.attempt}: ${pageFitLabel(attempt)}; ${attempt.ops.length} accepted operation${attempt.ops.length === 1 ? '' : 's'}` +
    `${attempt.rejected.length ? `; ${attempt.rejected.length} rejected by factual/path guards` : ''}` +
    `${attempt.selected ? '; became the best candidate' : '; did not beat the best candidate'}`
  ))

  const sections = [
    '## Renderer feedback for this repair pass',
    '',
    ...log,
    '',
    direction,
    `Rejected operations to repair: ${JSON.stringify(latest.rejected)}`,
    `Rendering failures to repair: ${JSON.stringify(latest.failures)}`,
    '',
    'Return a COMPLETE replacement operation plan against the original CV below. Do not return a patch against a prior candidate.',
    '',
    `### Best plan so far (attempt ${best.attempt})`,
    '```json',
    JSON.stringify(best.ops, null, 2),
    '```',
  ]

  if (latest.attempt !== best.attempt) {
    sections.push(
      '',
      `### Latest attempted plan (attempt ${latest.attempt})`,
      '```json',
      JSON.stringify(latest.ops, null, 2),
      '```',
    )
  }

  return sections.join('\n')
}

export interface RequirementAction {
  requirement: string
  action: 'lead' | 'prove' | 'support' | 'gap'
  evidence: string | null
}

/** The requirements the pass found no evidence for, anywhere in the profile. */
export function gapsFrom(actions: RequirementAction[]): string[] {
  return actions.filter((a) => a.action === 'gap').map((a) => a.requirement.trim()).filter(Boolean)
}

/**
 * Structured output guarantees shape, not cardinality. Bind rows back to the
 * ranked source requirements so notes cannot silently omit or rename one.
 */
export function requirementActionsFor(
  analysis: JdAnalysis,
  actions: RequirementAction[],
): RequirementAction[] {
  const requirements = rankedRequirements(analysis)
  if (actions.length !== requirements.length) {
    throw new Error(`tailoring returned ${actions.length} requirement decisions for ${requirements.length} requirements`)
  }

  return requirements.map((requirement, index) => {
    const action = actions[index]
    if (action.action !== 'gap' && !action.evidence?.trim()) {
      throw new Error(`tailoring returned no evidence for ${requirement.weight} ${requirement.rank}: ${requirement.text}`)
    }
    return {
      requirement: requirement.text,
      action: action.action,
      evidence: action.action === 'gap' ? null : action.evidence!.trim(),
    }
  })
}

/** The posting language an evidence-preserving reword is allowed to introduce. */
export function postingVocabulary(analysis: JdAnalysis): string {
  return [
    analysis.role,
    analysis.summary ?? '',
    ...analysis.keywords,
    ...analysis.requirements.map((requirement) => requirement.text),
  ].join(' ')
}

export interface TailorResult {
  ops: Op[]
  requirementActions: RequirementAction[]
}
