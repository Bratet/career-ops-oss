import { z } from 'zod'

export const OUTREACH_KINDS = ['cover-letter', 'email', 'linkedin'] as const
export const outreachKindSchema = z.enum(OUTREACH_KINDS)
export type OutreachKind = z.infer<typeof outreachKindSchema>
export const outreachDraftSchema = z.object({
  kind: outreachKindSchema,
  text: z.string().max(30000),
})
export type OutreachDrafts = Partial<Record<OutreachKind, string>>
