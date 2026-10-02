import assert from 'node:assert/strict'
import { friendlyError } from '../src/lib/friendlyError'

const title = (message: string) => friendlyError(message).title

// The failure that started this: a raw spawn error becomes a sentence, with the original kept as detail.
const long = friendlyError('spawn ENAMETOOLONG')
assert.equal(long.title, 'The request was too large to start the AI engine.')
assert.equal(long.detail, 'spawn ENAMETOOLONG')
assert.ok(long.hint)

assert.match(title('spawn claude ENOENT'), /could not be started/)
assert.match(title('`claude` not found on PATH. Install Claude Code and run `claude login`.'), /could not be started/, 'a missing binary is not a sign-in problem')
assert.match(title('Invalid API key · Please run /login'), /not signed in/)
assert.match(title('HTTP 429 rate limit'), /busy/)
assert.match(title('claude exited 1'), /stopped with an error/)
assert.match(title('the cover letter could not be rendered'), /PDF could not be rendered/)
assert.match(title('Failed to fetch'), /app server could not be reached/)

// Conflicts win over incidental numbers in the message.
assert.match(title('workspace changed: expected revision 401, found revision 429'), /changed somewhere else/)

// Messages the app already words for people pass through unchanged, with no duplicate detail.
const plain = friendlyError('Finalize a resume before writing a cover letter')
assert.deepEqual(plain, { title: 'Finalize a resume before writing a cover letter', hint: '', detail: null })

console.log('Friendly errors: engine, sign-in, limits, render, network and conflict messages, and pass-through pass')
