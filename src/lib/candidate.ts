import { readFileSync } from 'fs'
import { join } from 'path'
import { REPO_ROOT, slugify } from './repoRoot'

export interface Candidate {
  fullName: string
  slug: string
  /** Filename-safe form of fullName, e.g. "Jordan_Candidate". */
  pascalName: string
  /**
   * Names never allowed on a generated resume/cover letter (e.g. a past
   * employer's confidential client names). Empty by default.
   */
  confidentialTerms: string[]
}

interface CandidateConfig {
  fullName: string
  confidentialTerms?: string[]
}

/** Used whenever config/candidate.json is absent — e.g. a fresh clone, or a sandboxed test run. */
const DEFAULT_CONFIG: CandidateConfig = { fullName: 'Jordan Candidate', confidentialTerms: [] }

function loadConfig(): CandidateConfig {
  const configPath = join(REPO_ROOT, 'config', 'candidate.json')
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as CandidateConfig
  } catch {
    console.warn(
      'no config/candidate.json — using placeholder candidate data, copy config/candidate.example.json to get started',
    )
    return DEFAULT_CONFIG
  }
}

function toPascalName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_')
}

const config = loadConfig()

export const CANDIDATE: Candidate = {
  fullName: config.fullName,
  slug: slugify(config.fullName),
  pascalName: toPascalName(config.fullName),
  confidentialTerms: config.confidentialTerms ?? [],
}
