import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { PATHS } from '../paths'
import { pageCatalog } from './catalogCache'
import type { ModelOption } from './types'

/**
 * The Codex model catalog, merged from two places that each miss something:
 *
 * - OpenAI's public Codex models page announces new models first, but only
 *   gives cards to a few headline ones (it skips GPT-6 Sol and the GPT-5.6
 *   line, which accounts can still use).
 * - `~/.codex/models_cache.json`, which Codex refreshes from OpenAI per
 *   account, has the full pick list but only after Codex itself has run.
 *
 * Page-only models go first: if Codex hasn't seen a model yet, it is the new
 * one. Then the account list in Codex's own priority order.
 */

const SOURCE = 'https://developers.openai.com/codex/models.md'
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex')

/** `<ModelDetails slug="gpt-6-luna" description="…" />` cards, in page order. */
export function parseCodexCatalog(markdown: string): ModelOption[] {
  const found = new Map<string, ModelOption>()
  for (const [card] of markdown.matchAll(/<ModelDetails\b[\s\S]*?\/?>/g)) {
    const id = card.match(/\bslug="([a-z0-9][a-z0-9.-]*)"/)?.[1]
    if (!id || found.has(id)) continue
    const description = card.match(/\bdescription="([^"]*)"/)?.[1]
    found.set(id, { id, label: labelFor(id), note: description || undefined })
  }
  return [...found.values()]
}

/** Account models as Codex last saw them; hidden entries are internal. */
export function parseCodexCache(value: unknown): ModelOption[] {
  const models = (value as { models?: unknown })?.models
  if (!Array.isArray(models)) return []
  return models
    .filter((m) => typeof m?.slug === 'string' && m.slug && m.visibility !== 'hide')
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .map((m) => ({
      id: m.slug as string,
      label: typeof m.display_name === 'string' && m.display_name ? m.display_name : labelFor(m.slug),
      note: typeof m.description === 'string' ? m.description : undefined,
    }))
}

export function mergeCodexCatalogs(page: ModelOption[], account: ModelOption[]): ModelOption[] {
  const known = new Set(account.map((model) => model.id))
  return [...page.filter((model) => !known.has(model.id)), ...account]
}

export async function codexModels(): Promise<ModelOption[]> {
  const [page, account] = await Promise.all([
    pageCatalog({ source: SOURCE, cachePath: PATHS.codexModels, parse: parseCodexCatalog }),
    readAccountModels(),
  ])
  return mergeCodexCatalogs(page ?? [], account)
}

/** An empty choice means the top of the list rather than Codex's own config. */
export async function resolveCodexModel(id: string): Promise<string> {
  if (id) return id
  return (await codexModels())[0]?.id ?? id
}

async function readAccountModels(): Promise<ModelOption[]> {
  try {
    return parseCodexCache(JSON.parse(await readFile(join(CODEX_HOME, 'models_cache.json'), 'utf-8')))
  } catch {
    return []
  }
}

/** gpt-6.1-sol → GPT-6.1-Sol, matching how Codex itself names them. */
function labelFor(id: string): string {
  return id.split('-').map((part) => part === 'gpt' ? 'GPT' : part.charAt(0).toUpperCase() + part.slice(1)).join('-')
}
