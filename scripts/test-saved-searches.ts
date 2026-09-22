import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSavedSearchStore } from '../src/lib/savedSearches'
import { savedSearchSchema } from '../src/lib/savedSearchSchema'
import { PATHS } from '../src/lib/paths'

const directory = await mkdtemp(join(PATHS.state, '.test-searches-'))
try {
  const file = join(directory, 'searches.json')
  const store = createSavedSearchStore(file)
  const empty = await store.read()
  assert.deepEqual(empty.searches, [])
  const search = {
    id: randomUUID(), title: 'Remote AI', track: 'Remote', notes: 'Check eligibility',
    url: 'https://www.linkedin.com/jobs/search/?keywords=AI%20OR%20ML&f_WT=2&f_TPR=r604800',
  }
  const saved = await store.save([search], empty.revision)
  assert.equal(saved.searches[0].url, search.url, 'Preserve filters verbatim')
  assert.deepEqual((await store.read()).searches, [search])
  assert.ok((await readFile(file, 'utf8')).endsWith('\n'))
  for (const url of ['javascript:alert(1)', 'file:///secret', 'https://user:pass@example.com', 'not a url']) {
    assert.equal(savedSearchSchema.safeParse({ ...search, url }).success, false)
  }
  assert.equal(savedSearchSchema.safeParse({ ...search, title: ' ' }).success, false)
  assert.throws(() => store.save([search, search], saved.revision))
  await assert.rejects(store.save([], empty.revision), /CONFLICT/)
  const concurrent = await Promise.allSettled([
    store.save([{ ...search, title: 'Updated' }], saved.revision),
    store.save([], saved.revision),
  ])
  assert.equal(concurrent[0].status, 'fulfilled')
  assert.equal(concurrent[1].status, 'rejected')
  const updated = await store.read()
  assert.equal(updated.searches[0].title, 'Updated')
  const deleted = await store.save([], updated.revision)
  assert.deepEqual(deleted.searches, [])
  await writeFile(file, 'broken json')
  await assert.rejects(store.read())
  await assert.rejects(store.save([search], deleted.revision))
  assert.equal(await readFile(file, 'utf8'), 'broken json', 'Never overwrite corrupt data')
  console.log('saved searches: persistence, filters, validation, conflicts, deletion and corrupt-data protection passed')
} finally {
  await rm(directory, { recursive: true, force: true })
}
