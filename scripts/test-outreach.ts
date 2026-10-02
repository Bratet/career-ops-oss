import assert from 'node:assert/strict'
import { letterBody, outreachDraftSchema, outreachPrompt } from '../src/lib/outreach'
import { letterAgentPrompt, emptyCoverLetter } from '../src/lib/coverLetter'
import { getSkillForRunner } from '../src/lib/skills/registry'
import { isLearnableSkill } from '../src/lib/skills/learning'
import { POST, PUT } from '../src/app/api/applications/[key]/outreach/route'

for (const kind of ['cover-letter', 'email', 'linkedin']) {
  assert.deepEqual(outreachDraftSchema.parse({ kind, text: 'Hello\n\nA draft.' }), { kind, text: 'Hello\n\nA draft.' })
}
assert.equal(outreachDraftSchema.safeParse({ kind: 'email', text: '' }).success, true)
assert.equal(outreachDraftSchema.safeParse({ kind: '../invalid', text: 'x' }).success, false)
assert.equal(outreachDraftSchema.safeParse({ kind: 'email', text: 'x'.repeat(30001) }).success, false)
assert.equal(outreachDraftSchema.safeParse({ kind: 'email', text: 1 }).success, false)
const params = { params: Promise.resolve({ key: 'invalid-outreach-test' }) }
for (const handler of [POST, PUT]) {
  const response = await handler(new Request('http://localhost/api/outreach', { method: 'POST', body: JSON.stringify({ kind: 'invalid' }) }), params)
  assert.equal(response.status, 400, 'Invalid input rejected before files or an engine are accessed')
}
const instructions = await POST(new Request('http://localhost/api/outreach', { method: 'POST', body: JSON.stringify({ kind: 'email', instructions: 'x'.repeat(8001) }) }), params)
assert.equal(instructions.status, 400)
// Cover letters have their own editor; the outreach route refuses them.
const letterViaOutreach = await POST(new Request('http://localhost/api/outreach', { method: 'POST', body: JSON.stringify({ kind: 'cover-letter', instructions: '' }) }), params)
assert.equal(letterViaOutreach.status, 400)
assert.match((await letterViaOutreach.json()).error, /cover letter editor/)

// Writing rules live in versioned skills, not in code.
const outreachSkill = await getSkillForRunner('write-outreach', 'text-artifact')
const letterSkill = await getSkillForRunner('write-cover-letter', 'text-artifact')
for (const skill of [outreachSkill, letterSkill]) {
  assert.match(skill.instructions, /visa/i, 'both skills keep the no-visa rule')
  assert.match(skill.instructions, /em dash/i)
  assert.equal(isLearnableSkill(skill.metadata.id), true, 'chats can propose improvements to both')
}
assert.match(letterSkill.instructions, /confirmed writing preferences/, 'the public skill follows candidate guidance')

const withLetter = outreachPrompt({ kind: 'email', skill: 'SKILL-TEXT', company: 'Acme', role: 'AI Engineer', resume: 'cv: {}', jd: 'posting', coverLetter: 'Letter body.', instructions: '' })
assert.match(withLetter, /SKILL-TEXT/)
assert.match(withLetter, /do not repeat anything it says/)
assert.match(withLetter, /Letter body\./)
assert.doesNotMatch(outreachPrompt({ kind: 'linkedin', skill: 's', company: 'Acme', role: 'r', resume: '', jd: null, coverLetter: null, instructions: '' }), /Cover letter body/)
assert.match(letterAgentPrompt({ skill: 'LETTER-SKILL', company: 'Acme', role: 'r', lang: 'en', resumeYaml: '', jd: null, guidance: '', letter: emptyCoverLetter(), conversation: [], message: 'Draft it' }), /LETTER-SKILL/)

assert.equal(letterBody(JSON.stringify({ content: '  Hello.\n\nBye.  ' })), 'Hello.\n\nBye.')
assert.equal(letterBody(null), null)
assert.equal(letterBody('not json'), null)
assert.equal(letterBody(JSON.stringify({ content: '' })), null)
assert.equal(isLearnableSkill('review-resume'), false)

console.log('Outreach: message types, drafts, limits, route rejection, skill-driven prompts, cover letter context, and learnable skills pass')
