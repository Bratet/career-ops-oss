import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assertLetterBase,
  CoverLetterConflict,
  letterKey,
  letterFromInputs,
  letterMatchesFinalized,
  checkLetter,
  coverLetterFromWorkspace,
  coverLetterSchema,
  emptyCoverLetter,
  formatLetterDate,
  letterAgentSchema,
  letterInputs,
  senderFromResume,
  wordCount,
  COVER_LETTER_FIELDS,
  type CoverLetter,
} from '../src/lib/coverLetter'
import { renderCoverLetter } from '../src/lib/coverLetterRender'
import { cleanupRender } from '../src/lib/render'
import { POST, PUT } from '../src/app/api/applications/[key]/cover-letter/route'
import { POST as PREVIEW } from '../src/app/api/applications/[key]/cover-letter/preview/route'
import { POST as FINALIZE } from '../src/app/api/applications/[key]/cover-letter/finalize/route'

const today = new Date('2026-09-28T12:00:00Z')
const letter: CoverLetter = {
  ...emptyCoverLetter({ companyName: 'Example Co', today }),
  content: 'I am applying for the AI Engineer role.\r\n\r\nI build production RAG systems.\r\n\r\nHappy to talk if this looks like a fit.',
}
const sender = { name: 'Jordan Candidate', email: 'jordan@example.com', phone: '+1 555 0100' }

// Defaults and dates.
assert.equal(letter.date, 'September 28, 2026')
assert.equal(formatLetterDate(today, 'fr'), '28 septembre 2026')
assert.equal(letter.closing, 'Sincerely,')
assert.equal(wordCount('  one two\n\nthree '), 3)
assert.equal(wordCount(''), 0)

// Template inputs: the saved-file shape, never a location, CRLF normalized for the paragraph split.
const inputs = letterInputs({ ...letter, closing: ' ' }, sender)
assert.equal(inputs.sender_location, '', 'no location ever goes on the letter')
assert.equal(inputs.content.includes('\r'), false)
assert.equal(inputs.content.split('\n\n').length, 3)
assert.equal(inputs.closing, 'Sincerely,', 'an empty closing falls back to the template default')
assert.deepEqual(Object.keys(inputs).sort(), [
  'closing', 'company_address', 'company_name', 'content', 'date', 'paper', 'recipient_name', 'recipient_title',
  'salutation', 'sender_email', 'sender_location', 'sender_name', 'sender_phone',
])

// The signature is passed only when one exists, in the root-relative form the saved inputs use.
assert.equal(letterInputs(letter, sender, 'config/signature.png').signature, 'config/signature.png')
assert.equal('signature' in inputs, false)

// Sender and paper come from the finalized resume.
const fromResume = senderFromResume(`cv:\n  name: 'Jordan Candidate'\n  email: 'a@b.c'\n  phone: '+1 555 0100'\n  location: 'Example City'\ndesign:\n  page:\n    size: us-letter\n`)
assert.deepEqual(fromResume.sender, { name: 'Jordan Candidate', email: 'a@b.c', phone: '+1 555 0100' })
assert.equal(fromResume.paper, 'us-letter')
assert.equal(senderFromResume('not: [valid').paper, 'a4', 'unreadable YAML still yields a renderable default')

// The rules shared with the resume, per field.
assert.deepEqual(checkLetter(letter), [])
const kinds = (value: Partial<CoverLetter>) => checkLetter({ ...letter, ...value }).map((failure) => `${failure.where}:${failure.kind}`)
assert.deepEqual(kinds({ content: 'I built it — fast.' }), ['content:em-dash'])
assert.deepEqual(checkLetter({ ...letter, content: 'Built a chatbot for Confidential Co.' }, ['Confidential Co']).map((failure) => `${failure.where}:${failure.kind}`), ['content:forbidden-name'])
assert.deepEqual(kinds({ companyName: 'Confidential Co' }), [], 'private terms are supplied by server-side candidate config')
assert.deepEqual(kinds({ recipientName: '[Hiring Manager]' }), ['recipientName:placeholder'])
assert.deepEqual(kinds({ content: '  ' }), [], 'an empty draft is not an error until finalize')

// Schema limits.
assert.equal(coverLetterSchema.safeParse(letter).success, true)
assert.equal(coverLetterSchema.safeParse({ ...letter, paper: 'a5' }).success, false)
assert.equal(coverLetterSchema.safeParse({ ...letter, content: 'x'.repeat(20001) }).success, false)
assert.equal(coverLetterSchema.safeParse({ ...letter, date: undefined }).success, false)

// Older plain-text drafts become the body; a valid structured draft wins.
const legacy = coverLetterFromWorkspace(undefined, 'Old draft text', { companyName: 'Example Co', paper: 'a4' })
assert.equal(legacy.content, 'Old draft text')
assert.equal(legacy.companyName, 'Example Co')
assert.deepEqual(coverLetterFromWorkspace(letter, 'ignored', { companyName: 'x', paper: 'a4' }), letter)
assert.equal(coverLetterFromWorkspace({ ...letter, paper: 'a5' } as never, 'fallback', { companyName: 'x', paper: 'a4' }).content, 'fallback')

// The finalize status: saved template inputs map back to the letter they came from.
const finalizedInputs = JSON.stringify(letterInputs(letter, sender, 'config/signature.png'))
assert.equal(letterMatchesFinalized(letter, letterFromInputs(finalizedInputs)), true, 'CRLF and trimming do not count as a change')
assert.equal(letterMatchesFinalized({ ...letter, content: `${letter.content} More.` }, letterFromInputs(finalizedInputs)), false)
assert.equal(letterMatchesFinalized({ ...letter, closing: '' }, letterFromInputs(JSON.stringify(letterInputs({ ...letter, closing: '' }, sender)))), true)
assert.equal(letterMatchesFinalized(letter, null), false)
assert.equal(letterFromInputs('not json'), null)

// A save is accepted only from a client that started from the stored letter.
assertLetterBase(undefined, null)
assertLetterBase(letter, { ...letter })
assertLetterBase(letter, JSON.parse(JSON.stringify(letter)))
assert.throws(() => assertLetterBase(letter, null), CoverLetterConflict, 'a tab that saw no letter cannot replace one')
assert.throws(() => assertLetterBase(undefined, letter), CoverLetterConflict)
assert.throws(() => assertLetterBase({ ...letter, closing: 'Best regards,' }, letter), CoverLetterConflict, 'a stale tab cannot overwrite a newer letter')
assert.throws(() => assertLetterBase(letter, { content: 1 }), CoverLetterConflict, 'a malformed base is never a match')
assert.equal(letterKey({ ...letter }), letterKey(Object.fromEntries(Object.entries(letter).reverse()) as CoverLetter), 'field order does not matter')

// The AI must return every field, so a reply can never silently drop one.
assert.deepEqual([...letterAgentSchema.properties.letter.required].sort(), [...COVER_LETTER_FIELDS].sort())

// Routes reject bad input before touching files or an engine.
const params = { params: Promise.resolve({ key: 'invalid-cover-letter-test' }) }
const bad = () => new Request('http://localhost/api/cover-letter', { method: 'POST', body: JSON.stringify({ letter: { content: 1 } }) })
for (const handler of [POST, PUT, PREVIEW, FINALIZE]) {
  assert.equal((await handler(bad(), params)).status, 400)
}
const empty = await POST(new Request('http://localhost/api/cover-letter', { method: 'POST', body: JSON.stringify({ letter, message: '  ' }) }), params)
assert.equal(empty.status, 400, 'an empty request never reaches the engine')

// A real render through templates/cover-letter.typ.
const render = await renderCoverLetter(letter, sender)
if (render.failures.some((failure) => failure.where === 'typst' && /not available/.test(failure.why))) {
  console.log('Cover letter render skipped: typst-py is not installed')
} else {
  assert.equal(render.ok, true, JSON.stringify(render.failures))
  assert.equal(render.pages, 1)
  assert.ok(render.pdfPath)
  await cleanupRender(render.pdfPath!)

  const long = await renderCoverLetter({ ...letter, content: Array(14).fill('This paragraph is long on purpose. '.repeat(12)).join('\n\n') }, sender)
  assert.equal(long.ok, false)
  assert.ok((long.pages ?? 0) > 1)
  assert.ok(long.failures.some((failure) => failure.kind === 'page-count'))
  if (long.pdfPath) await cleanupRender(long.pdfPath)
}

console.log('Cover letters: defaults, template inputs, sender from resume, shared rules, legacy drafts, schema, route rejection, and one-page render pass')
