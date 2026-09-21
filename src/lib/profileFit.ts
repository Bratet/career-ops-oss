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

export function profileFitPrompt(instructions: string, analysis: JdAnalysis, masterYaml: string): string {
  return instructions
    .replace('{{JD_ANALYSIS}}', JSON.stringify(analysis, null, 2))
    .replace('{{MASTER_RESUME}}', masterYaml.slice(0, 60_000))
}
