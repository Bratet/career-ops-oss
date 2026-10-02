import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { ModelOption } from './types'

/**
 * A model list read from a public docs page and cached on disk, so a new
 * release shows up without a code change and without any API key.
 *
 * Fresh cache (under a day old) → live page → stale cache → null. A fetch or
 * parse failure never replaces a good list with an empty one.
 */

const TTL_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

interface CacheFile {
  fetchedAt: number
  models: ModelOption[]
}

export interface PageCatalog {
  source: string
  cachePath: string
  parse: (page: string) => ModelOption[]
}

const memo = new Map<string, CacheFile>()

export async function pageCatalog({ source, cachePath, parse }: PageCatalog): Promise<ModelOption[] | null> {
  const remembered = memo.get(cachePath)
  if (remembered && Date.now() - remembered.fetchedAt < TTL_MS) return remembered.models

  const cached = remembered ?? await readCache(cachePath)
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    memo.set(cachePath, cached)
    return cached.models
  }

  const live = await fetchPage(source, parse)
  if (live) {
    const fresh = { fetchedAt: Date.now(), models: live }
    memo.set(cachePath, fresh)
    await writeCache(cachePath, fresh).catch(() => {})
    return live
  }
  if (cached) {
    // Retry the page in an hour rather than on every request while offline.
    memo.set(cachePath, { fetchedAt: Date.now() - TTL_MS + RETRY_MS, models: cached.models })
    return cached.models
  }
  return null
}

async function fetchPage(source: string, parse: PageCatalog['parse']): Promise<ModelOption[] | null> {
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null
    const models = parse(await response.text())
    // A reshaped page that yields nothing must not replace a good list.
    return models.length ? models : null
  } catch {
    return null
  }
}

async function readCache(path: string): Promise<CacheFile | null> {
  try {
    const value = JSON.parse(await readFile(path, 'utf-8'))
    if (typeof value?.fetchedAt !== 'number' || !Array.isArray(value.models) || !value.models.length) return null
    return value as CacheFile
  } catch {
    return null
  }
}

async function writeCache(path: string, cache: CacheFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}`
  await writeFile(temp, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8')
  await rename(temp, path)
}
