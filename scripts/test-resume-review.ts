import assert from 'node:assert/strict'
import { resumeReviewParser, resumeReviewPrompt, reviewRequestParser } from '../src/lib/resumeReview'
import { POST } from '../src/app/api/profile/review/route'
import { getSkillForRunner } from '../src/lib/skills/registry'

const input = { source: 'master-en', yaml: 'cv:\n  name: Candidate\n  sections: {}\n' }
const parsed = reviewRequestParser.parse(input)
for (const invalid of [null, {}, { ...input, source: '../private' }, { ...input, yaml: 'cv: [' }, { ...input, yaml: 'design: {}' }, { ...input, yaml: 'x'.repeat(150001) }]) {
  const response = await POST(new Request('http://localhost/api/profile/review', { method: 'POST', body: JSON.stringify(invalid) }))
  assert.equal(response.status, 400)
}
const malformed = await POST(new Request('http://localhost/api/profile/review', { method: 'POST', body: '{' }))
assert.equal(malformed.status, 400)

const review = { assessment: 'Clear experience.', strengths: ['Specific ownership.'], findings: [{ location: 'Experience', excerpt: null, issue: 'Outcome unclear.', recommendation: 'Ask what changed.', suggestedWording: null, kind: 'question' }], questions: ['What changed?'] }
assert.deepEqual(resumeReviewParser.parse(review), review)
assert.equal(resumeReviewParser.safeParse({ ...review, findings: [{ ...review.findings[0], kind: 'apply-edit' }] }).success, false)
assert.equal(resumeReviewParser.safeParse({ assessment: 'Incomplete' }).success, false)
const skill = await getSkillForRunner('review-resume', 'text-artifact')
const prompt = resumeReviewPrompt(skill.instructions, parsed)
assert.ok(prompt.includes(JSON.stringify(parsed)))
assert.ok(prompt.includes(skill.instructions))
assert.deepEqual(input, { source: 'master-en', yaml: 'cv:\n  name: Candidate\n  sections: {}\n' })
console.log('Resume review: input validation, route rejection, skill binding, and output validation pass')
