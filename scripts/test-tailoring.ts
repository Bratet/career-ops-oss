import { readFile } from 'fs/promises'
import { parse } from 'yaml'
import { PATHS } from '../src/lib/paths'
import { jdAnalysisParser, rankedRequirements } from '../src/lib/tailoring/jd'
import { requirementMap, withTailoredDesign, seedYaml } from '../src/lib/tailoring/seed'
import { requirementActionsFor, tailorPrompt, type TailorAttemptFeedback } from '../src/lib/tailoring/rules'
import { acceptedTailoringNotes } from '../src/lib/tailoring/notes'
import type { Op } from '../src/lib/tailoring/ops'
import { parseSkill } from '../src/lib/skills/parser'
import { comparePageFit, isVerifiedOnePage, pageFitCandidateKey, pageFitSignature, pageFitState, reachedPageFitTarget } from '../src/lib/tailoring/pageFit'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const base = {
  company: 'Example',
  role: 'Machine Learning Engineer',
  archetype: 'ml-engineering',
  language: 'en' as const,
  paperSize: 'a4' as const,
  seniority: null,
  location: null,
  workMode: null,
  sponsorship: null,
  keywords: ['Python'],
  summary: 'Build production ML systems.',
}

console.log('tailoring')

const refreshedDesign = await withTailoredDesign('cv:\n  name: Test\ndesign:\n  theme: engineeringresumes\n  page:\n    size: us-letter\n')
check('workspace design refresh preserves paper size', refreshedDesign.includes("size: 'us-letter'"))
check('workspace design refresh uses the original theme fonts', refreshedDesign.includes("Source Sans 3"))
check('workspace design refresh uses the original section rules', !refreshedDesign.includes("line_thickness:"))

const legacy = jdAnalysisParser.parse({
  ...base,
  requirements: [
    { text: 'Python', weight: 'must' },
    { text: 'Docker', weight: 'nice' },
    { text: 'Production ML', weight: 'must' },
  ],
})
check('legacy must ranks migrated', legacy.requirements.filter((requirement) => requirement.weight === 'must').map((requirement) => requirement.rank).join(',') === '1,2')
check('legacy nice ranks migrated', legacy.requirements.find((requirement) => requirement.weight === 'nice')?.rank === 1)

const ranked = jdAnalysisParser.parse({
  ...base,
  requirements: [
    { text: 'Supporting Python', weight: 'must', rank: 2, priorityReason: 'Named later.' },
    { text: 'Core production ownership', weight: 'must', rank: 1, priorityReason: 'The primary responsibility.' },
    { text: 'Docker', weight: 'nice', rank: 1, priorityReason: 'Preferred tool.' },
  ],
})
const ordered = rankedRequirements(ranked)
check('must requirements lead nice requirements', ordered.map((requirement) => requirement.text).join('|') === 'Core production ownership|Supporting Python|Docker')
check('priority reasons survive parsing', ordered[0].priorityReason === 'The primary responsibility.')

const notes = requirementMap(ranked)
check('notes expose ranked priorities', notes.includes('| must 1 | Core production ownership |'))
check('notes explain the ranking', notes.includes('The primary responsibility.'))

const skillMarkdown = '---\nid: test-tailor\nname: Test\ndescription: Test skill\nrunner: cv-operations\nversion: 1\nscope: application\ncapabilities:\n  - read-job-analysis\n  - read-master-resume\n  - propose-cv-operations\n---\n{{RENDER_FEEDBACK}}\n{{POSTING_ANALYSIS}}\n```yaml\n{{CV_YAML}}\n```\nlead: decisive evidence\nprove: a concrete achievement'
const skill = parseSkill(skillMarkdown)
check('skill accepts required runtime placeholders', skill.metadata.runner === 'cv-operations')
let placeholdersProtected = false
try { parseSkill(skillMarkdown.replace('{{POSTING_ANALYSIS}}', '')) } catch { placeholdersProtected = true }
check('skill protects runtime context', placeholdersProtected)
const prompt = tailorPrompt('cv:\n  name: Example', ranked, skill.instructions)
check('prompt follows ranked requirement order', prompt.indexOf('[must 1]') < prompt.indexOf('[must 2]'))
check('prompt uses evidence-first actions', prompt.includes('lead: decisive evidence') && prompt.includes('prove: a concrete achievement'))
check('old candidate-specific rulebook removed', !prompt.includes('roles at my employer always stay'))

const priorOp: Op = {
  op: 'drop',
  path: 'cv.sections.Projects[0]',
  why: 'lower priority than production evidence',
  expect: '{"name":"Older project"}',
}
const feedback: TailorAttemptFeedback[] = [{
  attempt: 1,
  pages: 1,
  fill: 89,
  failures: [],
  ops: [priorOp],
  rejected: [],
  selected: true,
}]
const repairPrompt = tailorPrompt('cv:\n  name: Example', ranked, skill.instructions, feedback)
check('repair prompt includes measured fill', repairPrompt.includes('1 page, 89% fill'))
check('repair prompt includes the prior complete plan', repairPrompt.includes('cv.sections.Projects[0]'))
check('repair prompt requires a replacement against the original', repairPrompt.includes('COMPLETE replacement operation plan'))
const spillPrompt = tailorPrompt('cv:\n  name: Example', ranked, skill.instructions, [
  feedback[0],
  { ...feedback[0], attempt: 2, pages: 2, fill: 98, selected: false },
])
check('verified page is not refilled', spillPrompt.includes('Do not add content merely to increase fill'))

const full = { pages: 1, fill: 95, failures: [] }
const thin = { pages: 1, fill: 65, failures: [] }
const overflow = { pages: 2, fill: 98, failures: [{ kind: 'page-count' }] }
const invalid = { pages: 1, fill: 99, failures: [{ kind: 'em-dash' }] }
check('fill does not rank valid pages', comparePageFit(full, thin) === 0)
check('target candidate stops the loop', reachedPageFitTarget(full) && pageFitState(full) === 'target')
check('thin one-page candidate stays eligible', isVerifiedOnePage(thin) && pageFitState(thin) === 'target' && reachedPageFitTarget(thin))
check('one page beats a fuller overflow', comparePageFit(thin, overflow) > 0)
check('guard failure cannot beat valid one page', comparePageFit(invalid, thin) < 0)
check('renderer outcomes have stable signatures', pageFitSignature(thin) === pageFitSignature({ ...thin }))
check('measurable fill improvement continues', pageFitSignature(thin) !== pageFitSignature({ ...thin, fill: thin.fill + 1 }))
check('the same candidate and outcome form a cycle', pageFitCandidateKey('cv: {}', thin) === pageFitCandidateKey('cv: {}', { ...thin }))
check('different candidates with equal fill keep iterating', pageFitCandidateKey('cv: {a: 1}', thin) !== pageFitCandidateKey('cv: {b: 1}', thin))
check(
  'failure message wording does not prevent convergence',
  pageFitSignature(invalid) === pageFitSignature({ ...invalid, failures: [{ kind: 'em-dash', why: 'different wording' }] }),
)

const actions = requirementActionsFor(ranked, ordered.map((requirement, index) => ({
  requirement: `model wording ${index}`,
  action: index === 2 ? 'gap' as const : 'prove' as const,
  evidence: index === 2 ? 'ignored for gaps' : `evidence ${index}`,
})))
check('evidence rows bind to canonical requirements', actions[0].requirement === 'Core production ownership')
check('gap evidence is cleared', actions[2].evidence === null)

let missingRejected = false
try {
  requirementActionsFor(ranked, actions.slice(1))
} catch {
  missingRejected = true
}
check('missing requirement decisions rejected', missingRejected)

const accepted = acceptedTailoringNotes(
  notes,
  {
    requirementActions: actions,
    ops: [{
      op: 'drop',
      path: 'cv.sections.Projects[0]',
      why: 'less relevant to the primary requirement',
      expect: JSON.stringify({ name: 'Older project' }),
    } satisfies Op],
  },
  'cv:\n  headline: Production ML Engineer\n',
  { pages: 1, fill: 94 },
)
check('accepted proposal fills requirement evidence', accepted.includes('evidence 0'))
check('accepted proposal records kept cuts', accepted.includes('Older project'))
check('accepted proposal records rendered result', accepted.includes('1 page, 94% fill, headline used: "Production ML Engineer"'))


for (const language of ['en', 'fr'] as const) {
  const source = parse(await readFile(PATHS.ownCv[language], 'utf-8'))
  const seeded = parse(await seedYaml({ ...ranked, language, paperSize: 'us-letter' }))
  check(`${language} baseline preserves general content and section order`, JSON.stringify(seeded.cv) === JSON.stringify(source.cv))
  check(`${language} baseline preserves locale`, JSON.stringify(seeded.locale) === JSON.stringify(source.locale))
  check(`${language} baseline honors JD paper size`, seeded.design.page.size === 'us-letter')
}
const dualPrompt = tailorPrompt('GENERAL_BASE', ranked, skill.instructions, [], 'MASTER_EVIDENCE', 'CANDIDATE_PREFERENCE')
check('both baseline and master are supplied before selection', dualPrompt.includes('GENERAL_BASE') && dualPrompt.includes('MASTER_EVIDENCE'))
check('candidate preferences reach tailoring', dualPrompt.includes('CANDIDATE_PREFERENCE'))
check('page count verified without fill measurement', isVerifiedOnePage({ pages: 1, fill: null, failures: [] }))
console.log(failures ? `\n${failures} failure(s)` : '\nall tailoring checks pass')
process.exit(failures ? 1 : 0)
