import type { JdAnalysis } from './tailoring/jd'

export interface CandidateEligibility {
  workAuthorization: { country: string; aliases: string[]; authorized: boolean; confirmedOn: string }[]
}
export interface EligibilityIssue {
  requirement: string
  status: 'unmet' | 'confirm' | 'met'
  explanation: string
}

const AUTHORIZATION = /work permit|work authori[sz]ation|right to work|authori[sz]ed to work|permis de travail|autorisation de travail/i
const SCREENING = /citizenship|citizen(?:s)? of|nationality|security clearance|must (?:reside|live|be based)|résid|habilitation|nationalité/i

/** Surface eligibility separately from technical fit; never infer a candidate's legal status. */
export function eligibilityIssues(analysis: JdAnalysis, profile: CandidateEligibility): EligibilityIssue[] {
  const issues = analysis.requirements.filter((row) => row.weight === 'must' && (AUTHORIZATION.test(row.text) || SCREENING.test(row.text))).map((row): EligibilityIssue => {
    const authorization = AUTHORIZATION.test(row.text)
    const known = authorization ? profile.workAuthorization.find((record) => record.aliases.some((alias) => row.text.toLowerCase().includes(alias.toLowerCase()))) : undefined
    return {
      requirement: row.text,
      status: known ? known.authorized ? 'met' : 'unmet' : 'confirm',
      explanation: known
        ? known.authorized
          ? `You confirmed that you have work authorization for ${known.country}.`
          : `You confirmed that you do not have work authorization for ${known.country}. This requirement is currently unmet.`
        : 'Your eligibility for this requirement has not been confirmed. Check it before relying on the skills assessment.',
    }
  })
  if (analysis.sponsorship === 'not-offered') issues.push({
    requirement: 'Visa sponsorship is not offered.', status: 'confirm',
    explanation: 'If you need sponsorship for this role, this is a critical hiring constraint to clarify with the employer.',
  })
  return issues.sort((a, b) => ({ unmet: 0, confirm: 1, met: 2 }[a.status] - { unmet: 0, confirm: 1, met: 2 }[b.status]))
}
