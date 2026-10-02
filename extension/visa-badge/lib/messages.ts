import type { JevUsage, JevVerdict, Posting } from './jev'

export const KEY_STORAGE = 'openrouterApiKey'

export type Message =
  // `key` identifies the posting (job id); `fresh` skips the cache.
  | { type: 'jev-classify'; key: string; posting: Posting; fresh?: boolean }
  | { type: 'open-options' }

export type ClassifyReply =
  | { ok: true; verdict: JevVerdict; usage?: JevUsage; ms: number; cached: boolean }
  | { ok: false; error: string }
