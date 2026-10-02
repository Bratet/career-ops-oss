import assert from 'node:assert/strict'
import { postingContact } from '../src/lib/postingContact'

// A posting: a named recruiter address and a short letter requested.
const contact = postingContact('Apply today or send your CV and a short cover letter to alex.taylor@example.com.')
assert.deepEqual(contact, { email: 'alex.taylor@example.com', name: 'Alex Taylor', firstName: 'Alex', coverLetter: 'short' })

// A role mailbox gives an address but never a guessed name.
assert.deepEqual(postingContact('Send applications to careers@acme.io'), { email: 'careers@acme.io', name: null, firstName: null, coverLetter: null })
assert.equal(postingContact('Contact recrutement@acme.fr').name, null)

// Only a clean first.last address becomes a name.
assert.equal(postingContact('write to rmartin@acme.io').name, null)
assert.equal(postingContact('write to ryan.j.martin@acme.io').name, null)
assert.equal(postingContact('write to anna-lena@acme.io').name, 'Anna Lena')
assert.equal(postingContact('write to r2.d2@acme.io').name, null)

// Letter requests, in English and French.
assert.equal(postingContact('Please include a cover letter.').coverLetter, 'requested')
assert.equal(postingContact('A brief motivation letter is welcome.').coverLetter, 'short')
assert.equal(postingContact('Envoyez votre CV et une lettre de motivation.').coverLetter, 'requested')
assert.equal(postingContact('No letters needed.').coverLetter, null)

// Nothing to find.
assert.deepEqual(postingContact(null), { email: null, name: null, firstName: null, coverLetter: null })

console.log('Posting contact: recruiter address and name, role mailboxes, letter requests in English and French pass')
