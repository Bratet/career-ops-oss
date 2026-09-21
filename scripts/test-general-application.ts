import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const original = process.cwd()
const root = await mkdtemp(join(tmpdir(), 'career-ops-general-test-'))
try {
  process.chdir(root)
  const { APP_FILES, PATHS } = await import('../src/lib/paths')
  await mkdir(PATHS.applications, { recursive: true })
  await mkdir(PATHS.state, { recursive: true })
  await mkdir(dirname(PATHS.ownCv.en), { recursive: true })
  await writeFile(PATHS.tracker, '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n')
  const { POST } = await import('../src/app/api/applications/general/route')
  const { readWorkspace, updateWorkspace } = await import('../src/lib/workspaces')
  const { PUT } = await import('../src/app/api/masters/[lang]/route')
  for (const language of ['en', 'fr'] as const) {
    const yaml = `cv:\n  name: General ${language}\ndesign:\n  theme: classic\n`
    await writeFile(PATHS.ownCv[language], yaml)
    const body = { company: `Company ${language}`, language, contact: 'HR', notes: 'Reached out directly' }
    const request = () => new Request('http://localhost/api/applications/general', { method: 'POST', body: JSON.stringify(body) })
    const response = await POST(request())
    assert.equal(response.status, 200)
    const { key, warning } = await response.json()
    assert.equal(warning, null)
    const workspace = await readWorkspace(key)
    assert.equal(workspace.draftYaml, yaml, 'general source and design remain byte-identical')
    assert.equal(workspace.fit.status, 'idle')
    assert.equal(workspace.generalDetails?.contact, 'HR')
    assert.equal(await readFile(join(PATHS.applications, key, APP_FILES.yaml), 'utf-8'), yaml)
    await updateWorkspace(key, workspace.revision, (record) => ({ ...record, draftYaml: yaml + '# company edit\n' }))
    assert.equal(await readFile(PATHS.ownCv[language], 'utf-8'), yaml)
    assert.equal((await POST(request())).status, 409)
    const edited = yaml + '# profile edit\n'
    assert.equal((await PUT(new Request(`http://localhost/api/masters/${language}?family=ownCv`, { method: 'PUT', body: JSON.stringify({ yaml: edited }) }), { params: Promise.resolve({ lang: language }) })).status, 200)
    assert.equal(await readFile(PATHS.ownCv[language], 'utf-8'), edited)
    assert.equal((await readWorkspace(key)).draftYaml, yaml + '# company edit\n')
  }
  for (const body of [{ company: '', language: 'en' }, { company: 'Bad|row', language: 'en' }, { company: 'Acme', language: '../en' }]) {
    assert.equal((await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }))).status, 400)
  }
  console.log('General applications: both languages, profile saves, isolated drafts, preserved design, no fit analysis, duplicates and invalid inputs pass')
} finally {
  process.chdir(original)
  await rm(root, { recursive: true, force: true })
}
