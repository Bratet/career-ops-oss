import { join } from 'path'
import { CANDIDATE } from './candidate'
import { REPO_ROOT, slugify } from './repoRoot'

export { REPO_ROOT, slugify }

/**
 * Everything the app reads or writes lives under workspace/, grouped by role
 * rather than by source-vs-generated: resumes/ (hand-maintained masters + the
 * general CV, each paired with its own rendered PDF), applications/ (one
 * folder per tailored application, entirely reproducible from resumes/), and
 * state/ (the tracker database, run logs, chats, skills, in-progress drafts).
 */
const WORKSPACE = join(REPO_ROOT, 'workspace')
const STATE = join(WORKSPACE, 'state')
const RESUMES = join(WORKSPACE, 'resumes')

export const PATHS = {
  root: REPO_ROOT,
  workspace: WORKSPACE,
  state: STATE,
  tracker: join(STATE, 'applications.md'),
  appIndex: join(STATE, 'app-index.json'),
  settings: join(STATE, 'settings.json'),
  savedSearches: join(STATE, 'saved-searches.json'),
  candidateEligibility: join(STATE, 'candidate-eligibility.json'),
  candidateGuidance: join(STATE, 'candidate-guidance.md'),
  skills: join(STATE, 'skills'),
  skillRevisions: join(STATE, 'skill-revisions'),
  runs: join(STATE, 'runs'),
  chats: join(STATE, 'chats'),
  workspaces: join(STATE, 'workspaces'),
  applicationTrash: join(STATE, '.trash', 'applications'),
  applications: join(WORKSPACE, 'applications'),
  templates: join(REPO_ROOT, 'templates'),
  tailoredDesign: join(REPO_ROOT, 'templates', 'tailored-design.yaml'),
  patches: join(REPO_ROOT, 'patches'),
  pdfWorker: join(REPO_ROOT, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
  resumes: RESUMES,
  masters: {
    en: join(RESUMES, 'masters', 'master-resume-english.yaml'),
    fr: join(RESUMES, 'masters', 'master-resume-french.yaml'),
  },
  ownCv: {
    en: join(RESUMES, 'own', `cv-${CANDIDATE.slug}-en.yaml`),
    fr: join(RESUMES, 'own', `cv-${CANDIDATE.slug}-fr.yaml`),
  },
} as const

export type Lang = 'en' | 'fr'

/** Canonical filenames inside an application folder. */
export const APP_FILES = {
  general: 'general-application.json',
  jd: 'jd.md',
  analysis: 'jd-analysis.json',
  yaml: `cv-${CANDIDATE.slug}.yaml`,
  pdf: `${CANDIDATE.pascalName}.pdf`,
  notes: 'tailoring-notes.md',
  letterInput: 'cover-letter-input.json',
  letterPdf: `cover-letter-${CANDIDATE.slug}.pdf`,
} as const
