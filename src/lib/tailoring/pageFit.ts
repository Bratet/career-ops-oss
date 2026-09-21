/** The legacy Claude workflow's practical "use the whole page" target. */
export const PAGE_FILL_TARGET = 95

export interface PageFitEvaluation {
  pages: number | null
  fill: number | null
  failures: { kind: string; why?: string }[]
}

export type PageFitState = 'target' | 'underfilled' | 'overflow' | 'unverified' | 'invalid'

export function pageFitState(value: PageFitEvaluation): PageFitState {
  if (value.failures.some((failure) => failure.kind !== 'page-count')) return 'invalid'
  if (value.pages === null || value.fill === null) return 'unverified'
  if (value.pages !== 1) return 'overflow'
  return value.fill >= PAGE_FILL_TARGET ? 'target' : 'underfilled'
}

export function isVerifiedOnePage(value: PageFitEvaluation): boolean {
  const state = pageFitState(value)
  return state === 'target' || state === 'underfilled'
}

export function reachedPageFitTarget(value: PageFitEvaluation): boolean {
  return pageFitState(value) === 'target'
}

/**
 * A renderer outcome is the convergence unit for the goal-driven loop. Failure
 * order is irrelevant, and messages are excluded because their wording can
 * change while the underlying outcome remains stuck.
 */
export function pageFitSignature(value: PageFitEvaluation): string {
  const failureKinds = [...new Set(value.failures.map((failure) => failure.kind))].sort()
  return JSON.stringify([pageFitState(value), value.pages, value.fill, failureKinds])
}

/** Only an exact document/result recurrence is a cycle; equal fill alone is not. */
export function pageFitCandidateKey(yaml: string, value: PageFitEvaluation): string {
  return `${pageFitSignature(value)}\n${yaml}`
}

/**
 * Verified one-page documents always beat overflow or invalid output. Between
 * valid one-page candidates, the fuller first page wins.
 */
export function comparePageFit(a: PageFitEvaluation, b: PageFitEvaluation): number {
  const aVerified = isVerifiedOnePage(a)
  const bVerified = isVerifiedOnePage(b)
  if (aVerified !== bVerified) return aVerified ? 1 : -1
  if (aVerified) return (a.fill ?? 0) - (b.fill ?? 0)

  const aHardFailures = a.failures.filter((failure) => failure.kind !== 'page-count').length
  const bHardFailures = b.failures.filter((failure) => failure.kind !== 'page-count').length
  if (aHardFailures !== bHardFailures) return bHardFailures - aHardFailures

  const aDistance = a.pages === null ? 99 : Math.abs(a.pages - 1)
  const bDistance = b.pages === null ? 99 : Math.abs(b.pages - 1)
  if (aDistance !== bDistance) return bDistance - aDistance
  return (a.fill ?? 0) - (b.fill ?? 0)
}

export function pageFitLabel(value: PageFitEvaluation): string {
  const pages = value.pages === null ? 'page count unverified' : `${value.pages} page${value.pages === 1 ? '' : 's'}`
  const fill = value.fill === null ? 'fill unverified' : `${value.fill}% fill`
  const state = pageFitState(value)
  if (state === 'target') return `${pages}, ${fill}: target reached`
  if (state === 'underfilled') return `${pages}, ${fill}: below the ${PAGE_FILL_TARGET}% target`
  if (state === 'overflow') return `${pages}, ${fill}: must cut to one page`
  if (state === 'invalid') return `${pages}, ${fill}: guard failed`
  return `${pages}, ${fill}`
}
