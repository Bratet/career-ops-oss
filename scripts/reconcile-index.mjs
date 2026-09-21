#!/usr/bin/env node
/**
 * Seed workspace/state/app-index.json by matching tracker rows to
 * workspace/applications/ folders.
 *
 * Same logic the UI's "Auto-link folders" button runs, available offline so the
 * index can be rebuilt without starting the server.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const trackerPath = join(root, 'workspace', 'state', 'applications.md')
const indexPath = join(root, 'workspace', 'state', 'app-index.json')

const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const rows = readFileSync(trackerPath, 'utf-8')
  .split('\n')
  .filter((l) => /^\|\s*\d+\s*\|/.test(l))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
  .map((c) => ({ id: Number(c[0]), date: c[1], company: c[2] }))

const folders = readdirSync(join(root, 'workspace', 'applications'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => {
    const m = e.name.match(/^(.*)-(\d{4}-\d{2}-\d{2})$/)
    return { folder: e.name, slug: m?.[1] ?? e.name, date: m?.[2] ?? '' }
  })

const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf-8')) : {}
const claimed = new Set(Object.values(index))
let linked = 0

for (const row of rows) {
  if (index[row.id]) continue
  const want = slugify(row.company)
  const hit = folders.find((f) => !claimed.has(f.folder) && f.slug === want && f.date === row.date)
  if (hit) {
    index[row.id] = hit.folder
    claimed.add(hit.folder)
    linked++
  }
}

const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => Number(b) - Number(a)))
writeFileSync(indexPath, JSON.stringify(sorted, null, 2) + '\n')

console.log(`linked ${linked} new, ${Object.keys(sorted).length}/${rows.length} rows now have a folder`)
console.log(`${folders.length - claimed.size} folder(s) still unclaimed`)
