import { z } from 'zod'

/**
 * JD analysis: the first structured LLM call.
 *
 * It extracts the posting and ranks requirements. It does not decide what goes
 * on the CV; the tailoring pass maps those priorities to master-resume evidence.
 */

export const jdAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  // OpenAI structured outputs rejects a schema whose `required` omits any key in
  // `properties`, so every field is listed and the genuinely optional ones are
  // nullable instead. Claude accepts this shape too, so one schema serves both.
  required: [
    'company', 'role', 'archetype', 'language', 'paperSize', 'requirements', 'keywords',
    'seniority', 'location', 'workMode', 'sponsorship', 'summary',
  ],
  properties: {
    company: { type: 'string', description: 'Hiring company. The employer, not the recruiting agency, when both appear.' },
    role: { type: 'string', description: 'Exact job title as posted, plus location and work mode in parentheses.' },
    archetype: {
      type: 'string',
      enum: ['data-science', 'ml-engineering', 'ai-llm', 'applied-research', 'ml-performance', 'software', 'other'],
    },
    language: { type: 'string', enum: ['en', 'fr'], description: 'Language the posting is written in.' },
    paperSize: { type: 'string', enum: ['a4', 'us-letter'], description: 'us-letter for US/Canada roles, a4 otherwise.' },
    seniority: { type: ['string', 'null'], description: 'Stated seniority, or null if the posting does not say.' },
    location: { type: ['string', 'null'] },
    workMode: { type: ['string', 'null'], enum: ['remote', 'hybrid', 'onsite', 'unclear', null] },
    sponsorship: {
      type: ['string', 'null'],
      enum: ['offered', 'not-offered', 'unclear', null],
      description: 'Whether the posting mentions visa sponsorship.',
    },
    requirements: {
      type: 'array',
      description: 'Every stated requirement, split into atomic items and ranked within its must/nice group.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'weight', 'rank', 'priorityReason'],
        properties: {
          text: { type: 'string' },
          weight: { type: 'string', enum: ['must', 'nice'] },
          rank: {
            type: 'integer',
            minimum: 1,
            description: 'Priority within the same weight group. 1 is highest; ranks are unique and sequential.',
          },
          priorityReason: {
            type: 'string',
            description: 'One short reason grounded in the posting: core duty, repetition, early placement, or explicit screening criterion.',
          },
        },
      },
    },
    keywords: {
      type: 'array',
      description: 'Concrete tools, frameworks, and techniques named in the posting.',
      items: { type: 'string' },
    },
    summary: { type: ['string', 'null'], description: 'Two sentences on what the role actually is.' },
  },
} as const

const rawJdAnalysisParser = z.object({
  company: z.string(),
  role: z.string(),
  archetype: z.string(),
  language: z.enum(['en', 'fr']),
  paperSize: z.enum(['a4', 'us-letter']),
  seniority: z.string().nullish(),
  location: z.string().nullish(),
  workMode: z.string().nullish(),
  sponsorship: z.string().nullish(),
  requirements: z.array(z.object({
    text: z.string(),
    weight: z.enum(['must', 'nice']),
    rank: z.number().int().positive().optional(),
    priorityReason: z.string().optional(),
  })),
  keywords: z.array(z.string()),
  summary: z.string().nullish(),
})

/**
 * Historical jd-analysis.json files predate ranking. Canonicalize every group so
 * callers always receive unique sequential ranks without paying for a new model
 * call merely to migrate cached data.
 */
export const jdAnalysisParser = rawJdAnalysisParser.transform((analysis) => {
  const requirements = analysis.requirements.map((requirement, index) => ({ requirement, index }))

  for (const weight of ['must', 'nice'] as const) {
    requirements
      .filter(({ requirement }) => requirement.weight === weight)
      .sort((a, b) => (a.requirement.rank ?? a.index + 1) - (b.requirement.rank ?? b.index + 1) || a.index - b.index)
      .forEach(({ requirement }, index) => {
        requirement.rank = index + 1
        requirement.priorityReason ||= 'Original posting order (legacy analysis).'
      })
  }

  return {
    ...analysis,
    requirements: requirements.map(({ requirement }) => ({
      text: requirement.text,
      weight: requirement.weight,
      rank: requirement.rank!,
      priorityReason: requirement.priorityReason!,
    })),
  }
})

export type JdAnalysis = z.infer<typeof jdAnalysisParser>

/** Must requirements lead; rank 1 leads within each must/nice group. */
export function rankedRequirements(analysis: JdAnalysis): JdAnalysis['requirements'] {
  return [...analysis.requirements].sort(
    (a, b) => (a.weight === b.weight ? a.rank - b.rank : a.weight === 'must' ? -1 : 1),
  )
}

export function jdPrompt(jdText: string, instructions: string): string {
  return instructions.replaceAll('{{JOB_POSTING}}', jdText.slice(0, 60_000))
}
