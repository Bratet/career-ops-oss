import { join } from 'path'
import { readFile } from 'fs/promises'
import { listApplications } from './applications'
import { APP_FILES, PATHS } from './paths'
import { SENT_STATUSES } from './statuses'

/**
 * Finds earlier applications for the same job before a new one is created.
 *
 * Postings get pasted again weeks later (re-shared on LinkedIn, a different
 * job board, a translated page header), so the posting text is compared too,
 * not just company and role, whose wording the analysis may phrase differently.
 */

export type DuplicateReason = 'same-posting' | 'same-role' | 'same-company'

export interface ExistingApplication {
  key: string
  company: string
  role: string
  date: string
  status: string
  jd?: string | null
}

export interface DuplicateMatch {
  key: string
  company: string
  role: string
  date: string
  status: string
  reason: DuplicateReason
  /** The tracker says something was already sent for it. */
  applied: boolean
}

const LEGAL_SUFFIX = /\b(inc|llc|ltd|limited|gmbh|bv|b\.v|sa|sas|sarl|ag|plc|corp|corporation|co|company|group|holding)\b\.?/g
const ROLE_STOPWORDS = new Set(['the', 'a', 'an', 'and', 'of', 'for', 'in', 'at', 'with', 'to', 'remote', 'hybrid', 'onsite', 'on', 'site', 'm', 'f', 'h', 'x', 'w', 'd'])

export function normalizeCompany(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(LEGAL_SUFFIX, ' ').replace(/[^a-z0-9]+/g, '')
}

function roleTokens(role: string): Set<string> {
  // Drop parentheticals like "(Amsterdam, hybrid)" and the tracker's own notes.
  const words = role.toLowerCase().replace(/\([^)]*\)/g, ' ').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9+#]+/).filter((word) => word && !ROLE_STOPWORDS.has(word))
  return new Set(words)
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const item of a) if (b.has(item)) shared++
  return shared / (a.size + b.size - shared)
}

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean)
  const out = new Set<string>()
  for (let i = 0; i + 3 <= words.length; i++) out.add(words.slice(i, i + 3).join(' '))
  return out
}

/** Similar enough to be the same posting despite headers, spacing, or a missing heading. */
export function samePosting(a: string, b: string): boolean {
  return jaccard(shingles(a), shingles(b)) >= 0.6
}

export function sameRole(a: string, b: string): boolean {
  return jaccard(roleTokens(a), roleTokens(b)) >= 0.5
}

const RANK: Record<DuplicateReason, number> = { 'same-posting': 0, 'same-role': 1, 'same-company': 2 }

export function findDuplicates(
  candidate: { company: string; role: string; jd?: string | null },
  existing: ExistingApplication[],
): DuplicateMatch[] {
  const company = normalizeCompany(candidate.company)
  const matches: DuplicateMatch[] = []
  for (const app of existing) {
    const posting = !!candidate.jd && !!app.jd && samePosting(candidate.jd, app.jd)
    const sameCompany = !!company && normalizeCompany(app.company) === company
    if (!posting && !sameCompany) continue
    const reason: DuplicateReason = posting ? 'same-posting' : sameRole(candidate.role, app.role) ? 'same-role' : 'same-company'
    matches.push({
      key: app.key, company: app.company, role: app.role, date: app.date, status: app.status, reason,
      applied: SENT_STATUSES.includes(app.status),
    })
  }
  return matches.sort((a, b) => RANK[a.reason] - RANK[b.reason] || b.date.localeCompare(a.date))
}

/** A posting or role match blocks creation until the candidate confirms; a company match only informs. */
export function isBlocking(match: DuplicateMatch): boolean {
  return match.reason !== 'same-company'
}

export async function findExistingApplications(candidate: { company: string; role: string; jd?: string | null }): Promise<DuplicateMatch[]> {
  const apps = await listApplications()
  const existing = await Promise.all(apps.map(async (app): Promise<ExistingApplication> => {
    let jd: string | null = null
    if (candidate.jd && app.folder?.has.jd) {
      jd = await readFile(join(PATHS.applications, app.folder.folder, APP_FILES.jd), 'utf-8').catch(() => null)
    }
    return {
      key: app.key,
      company: app.row?.company ?? app.folder?.slug ?? '',
      role: app.row?.role ?? '',
      date: app.row?.date ?? app.folder?.date ?? '',
      status: app.row?.status ?? '',
      jd,
    }
  }))
  return findDuplicates(candidate, existing)
}
