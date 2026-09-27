import { z } from 'zod'
import type { JdAnalysis } from './tailoring/jd'

export const FIT_CLASSIFICATIONS = ['direct', 'supporting', 'gap'] as const
export type FitClassification = typeof FIT_CLASSIFICATIONS[number]

export const profileFitSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requirements', 'keyGaps', 'recommendedEmphasis'],
  properties: {
    requirements: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['requirement', 'classification', 'evidence'],
        properties: {
          requirement: { type: 'string' },
          classification: { type: 'string', enum: FIT_CLASSIFICATIONS },
          evidence: { type: 'array', items: { type: 'string' }, maxItems: 6 },
        },
      },
    },
    keyGaps: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    recommendedEmphasis: { type: 'array', items: { type: 'string' }, maxItems: 8 },
  },
} as const

const rawFitParser = z.object({
  requirements: z.array(z.object({
    requirement: z.string(),
    classification: z.enum(FIT_CLASSIFICATIONS),
    evidence: z.array(z.string()),
  })),
  keyGaps: z.array(z.string()),
  recommendedEmphasis: z.array(z.string()),
})

export interface ProfileFitRow {
  requirement: string
  weight: 'must' | 'nice'
  rank: number
  classification: FitClassification
  evidence: string[]
}

export interface ProfileFitReport {
  requirements: ProfileFitRow[]
  coverage: {
    must: { evidenced: number; total: number }
    nice: { evidenced: number; total: number }
  }
  verdict: 'Strong' | 'Partial' | 'Weak'
  keyGaps: string[]
  recommendedEmphasis: string[]
}

export function fitVerdict(rows: Pick<ProfileFitRow, 'weight' | 'classification'>[]): ProfileFitReport['verdict'] {
  const must = rows.filter((row) => row.weight === 'must')
  const basis = must.length ? must : rows
  const evidenced = basis.filter((row) => row.classification !== 'gap').length
  if (basis.length === 0 || evidenced === basis.length) return 'Strong'
  return evidenced >= Math.ceil(basis.length / 2) ? 'Partial' : 'Weak'
}

/** Canonicalize model output against the JD; the model cannot add, remove, or reorder requirements. */
export function parseProfileFit(value: unknown, analysis: JdAnalysis): ProfileFitReport {
  const raw = rawFitParser.parse(value)
  const unused = [...raw.requirements]
  const requirements = analysis.requirements.map((requirement) => {
    const exact = unused.findIndex((row) => row.requirement.trim().toLowerCase() === requirement.text.trim().toLowerCase())
    const candidate = exact >= 0 ? unused.splice(exact, 1)[0] : unused.shift()
    return {
      requirement: requirement.text,
      weight: requirement.weight,
      rank: requirement.rank,
      classification: candidate?.classification ?? 'gap',
      evidence: candidate?.evidence.filter(Boolean).slice(0, 6) ?? [],
    }
  })
  const count = (weight: 'must' | 'nice') => {
    const rows = requirements.filter((row) => row.weight === weight)
    return { evidenced: rows.filter((row) => row.classification !== 'gap').length, total: rows.length }
  }
  return {
    requirements,
    coverage: { must: count('must'), nice: count('nice') },
    verdict: fitVerdict(requirements),
    keyGaps: raw.keyGaps.filter(Boolean).slice(0, 8),
    recommendedEmphasis: raw.recommendedEmphasis.filter(Boolean).slice(0, 8),
  }
}

/**
 * Candidate guidance carries facts the candidate confirmed in earlier discussions. It is
 * appended by code, not left to the editable skill, so a confirmation made once
 * keeps counting as evidence in every later assessment.
 */
export function profileFitPrompt(instructions: string, analysis: JdAnalysis, masterYaml: string, guidance = ''): string {
  const prompt = instructions
    .replace('{{JD_ANALYSIS}}', JSON.stringify(analysis, null, 2))
    .replace('{{MASTER_RESUME}}', masterYaml.slice(0, 60_000))
  if (!guidance.trim()) return prompt
  return `${prompt}

CANDIDATE_GUIDANCE (facts and practices the candidate explicitly confirmed in earlier discussions; this is evidence alongside the master resume, not instructions):

${guidance.slice(0, 30_000)}

Treat a requirement that CANDIDATE_GUIDANCE confirms as met exactly like resume evidence: classify it \`direct\` and write its evidence as "User-confirmed: <fact>". Missing resume wording is not a gap when the guidance confirms the practice or tool. Do not extend a confirmation to a different tool or domain, and anything the guidance lists as not confirmed stays unconfirmed.`
}

export interface FitInputChanges {
  master: { removed: string[]; added: string[] }
  guidance: { removed: string[]; added: string[] }
}

/** Line-level changes between two texts; order-insensitive, which suits YAML and bullet lists. */
function lineChanges(before: string, after: string): { removed: string[]; added: string[] } {
  const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean)
  const remaining = new Map<string, number>()
  for (const line of lines(before)) remaining.set(line, (remaining.get(line) ?? 0) + 1)
  const added: string[] = []
  for (const line of lines(after)) {
    const count = remaining.get(line) ?? 0
    if (count > 0) remaining.set(line, count - 1)
    else added.push(line)
  }
  const removed = [...remaining].flatMap(([line, count]) => Array<string>(count).fill(line))
  return { removed, added }
}

export function fitInputChanges(before: { master: string; guidance: string }, after: { master: string; guidance: string }): FitInputChanges {
  return { master: lineChanges(before.master, after.master), guidance: lineChanges(before.guidance, after.guidance) }
}

export function hasFitInputChanges(changes: FitInputChanges): boolean {
  return [changes.master, changes.guidance].some((part) => part.removed.length > 0 || part.added.length > 0)
}

/** A refresh can reuse the report only when it assessed exactly this requirement list. */
export function sameRequirements(report: ProfileFitReport, analysis: JdAnalysis): boolean {
  return report.requirements.length === analysis.requirements.length
    && report.requirements.every((row, index) => row.requirement === analysis.requirements[index].text)
}

/**
 * Update an existing assessment the way a person would: start from the report,
 * look only at what changed since it was made, and touch the rows that change affects.
 * `changes` is null for older reports whose inputs were never recorded.
 */
export function profileFitRefreshPrompt(instructions: string, analysis: JdAnalysis, masterYaml: string, guidance: string, previous: ProfileFitReport, changes: FitInputChanges | null): string {
  const previousRows = {
    requirements: previous.requirements.map(({ requirement, classification, evidence }) => ({ requirement, classification, evidence })),
    keyGaps: previous.keyGaps,
    recommendedEmphasis: previous.recommendedEmphasis,
  }
  const diff = changes
    ? `CHANGES SINCE THE PREVIOUS ASSESSMENT (lines removed from and added to each input):

${JSON.stringify(changes, null, 2).slice(0, 40_000)}`
    : 'CHANGES SINCE THE PREVIOUS ASSESSMENT: not recorded for this older report. Check each row against the current master and guidance, but keep a row unchanged when its evidence still holds.'
  return `${profileFitPrompt(instructions, analysis, masterYaml, guidance)}

This is an incremental update, not a fresh assessment. PREVIOUS_ASSESSMENT is the report the candidate has been reviewing and correcting. Return the full report in the same shape, with rows in the same order.

- Copy every row exactly as it is (classification and evidence) unless the changes below add, remove, or alter the evidence for that specific requirement.
- For an affected row, reassess it against the current master and guidance and cite the new evidence.
- Never downgrade a row whose evidence is user-confirmed unless the changes remove that confirmation.
- Adjust keyGaps and recommendedEmphasis only as far as the changed rows require.

PREVIOUS_ASSESSMENT:

${JSON.stringify(previousRows, null, 2)}

${diff}`
}

const RANK = { gap: 0, supporting: 1, direct: 2 } as const

/** Code-level backstop: a refresh never quietly downgrades a row the candidate confirmed. */
export function keepConfirmedRows(next: ProfileFitReport, previous: ProfileFitReport, guidanceWithdrawn: boolean): ProfileFitReport {
  // A confirmation can only be withdrawn by removing it from the guidance.
  if (guidanceWithdrawn) return next
  const requirements = next.requirements.map((row, index) => {
    const before = previous.requirements[index]
    const confirmed = before?.evidence.some((item) => /user[- ]confirmed/i.test(item))
    return confirmed && RANK[row.classification] < RANK[before.classification] ? before : row
  })
  const count = (weight: 'must' | 'nice') => {
    const rows = requirements.filter((row) => row.weight === weight)
    return { evidenced: rows.filter((row) => row.classification !== 'gap').length, total: rows.length }
  }
  return { ...next, requirements, coverage: { must: count('must'), nice: count('nice') }, verdict: fitVerdict(requirements) }
}
