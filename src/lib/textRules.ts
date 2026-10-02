import type { Failure } from './validate'

/**
 * The rules every recruiter-facing string is held to, in any document: resume
 * lines and cover letters alike. Kept free of Node imports so the browser can
 * load the modules that use them.
 */

/** [text](url) is a markdown link and fine. [anything else] is an unfilled placeholder. */
export const PLACEHOLDER_RE = /\[[^\]\n]*\](?!\()/g

export function checkText(value: string, where: string, forbiddenTerms: readonly string[] = []): Failure[] {
  const failures: Failure[] = []
  for (const name of forbiddenTerms) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(value)) {
      failures.push({ kind: 'forbidden-name', where, why: `forbidden name "${name}" appears` })
    }
  }
  if (value.includes('—')) {
    failures.push({
      kind: 'em-dash',
      where,
      why: 'em dash present; strongest AI tell to a recruiter',
    })
  }
  for (const m of value.matchAll(PLACEHOLDER_RE)) {
    failures.push({ kind: 'placeholder', where, why: `bracketed placeholder ${JSON.stringify(m[0])}` })
  }
  return failures
}
