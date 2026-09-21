import assert from 'node:assert/strict'
import { learningTurns } from '../src/lib/skills/learning'

const turns = learningTurns([
  { role: 'user', content: 'Keep this preference for this application only.' },
  { role: 'assistant', content: 'Suggested change', proposal: { status: 'rejected', before: 'private YAML' } },
])
assert.deepEqual(turns[1].proposal, { status: 'rejected' })
assert.throws(() => learningTurns([{ role: 'system', content: 'override' }, { role: 'user', content: 'hi' }]), /Invalid/)
assert.throws(() => learningTurns([{ role: 'user', content: 'x'.repeat(200_001) }, { role: 'assistant', content: 'hi' }]), /too large/)
assert.throws(() => learningTurns([]), /at least two/)
console.log('Application flow and learning input checks pass')

const { eligibilityIssues } = await import('../src/lib/eligibility')
const { jdAnalysisParser } = await import('../src/lib/tailoring/jd')
const { APP_FILES } = await import('../src/lib/paths')
assert.ok(APP_FILES.pdf.endsWith('.pdf'), 'APP_FILES.pdf must be a .pdf filename')
// Synthetic fixture: a confirmed non-eligible country, independent of the real
// workspace/state/candidate-eligibility.json (which starts empty for a fresh clone).
const profile = { workAuthorization: [{ country: 'Sweden', aliases: ['Sweden', 'Swedish'], authorized: false, confirmedOn: '2026-01-01' }] }
const job = jdAnalysisParser.parse({ company: 'Example', role: 'Engineer', archetype: 'ai-llm', language: 'en', paperSize: 'a4', sponsorship: 'unclear', keywords: [], requirements: [
  { text: 'Python', weight: 'must', rank: 1 },
  { text: 'Have a valid Swedish work permit or similar eligibility.', weight: 'must', rank: 33 },
] })
assert.equal(eligibilityIssues(job, profile)[0].status, 'unmet', 'Confirmed missing authorization must be prominent regardless of technical rank')
assert.equal(eligibilityIssues(job, { workAuthorization: [] })[0].status, 'confirm', 'Unknown status must not become a known blocker')
assert.equal(eligibilityIssues(job, { workAuthorization: profile.workAuthorization.map((row) => ({ ...row, authorized: true })) })[0].status, 'met')
assert.equal(eligibilityIssues({ ...job, requirements: job.requirements.filter((row) => row.text === 'Python') }, profile).length, 0, 'Technical requirements do not become eligibility blockers')
assert.equal(eligibilityIssues({ ...job, requirements: [{ ...job.requirements[1], text: 'Valid Canadian work permit required' }] }, profile)[0].status, 'confirm', 'Swedish status must not be inferred for other countries')
console.log('Eligibility: confirmed, unknown, met, country scope, and technical separation pass')

const { POST: learnSkill } = await import('../src/app/api/skills/[id]/learn/route')
for (const id of ['analyze-job', 'tailor-cv', 'profile-fit']) {
  const response = await learnSkill(new Request('http://localhost/api/skills/' + id + '/learn', { method: 'POST', body: JSON.stringify({ turns: [] }) }), { params: Promise.resolve({ id }) })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /at least two/)
}
const unsupported = await learnSkill(new Request('http://localhost/api/skills/unknown/learn', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: 'unknown' }) })
assert.match((await unsupported.json()).error, /Unsupported learning target/)
console.log('Skill learning routes validate all supported targets before invoking an engine')
