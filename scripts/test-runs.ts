import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getSkill } from '../src/lib/skills/registry'
import { attachSkillRunToApplication, getSkillRun, listSkillRuns, startSkillRun } from '../src/lib/skills/runs'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('runs')
const root = await mkdtemp(join(tmpdir(), 'career-ops-runs-'))

try {
  const skill = await getSkill('tailor-cv')
  const recorder = await startSkillRun({
    feature: 'test-tailor',
    skill,
    engine: 'codex',
    applicationKey: 'example-2026-09-01',
    inputSummary: { postingCharacters: 1234 },
    root,
  })
  recorder.event('progress', 'selecting evidence')
  recorder.event('result', 'one page')
  await recorder.complete({ pages: 1, fill: 94 })

  const runs = await listSkillRuns({ root })
  check('completed run listed', runs.length === 1 && runs[0].status === 'complete')
  check('skill version captured', runs[0].skillId === 'tailor-cv' && runs[0].skillVersion === skill.metadata.version)

  const detail = await getSkillRun(recorder.id, root)
  check('events preserve order', detail.events.map((event) => event.type).join('|') === 'progress|result')
  check('result summary persisted', (detail.result as { pages?: number }).pages === 1)
  check('application filter matches', (await listSkillRuns({ root, applicationKey: 'example-2026-09-01' })).length === 1)
  check('application filter excludes', (await listSkillRuns({ root, applicationKey: 'another' })).length === 0)
  await attachSkillRunToApplication(recorder.id, 'renamed-application', root)
  check('pre-creation run can attach to application', (await getSkillRun(recorder.id, root)).applicationKey === 'renamed-application')
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} failure(s)` : '\nall run checks pass')
process.exit(failures ? 1 : 0)
