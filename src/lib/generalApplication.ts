import { z } from 'zod'

const line = z.string().trim().max(300).refine((value) => !/[\r\n|]/.test(value), 'Use a single line without |')
export const generalApplicationSchema = z.object({
  company: line.pipe(z.string().min(1, 'Company is required')),
  role: line.default(''),
  location: line.default(''),
  contact: line.default(''),
  url: z.union([z.literal(''), z.string().url().max(2000).refine((value) => /^https?:\/\//.test(value))]).default(''),
  language: z.enum(['en', 'fr']),
  notes: z.string().trim().max(5000).default(''),
})

export type GeneralApplication = z.infer<typeof generalApplicationSchema>
