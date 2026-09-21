import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const originalCwd = process.cwd()
const root = await mkdtemp(join(tmpdir(), 'career-ops-workspace-'))
try {
  process.chdir(root)
  const { APP_FILES, PATHS } = await import('../src/lib/paths')
  const key = 'acme-2026-09-03'
  await Promise.all([
    mkdir(PATHS.state, { recursive: true }),
    mkdir(join(PATHS.applications, key), { recursive: true }),
    mkdir(dirname(PATHS.masters.en), { recursive: true }),
  ])
  await writeFile(PATHS.tracker, [
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-09-03 | Acme | Engineer | N/A | Preparing | ❌ | — | untouched |',
    '',
  ].join('\n'))
  await writeFile(PATHS.appIndex, `${JSON.stringify({ 1: key })}\n`)
  const analysis = {
    company: 'Acme', role: 'Engineer', archetype: 'software', language: 'en', paperSize: 'a4',
    seniority: null, location: null, workMode: 'remote', sponsorship: null, summary: 'Build things.', keywords: ['TypeScript'],
    requirements: [
      { text: 'TypeScript', weight: 'must', rank: 1, priorityReason: 'Core' },
      { text: 'Kubernetes', weight: 'must', rank: 2, priorityReason: 'Core' },
      { text: 'French', weight: 'nice', rank: 1, priorityReason: 'Helpful' },
    ],
  }
  await Promise.all([
    writeFile(PATHS.masters.en, 'cv:\n  name: Test\n'),
    writeFile(PATHS.masters.fr, 'cv:\n  name: Test\n'),
    writeFile(join(PATHS.applications, key, APP_FILES.yaml), 'cv:\n  name: Accepted\n'),
    writeFile(join(PATHS.applications, key, 'jd.md'), 'Job source'),
    writeFile(join(PATHS.applications, key, 'jd-analysis.json'), `${JSON.stringify(analysis)}\n`),
  ])

  const workspaces = await import('../src/lib/workspaces')
  const fit = await import('../src/lib/profileFit')
  const created = await workspaces.createWorkspace(key)
  assert.equal(created.revision, 1)
  assert.equal(created.fit.status, 'queued')
  assert.match(await readFile(join(PATHS.workspaces, `${key}.json`), 'utf-8'), /"version": 1/)

  const saved = await workspaces.updateWorkspace(key, 1, (current) => ({ ...current, draftYaml: 'invalid but safely saved: [' }))
  assert.equal(saved.revision, 2)
  assert.equal((await workspaces.readWorkspace(key)).draftYaml, 'invalid but safely saved: [')
  await assert.rejects(
    () => workspaces.updateWorkspace(key, 1, (current) => current),
    workspaces.WorkspaceRevisionConflict,
  )
  await assert.rejects(() => workspaces.readWorkspace('../escape'), /invalid application key/)

  const failed = await workspaces.updateWorkspace(key, saved.revision, (current) => ({
    ...current,
    fit: { ...current.fit, status: 'error', error: 'workspace changed: expected revision 2, found 3' },
  }))
  const recovered = await workspaces.readWorkspace(key)
  assert.equal(failed.fit.status, 'error')
  assert.equal(recovered.fit.status, 'queued')

  const report = fit.parseProfileFit({
    requirements: [
      { requirement: 'TypeScript', classification: 'direct', evidence: ['Built TypeScript systems'] },
      { requirement: 'Kubernetes', classification: 'gap', evidence: [] },
      { requirement: 'French', classification: 'supporting', evidence: ['Working proficiency'] },
      { requirement: 'Invented row', classification: 'direct', evidence: ['ignored'] },
    ],
    keyGaps: ['Kubernetes'], recommendedEmphasis: ['TypeScript delivery'],
  }, analysis as never)
  assert.equal(report.requirements.length, analysis.requirements.length)
  assert.equal(report.verdict, 'Partial')
  assert.deepEqual(report.coverage.must, { evidenced: 1, total: 2 })
  assert.equal(fit.fitVerdict([{ weight: 'nice', classification: 'gap' }]), 'Weak')

  const { saveAnalysisChatReport } = await import('../src/lib/analysisChat')
  const base = await workspaces.updateWorkspace(key, recovered.revision, (current) => ({ ...current, fit: { ...current.fit, status: 'ready', report } }))
  const corrected = structuredClone(report)
  corrected.requirements[1] = { ...corrected.requirements[1], classification: 'direct', evidence: ['User confirmed Kubernetes experience in this application discussion'] }
  corrected.keyGaps = []
  const trackerBefore = await readFile(PATHS.tracker, 'utf-8')
  await workspaces.updateWorkspace(key, base.revision, (current) => ({ ...current, draftYaml: 'cv:\n  name: Concurrent edit\n' }))
  assert.equal(await saveAnalysisChatReport(key, base, corrected), true)
  const updated = await workspaces.readWorkspace(key)
  assert.equal(updated.fit.report?.coverage.must.evidenced, 2)
  assert.equal(updated.fit.report?.verdict, 'Strong')
  assert.deepEqual(updated.fit.report?.keyGaps, [])
  assert.equal(updated.draftYaml, 'cv:\n  name: Concurrent edit\n')
  assert.equal(await readFile(PATHS.tracker, 'utf-8'), trackerBefore)
  assert.equal(await saveAnalysisChatReport(key, updated, updated.fit.report), false)
  await assert.rejects(() => saveAnalysisChatReport(key, base, corrected), /changed during/)
  await assert.rejects(() => saveAnalysisChatReport(key, updated, { ...corrected, requirements: corrected.requirements.slice(1) }), /changed the job requirements/)
  await assert.rejects(() => saveAnalysisChatReport(key, updated, { ...corrected, requirements: corrected.requirements.map((row) => ({ ...row, classification: 'met' })) }))
  assert.equal((await workspaces.readWorkspace(key)).revision, updated.revision)
  console.log('Analysis chat: persisted corrections, recalculated coverage, concurrent drafts, stale reports, invalid input and untouched tracker pass')

  console.log('workspaces: atomic persistence, conflicts, unsafe keys, and deterministic fit pass')
} finally {
  process.chdir(originalCwd)
  await rm(root, { recursive: true, force: true })
}
