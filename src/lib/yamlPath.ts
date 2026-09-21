/**
 * Locate a dotted YAML path in raw text.
 *
 * The validator reports failures as cv.sections.Experience[0].highlights[2].
 * Clicking one should move the cursor there, which means resolving that path
 * against the source text rather than the parsed object.
 *
 * This walks the document by indentation, tracking the current key path and the
 * index within each sequence, and returns the offset of the first line whose
 * path matches. It is deliberately forgiving: a miss returns null and the UI
 * simply does not jump.
 */
export function findPathOffset(text: string, path: string): number | null {
  const target = normalize(path)
  if (!target.length) return null

  const lines = text.split('\n')
  const stack: { indent: number; key: string; seq: number }[] = []
  let offset = 0

  for (const line of lines) {
    const lineStart = offset
    offset += line.length + 1

    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = line.length - line.trimStart().length
    const isItem = trimmed.startsWith('- ') || trimmed === '-'

    while (stack.length && stack[stack.length - 1].indent >= indent && !(isItem && stack[stack.length - 1].indent === indent)) {
      stack.pop()
    }

    if (isItem) {
      const parent = stack[stack.length - 1]
      if (parent) parent.seq += 1
      const body = trimmed.replace(/^-\s*/, '')
      const m = body.match(/^([^:#]+):/)
      const here = currentPath(stack)
      if (samePath(here, target)) return lineStart
      if (m) {
        const withKey = [...here, m[1].trim()]
        if (samePath(withKey, target)) return lineStart
      }
      continue
    }

    const m = trimmed.match(/^([^:#]+):/)
    if (!m) continue
    const key = m[1].trim().replace(/^['"]|['"]$/g, '')
    stack.push({ indent, key, seq: -1 })

    if (samePath(currentPath(stack), target)) return lineStart
  }

  return null
}

function currentPath(stack: { key: string; seq: number }[]): string[] {
  const out: string[] = []
  for (const f of stack) {
    out.push(f.key)
    if (f.seq >= 0) out.push(String(f.seq))
  }
  return out
}

/** cv.sections.Experience[0].highlights[2] -> ['cv','sections','Experience','0','highlights','2'] */
export function normalize(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** A prefix match is enough: the deepest resolvable ancestor is a useful jump. */
function samePath(a: string[], b: string[]): boolean {
  if (a.length > b.length) return false
  return a.every((seg, i) => seg === b[i]) && a.length === b.length
}
