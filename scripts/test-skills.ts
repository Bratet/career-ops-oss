import { readFile } from 'fs/promises'
import { join } from 'path'
import { PATHS } from '../src/lib/paths'
import { parseSkill, withSkillMetadata } from '../src/lib/skills/parser'
import { getSkill, listSkills } from '../src/lib/skills/registry'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('skills')

const listed = await listSkills()
const listedIds = new Set(listed.map((skill) => skill.id))
check('built-in skills discovered', listedIds.has('analyze-job') && listedIds.has('tailor-cv') && listedIds.has('profile-fit'))

for (const summary of listed) {
  const skill = await getSkill(summary.id)
  check(`${summary.id} folder and frontmatter agree`, skill.metadata.id === summary.id)
  check(`${summary.id} has model instructions`, skill.instructions.length > 100)
}

const original = await readFile(join(PATHS.skills, 'tailor-cv', 'SKILL.md'), 'utf-8')
const bumped = parseSkill(withSkillMetadata(original, { version: 9, name: 'Changed safely' }))
check('metadata rewrite preserves instructions', bumped.instructions === parseSkill(original).instructions)
check('metadata rewrite applies typed fields', bumped.metadata.version === 9 && bumped.metadata.name === 'Changed safely')

let missingPlaceholderRejected = false
try {
  parseSkill(original.replace('{{CV_YAML}}', ''))
} catch {
  missingPlaceholderRejected = true
}
check('missing runner placeholder rejected', missingPlaceholderRejected)

let extraCapabilityRejected = false
try {
  parseSkill(original.replace('  - propose-cv-operations', '  - propose-cv-operations\n  - write-any-file'))
} catch {
  extraCapabilityRejected = true
}
check('self-granted capability rejected', extraCapabilityRejected)

console.log(failures ? `\n${failures} failure(s)` : '\nall skill checks pass')
process.exit(failures ? 1 : 0)
