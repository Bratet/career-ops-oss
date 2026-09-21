import { randomUUID } from 'crypto'
import { cleanupRender } from './render'

/**
 * Rendered previews live in temp dirs. The editor renders on every pause in
 * typing, so without a cap the disk fills up over a long session.
 *
 * The map hangs off globalThis on purpose: POST /api/render and
 * GET /api/render/[token] are separately bundled route modules, so plain module
 * state gives each its own copy and every token 404s.
 */

interface Entry { pdfPath: string; at: number }

const MAX = 12
const TTL_MS = 15 * 60 * 1000

const globalStore = globalThis as typeof globalThis & { __careerOpsRenders?: Map<string, Entry> }
const store: Map<string, Entry> = (globalStore.__careerOpsRenders ??= new Map())

export function put(pdfPath: string): string {
  const token = randomUUID()
  store.set(token, { pdfPath, at: Date.now() })
  sweep()
  return token
}

export function get(token: string): string | null {
  return store.get(token)?.pdfPath ?? null
}

function sweep() {
  const now = Date.now()
  for (const [token, e] of store) {
    if (now - e.at > TTL_MS) drop(token)
  }
  while (store.size > MAX) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (!oldest) break
    drop(oldest[0])
  }
}

function drop(token: string) {
  const e = store.get(token)
  store.delete(token)
  if (e) void cleanupRender(e.pdfPath).catch(() => {})
}
