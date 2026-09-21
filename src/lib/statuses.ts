/**
 * Status constants live apart from tracker.ts because client components need
 * them, and tracker.ts imports fs/promises — importing it from the browser
 * bundle would fail the build.
 */

export const STATUSES = [
  'Preparing',
  'Evaluated',
  'Applied',
  'Responded',
  'Interview',
  'Offer',
  'Rejected',
  'Discarded',
  'SKIP',
] as const

export type Status = (typeof STATUSES)[number]

/** Statuses that mean the company came back to us, for response-rate stats. */
export const RESPONDED_STATUSES: readonly string[] = ['Responded', 'Interview', 'Offer', 'Rejected']

/** Statuses that mean we actually sent something. */
export const SENT_STATUSES: readonly string[] = ['Applied', ...RESPONDED_STATUSES]
