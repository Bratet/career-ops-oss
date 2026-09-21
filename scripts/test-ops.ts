/**
 * Applier guarantees, checked against the real master.
 *
 * Every assertion here is a property the tailoring pass relies on: the design
 * block is unreachable, indices cannot go stale, and nothing ungrounded lands.
 */
import { readFileSync } from 'fs'
import { parse, stringify } from 'yaml'
import { applyOps, type Op } from '../src/lib/tailoring/ops'
import { PATHS } from '../src/lib/paths'

const profile = parse(readFileSync(PATHS.masters.en, 'utf-8'))
const tailoredDesign = parse(readFileSync(PATHS.tailoredDesign, 'utf-8'))
const master = stringify(
  { cv: profile.cv, design: tailoredDesign.design },
  { lineWidth: 0, defaultStringType: 'QUOTE_SINGLE', defaultKeyType: 'PLAIN' },
)

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function designBlock(text: string): string {
  return text.slice(text.indexOf('\ndesign:'))
}

console.log('applier')

// --- happy path -------------------------------------------------------------
const bullet = parse(master).cv.sections.Experience[0].highlights[1] as string
const firstHighlights = parse(master).cv.sections.Experience[0].highlights as string[]
const firstDrop = firstHighlights.length - 1
const secondDrop = firstHighlights.length - 2
const skillCount = parse(master).cv.sections.Skills.length as number
const skillOrder = [2, ...Array.from({ length: skillCount }, (_, index) => index).filter((index) => index !== 2)]
const ops: Op[] = [
  { op: 'drop', path: 'cv.sections.Experience[4]', why: 'no must-evidence' },
  { op: 'drop', path: `cv.sections.Experience[0].highlights[${firstDrop}]`, why: 'weakest bullet' },
  { op: 'drop', path: `cv.sections.Experience[0].highlights[${secondDrop}]`, why: 'weakest bullet' },
  { op: 'reword', path: 'cv.sections.Experience[0].highlights[1]', from: bullet, to: bullet.replace('Automated', 'Delivered'), why: 'JD verb' },
  { op: 'reorder', path: 'cv.sections.Skills', order: skillOrder, why: 'JD leads on machine learning' },
  { op: 'set', path: 'cv.headline', value: 'Data Scientist with Machine Learning Engineering experience', why: 'bridge the title' },
  { op: 'drop', path: 'cv.sections.Distinctions', why: 'no weight for this JD' },
]
const r = applyOps(master, ops)
check('all ops applied', r.applied.length === ops.length, JSON.stringify(r.rejected))
check('design block byte-identical', designBlock(r.yaml) === designBlock(master))

const out = parse(r.yaml)
const mIn = parse(master)
check('two drops in one array both landed', out.cv.sections.Experience[0].highlights.length === mIn.cv.sections.Experience[0].highlights.length - 2)
check('the right bullets survived', !out.cv.sections.Experience[0].highlights.includes(firstHighlights[firstDrop]) && !out.cv.sections.Experience[0].highlights.includes(firstHighlights[secondDrop]))
check('entry drop landed', out.cv.sections.Experience.length === mIn.cv.sections.Experience.length - 1)
check('reword landed on the right line', out.cv.sections.Experience[0].highlights[1].startsWith('Delivered'))
check('reorder landed', out.cv.sections.Skills[0].label === mIn.cv.sections.Skills[2].label)
check('created key landed', out.cv.headline === 'Data Scientist with Machine Learning Engineering experience')
check('section drop landed', out.cv.sections.Distinctions === undefined)
check('untouched entry is untouched', out.cv.sections.Projects[0].highlights[0] === mIn.cv.sections.Projects[0].highlights[0])

// --- guards -----------------------------------------------------------------
const guards: [string, Op][] = [
  ['design path rejected', { op: 'set', path: 'design.page.size', value: 'us-letter', why: 'x' }],
  ['design theme rejected', { op: 'set', path: 'design.theme', value: 'classic', why: 'x' }],
  ['stale reword rejected', { op: 'reword', path: 'cv.sections.Experience[0].highlights[0]', from: 'text that is not there', to: 'anything', why: 'x' }],
  ['invented figure rejected', { op: 'reword', path: 'cv.sections.Experience[0].highlights[0]', from: bullet0(), to: bullet0() + ' Reached **99.9% uptime**.', why: 'x' }],
  ['missing path rejected', { op: 'drop', path: 'cv.sections.Nonexistent[3]', why: 'x' }],
  ['bad permutation rejected', { op: 'reorder', path: 'cv.sections.Skills', order: [0, 0, 1], why: 'x' }],
  ['position reword rejected', { op: 'reword', path: 'cv.sections.Experience[0].position', from: 'Data Scientist', to: 'AI Engineer', why: 'x' }],
  ['non-headline set rejected', { op: 'set', path: 'cv.sections.Skills[1].details', value: 'TensorRT', why: 'x' }],
  ['invented headline technology rejected', { op: 'set', path: 'cv.headline', value: 'TensorRT Engineer', why: 'x' }],
]
function bullet0() { return parse(master).cv.sections.Experience[0].highlights[0] as string }

for (const [name, op] of guards) {
  const res = applyOps(master, [op])
  check(name, res.applied.length === 0 && res.rejected.length === 1, res.rejected[0]?.why ?? 'was applied')
}

// --- comments and quoting survive ------------------------------------------
const withComments = 'cv:\n  # a comment that must survive\n  name: Jordan Candidate\n  sections:\n    Summary:\n    - plain text\n'
const c = applyOps(withComments, [{ op: 'reword', path: 'cv.sections.Summary[0]', from: 'plain text', to: 'text: with a colon', why: 'x' }])
check('comment preserved', c.yaml.includes('# a comment that must survive'))
check('re-quoted safely', (parse(c.yaml).cv.sections.Summary[0] as string) === 'text: with a colon')

// --- replay safety across batches -------------------------------------------
// Within one batch every op resolves against the same pre-edit document, so a
// subset always replays cleanly. The hazard is the retry pass: its ops were
// resolved against the first pass's OUTPUT, so replaying them onto the snapshot
// with a first-pass change unchecked would otherwise hit a shifted index.
const batch1 = applyOps(master, [{ op: 'drop', path: 'cv.sections.Experience[0].highlights[0]', why: 'a' }])
const batch2 = applyOps(batch1.yaml, [{ op: 'drop', path: 'cv.sections.Experience[0].highlights[3]', why: 'b' }])
check('fingerprints recorded on the way out', [...batch1.applied, ...batch2.applied].every((o) => typeof o.expect === 'string' && o.expect.length > 0))

const stale = applyOps(master, batch2.applied)
check('stale cross-batch op rejected', stale.applied.length === 0 && stale.rejected.length === 1, stale.rejected[0]?.why ?? 'was applied')

const honest = applyOps(batch1.yaml, batch2.applied)
check('the same op replayed in its own context applies', honest.applied.length === 1, JSON.stringify(honest.rejected))
check('replay reproduces the original result', honest.yaml === batch2.yaml)

// And a subset within one batch replays cleanly, which is the common undo case.
const three: Op[] = [
  { op: 'drop', path: 'cv.sections.Experience[0].highlights[1]', why: 'a' },
  { op: 'drop', path: `cv.sections.Experience[0].highlights[${firstDrop}]`, why: 'b' },
  { op: 'drop', path: `cv.sections.Projects[${mIn.cv.sections.Projects.length - 1}]`, why: 'c' },
]
const all3 = applyOps(master, three)
const subset = applyOps(master, [all3.applied[0], all3.applied[2]])
check('unchecking one row replays the rest', subset.applied.length === 2, JSON.stringify(subset.rejected))
check('the unchecked bullet came back', (parse(subset.yaml).cv.sections.Experience[0].highlights as string[]).length === (parse(master).cv.sections.Experience[0].highlights as string[]).length - 1)

console.log(failures ? `\n${failures} failure(s)` : '\nall applier checks pass')
process.exit(failures ? 1 : 0)
