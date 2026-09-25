import assert from 'node:assert/strict'
import { resumeFingerprint, resumeReviewParser, resumeReviewPrompt, resumeReviewReplyParser, reviewRequestParser } from '../src/lib/resumeReview'
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
assert.equal(resumeReviewReplyParser.safeParse({ reply: 'I agree; that finding was too broad.', review }).success, true)
assert.equal(resumeReviewReplyParser.safeParse({ reply: '', review }).success, false)
assert.notEqual(resumeFingerprint(input.yaml), resumeFingerprint(input.yaml + ' '))
const feedback = reviewRequestParser.parse({ ...input, message: 'That is intentional. Why change it?', previousReview: review, conversation: [{ role: 'assistant', content: 'Previous review' }] })
assert.equal(reviewRequestParser.safeParse({ ...input, message: 'Why?' }).success, false)
assert.equal(reviewRequestParser.safeParse({ ...input, previousReview: review }).success, false)
const skill = await getSkillForRunner('review-resume', 'text-artifact')
const prompt = resumeReviewPrompt(skill.instructions, parsed)
assert.ok(prompt.includes(JSON.stringify(parsed)))
assert.ok(prompt.includes(skill.instructions))
const feedbackPrompt = resumeReviewPrompt(skill.instructions, feedback)
assert.ok(feedbackPrompt.includes('withdraw'))
assert.ok(feedbackPrompt.includes('That is intentional. Why change it?'))
assert.ok(feedbackPrompt.includes(JSON.stringify(review)))
assert.deepEqual(input, { source: 'master-en', yaml: 'cv:\n  name: Candidate\n  sections: {}\n' })
console.log('Resume review: input validation, route rejection, skill binding, and output validation pass')
