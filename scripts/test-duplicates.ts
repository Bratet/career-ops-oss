import assert from 'node:assert/strict'
import { findDuplicates, isBlocking, normalizeCompany, samePosting, sameRole, type ExistingApplication } from '../src/lib/duplicates'

const posting = `Do you want to work out how you actually measure whether an AI system is doing a good job, and then make it better?
We're looking for a sharp, analytical data scientist to own the evaluation and quality loop of our AutoQA product.
Requirements
A solid understanding of how LLMs work and hands-on experience prompting them for accuracy.
Good applied statistics: experiment design, classifier evaluation, precision/recall trade-offs, and working with heavily imbalanced data.
Strong Python skills and fluency with the standard data toolkit (Pandas, NumPy, Jupyter). SQL is a plus.`

// A reposted job case: the same posting pasted again with a translated job-board
// header, different spacing, and the "Requirements" heading lost.
const repasted = `Volledige vacaturetekst\n\n${posting.replace('Requirements\n', '').replace(/\n/g, '\n\n')}`
const other = `We are hiring a backend engineer to build payment APIs in Go and Postgres. You will own services
for card authorisation, settlement, and reconciliation, and join an on-call rotation with the platform team.`

assert.ok(samePosting(posting, repasted), 'a re-pasted posting is the same posting')
assert.ok(!samePosting(posting, other), 'different postings do not match')

assert.equal(normalizeCompany('Acme B.V.'), normalizeCompany('acme'))
assert.equal(normalizeCompany('Société Générale SA'), normalizeCompany('societe generale'))
assert.ok(sameRole('Data Scientist, AutoQA Evaluation (Amsterdam, hybrid)', 'Data Scientist - AutoQA evaluation (descriptive title)'))
assert.ok(!sameRole('Data Scientist, AutoQA Evaluation', 'Senior Backend Engineer, Payments'))

const existing: ExistingApplication[] = [
  { key: 'acme-2026-09-09', company: 'Acme', role: 'Data Scientist - AutoQA evaluation', date: '2026-09-09', status: 'Applied', jd: posting },
  { key: 'acme-2026-05-01', company: 'Acme', role: 'Frontend Engineer', date: '2026-05-01', status: 'Rejected', jd: other },
  { key: 'acme-2026-09-01', company: 'Acme', role: 'Data Scientist', date: '2026-09-01', status: 'Evaluated', jd: other },
]

// Same posting is caught even when the analysis names the company or role differently.
const reposted = findDuplicates({ company: 'Acme Inc', role: 'AI Quality Analyst', jd: repasted }, existing)
assert.equal(reposted[0].key, 'acme-2026-09-09')
assert.equal(reposted[0].reason, 'same-posting')
assert.equal(reposted[0].applied, true)
assert.ok(isBlocking(reposted[0]))
assert.equal(reposted[1].reason, 'same-company')
assert.ok(!isBlocking(reposted[1]))

// Without posting text, company + role still blocks.
const noText = findDuplicates({ company: 'acme', role: 'Data Scientist, AutoQA Evaluation' }, existing)
assert.equal(noText[0].reason, 'same-role')
assert.ok(noText.every((match) => match.key.startsWith('acme')))

// A different job at an unrelated company is not flagged.
assert.deepEqual(findDuplicates({ company: 'Globex', role: 'Data Scientist', jd: posting.slice(0, 40) }, existing), [])
// An empty company never matches every row with an empty company.
assert.deepEqual(findDuplicates({ company: '', role: '' }, [{ ...existing[2], company: '' }]), [])

console.log('Duplicates: same posting, same company and role, company-only, and non-matches pass')
