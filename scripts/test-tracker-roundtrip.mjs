#!/usr/bin/env node
/**
 * The tracker is git-tracked and irreplaceable. Before any write path is trusted,
 * parse -> serialize must reproduce the file byte for byte.
 *
 * This deliberately re-implements the parser in plain JS rather than importing
 * the TS module, so it runs with no build step and no dependencies.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(root, 'workspace', 'state', 'applications.md')
const text = readFileSync(path, 'utf-8')

// Git can check this tracked Markdown file out with CRLF on Windows.
const lineEnding = text.includes('\r\n') ? '\r\n' : '\n'
const trailingNewline = text.endsWith(lineEnding)
const lines = text.split(lineEnding)
if (trailingNewline) lines.pop()

const headerIdx = lines.findIndex((l) => /^\|\s*#\s*\|/.test(l))
if (headerIdx === -1) fail('no header row found')

const preamble = lines.slice(0, headerIdx)
const header = lines[headerIdx]
const separator = lines[headerIdx + 1]
const rows = []

for (const line of lines.slice(headerIdx + 2)) {
  if (!line.trim()) continue
  const c = line.split('|').slice(1, -1).map((s) => s.trim())
  if (c.length !== 9) fail(`expected 9 columns, got ${c.length}: ${line.slice(0, 80)}`)
  rows.push(c)
}

const rebuilt =
  [...preamble, header, separator, ...rows.map((c) => `| ${c.join(' | ')} |`)].join(lineEnding) +
  (trailingNewline ? lineEnding : '')

if (rebuilt !== text) {
  const a = text.split(lineEnding)
  const b = rebuilt.split(lineEnding)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.error(`❌ round-trip differs at line ${i + 1}`)
      console.error(`   original: ${JSON.stringify((a[i] ?? '').slice(0, 120))}`)
      console.error(`   rebuilt : ${JSON.stringify((b[i] ?? '').slice(0, 120))}`)
      process.exit(1)
    }
  }
  fail('round-trip differs in length only')
}

// Invariants the app relies on.
const ids = rows.map((c) => Number(c[0]))
if (ids.some(Number.isNaN)) fail('a row has a non-numeric #')
if (new Set(ids).size !== ids.length) fail('duplicate # values')

// The file is newest-first but not strictly sorted: it carries two historical
// inversions (41/40 and 36/34/35) and a gap at #28. The invariant the app
// actually depends on is narrower, and true: the max # is the first row, so
// nextId() and top-insert both stay correct.
const max = ids.length ? Math.max(...ids) : 0
if (ids.length && ids[0] !== max) fail(`highest # is ${max} but the first row is ${ids[0]}`)

const inversions = ids.filter((v, i) => i > 0 && v > ids[i - 1]).length
console.log(
  ids.length
    ? `✅ tracker round-trip byte-identical: ${rows.length} rows, # ${Math.min(...ids)}..${max}` +
        (inversions ? `, ${inversions} historical ordering inversion(s) preserved` : '')
    : '✅ tracker round-trip byte-identical: 0 rows',
)

function fail(msg) {
  console.error(`❌ ${msg}`)
  process.exit(1)
}
