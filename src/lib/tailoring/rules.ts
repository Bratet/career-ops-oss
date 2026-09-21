import { rankedRequirements, type JdAnalysis } from './jd'
import { PAGE_FILL_TARGET, pageFitLabel, pageFitState } from './pageFit'
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
  op: { type: 'string', enum: ['drop', 'reword', 'reorder', 'set'] },
  path: { type: 'string', description: 'Dotted path starting with cv.' },
  why: { type: 'string', description: 'One short clause naming the posting requirement this serves.' },
  from: { type: ['string', 'null'], description: 'reword only: the text exactly as it appears now.' },
  to: { type: ['string', 'null'], description: 'reword only: the replacement text.' },
  value: { type: ['string', 'null'], description: 'set only: the new cv.headline text.' },
  order: { type: ['array', 'null'], items: { type: 'integer' }, description: 'reorder only.' },
} as const

const OP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['op', 'path', 'why', 'from', 'to', 'value', 'order'],
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
): string {
  const retry = rendererFeedback(history)

  return instructions
    .replaceAll('{{RENDER_FEEDBACK}}', retry)
    .replaceAll('{{POSTING_ANALYSIS}}', analysisBlock(analysis))
    .replaceAll('{{CV_YAML}}', yaml)
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
  const bestState = pageFitState(best)
  const hardFailures = latest.failures.filter((failure) => failure.kind !== 'page-count')

  let direction: string
  if (latestState === 'invalid') {
    direction = `The latest plan introduced a guard failure. Return to the best plan and repair or avoid these issues without weakening its evidence: ${hardFailures.map((failure) => failure.why ?? failure.kind).join('; ')}`
  } else if (latestState === 'unverified') {
    direction = 'The renderer could not verify the last plan. Return to the best plan and make a conservative one-page selection without changing the locked design.'
  } else if (latestState === 'overflow' && bestState === 'underfilled' && latest.attempt !== best.attempt) {
    direction = `The latest addition was too large. Start from the best one-page plan and restore a smaller, high-value item so the result approaches ${PAGE_FILL_TARGET}% without spilling.`
  } else if (bestState === 'underfilled') {
    direction = `The best plan is one page but still underfilled. Preserve it and restore the strongest omitted evidence, one focused addition at a time, aiming for ${PAGE_FILL_TARGET}% or better.`
  } else if (latestState === 'overflow') {
    direction = 'The latest plan overflows. Preserve its strongest requirement coverage, then remove the lowest-value whole item needed to reach one page.'
  } else {
    direction = `Keep the best plan at or above ${PAGE_FILL_TARGET}% while improving requirement coverage only if it remains one page.`
  }

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
