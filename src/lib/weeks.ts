/** Pipeline order for the funnel. Statuses outside it keep their own row at the end. */
export const STAGE_ORDER = ['Evaluated', 'Tailored', 'Applied', 'Responded', 'Interview', 'Offer']

export function funnelData(byStatus: { status: string; count: number }[]) {
  const known = STAGE_ORDER.map((status) => ({
    status,
    count: byStatus.find((s) => s.status === status)?.count ?? 0,
  })).filter((s) => s.count > 0)

  const rest = byStatus
    .filter((s) => !STAGE_ORDER.includes(s.status))
    .sort((a, b) => b.count - a.count)

  return [...known, ...rest]
}
