import { z } from 'zod'

export const savedSearchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, 'Give this search a name.').max(120),
  url: z.string().trim().max(12000).url().refine((value) => {
    try {
      const url = new URL(value)
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
    } catch { return false }
  }, 'Use an http or https URL without credentials.'),
  track: z.string().trim().max(80),
  notes: z.string().trim().max(2000),
}).strict()

export const savedSearchesSchema = z.array(savedSearchSchema).max(500).refine(
  (items) => new Set(items.map((item) => item.id)).size === items.length,
  'Search IDs must be unique.',
)

export type SavedSearch = z.infer<typeof savedSearchSchema>
