import assert from 'node:assert/strict'
import { outreachDraftSchema } from '../src/lib/outreach'
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
console.log('Outreach: message types, multiline drafts, empty drafts, limits, and route rejection pass')
