import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const originalCwd = process.cwd()
const root = await mkdtemp(join(tmpdir(), 'career-ops-delete-'))

try {
  process.chdir(root)
  const { PATHS } = await import('../src/lib/paths')
  await mkdir(PATHS.state, { recursive: true })
  await mkdir(join(PATHS.applications, 'acme-2026-09-02'), { recursive: true })
  await mkdir(join(PATHS.applications, 'orphan-2026-09-01'), { recursive: true })
  await writeFile(
    PATHS.tracker,
    [
      '# Applications',
      '',
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
      '|---|------|---------|------|-------|--------|-----|--------|-------|',
      '| 3 | 2026-09-02 | Row only | ML Engineer | N/A | Applied | ❌ | — | missing folder |',
      '| 2 | 2026-09-02 | Acme | AI Engineer | N/A | Applied | ❌ | — | test row |',
      '| 1 | 2026-09-01 | Kept | Data Scientist | 4/5 | Applied | ✅ | — | untouched |',
      '',
    ].join('\n'),
  )
  await writeFile(
    PATHS.appIndex,
    JSON.stringify({ 3: 'missing-2026-09-02', 2: 'acme-2026-09-02' }, null, 2) + '\n',
  )
  await writeFile(join(PATHS.applications, 'acme-2026-09-02', 'jd.md'), 'job description')
  await writeFile(join(PATHS.applications, 'orphan-2026-09-01', 'cv.yaml'), 'cv: {}')

  const { ApplicationNotFoundError, deleteApplication } = await import('../src/lib/deleteApplication')
  const result = await deleteApplication('acme-2026-09-02')

  assert.equal(result.rowId, 2)
  assert.equal(result.folder, 'acme-2026-09-02')
  assert.ok(result.trashedAs?.startsWith('acme-2026-09-02--deleted-'))
  assert.equal(
    await readFile(join(PATHS.applicationTrash, result.trashedAs!, 'jd.md'), 'utf-8'),
    'job description',
  )

  const tracker = await readFile(PATHS.tracker, 'utf-8')
  assert.ok(!tracker.includes('| 2 |'))
  assert.ok(tracker.includes('| 3 | 2026-09-02 | Row only |'))
  assert.ok(tracker.includes('| 1 | 2026-09-01 | Kept |'))
  assert.deepEqual(
    JSON.parse(await readFile(PATHS.appIndex, 'utf-8')),
    { 3: 'missing-2026-09-02' },
  )

  const rowOnly = await deleteApplication('row-3')
  assert.equal(rowOnly.rowId, 3)
  assert.equal(rowOnly.folder, null)
  assert.equal(rowOnly.trashedAs, null)

  const folderOnly = await deleteApplication('orphan-2026-09-01')
  assert.equal(folderOnly.rowId, null)
  assert.equal(folderOnly.folder, 'orphan-2026-09-01')
  assert.equal(
    await readFile(join(PATHS.applicationTrash, folderOnly.trashedAs!, 'cv.yaml'), 'utf-8'),
    'cv: {}',
  )

  assert.deepEqual(JSON.parse(await readFile(PATHS.appIndex, 'utf-8')), {})

  await assert.rejects(() => deleteApplication('acme-2026-09-02'), ApplicationNotFoundError)
  console.log('application delete: linked, row-only, and folder-only records removed; documents retained')
} finally {
  process.chdir(originalCwd)
  await rm(root, { recursive: true, force: true })
}
