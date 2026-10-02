import { PATHS } from '../paths'
import { pageCatalog } from './catalogCache'
import type { ModelOption } from './types'

/**
 * The Claude model catalog, read from Anthropic's public models overview. The
 * page needs no login, which matters: this app runs on the subscription
 * session and holds no API key. FALLBACK covers a first run with no network.
 */

const SOURCE = 'https://platform.claude.com/docs/en/models/overview.md'

const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'] as const
type Family = typeof FAMILIES[number]

/** Snapshot of the overview page on 2026-10-01; used only when nothing else works. */
const FALLBACK: ModelOption[] = [
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-opus-4-5', label: 'Opus 4.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
]

/**
 * Pull model ids out of the overview markdown: the current models from the
 * comparison table ("Claude API ID" row, names from the header row) and the
 * older ones from the "Legacy models (still available)" link list.
 */
export function parseClaudeCatalog(markdown: string): ModelOption[] {
  const found = new Map<string, ModelOption>()
  const lines = markdown.split('\n')
  const cells = (line: string) => line.split('|').slice(1, -1).map((cell) => cell.trim())

  const header = lines.find((line) => /^\|\s*Feature\s*\|/.test(line))
  const ids = lines.find((line) => /^\|\s*Claude API ID\s*\|/.test(line))
  if (header && ids) {
    const names = cells(header).slice(1)
    cells(ids).slice(1).forEach((cell, index) => {
      const id = cell.match(/`(claude-[a-z0-9-]+)`/)?.[1]
      const label = names[index]?.replace(/^Claude\s+/, '')
      if (id && label) found.set(id, { id, label })
    })
  }

  const legacy = lines.find((line) => /^Legacy models/i.test(line))
  for (const match of legacy?.matchAll(/\[Claude ([^\]]+)\]\([^)]*\/models\/([a-z0-9-]+)\/overview\)/g) ?? []) {
    const id = `claude-${match[2]}`
    if (!found.has(id)) found.set(id, { id, label: match[1] })
  }

  return sortModels([...found.values()].filter((model) => familyOf(model.id)))
}

/** Every Claude model to offer, newest first within each family. */
export async function claudeModels(): Promise<ModelOption[]> {
  return await pageCatalog({ source: SOURCE, cachePath: PATHS.claudeModels, parse: parseClaudeCatalog }) ?? FALLBACK
}

/**
 * Turn a family alias ("opus", "sonnet"…) or an empty choice into the newest
 * pinned id in that family. Settings saved before the aliases were removed
 * still work; pinned ids pass through untouched.
 */
export async function resolveClaudeModel(id: string): Promise<string> {
  const family = id === '' ? 'opus' : (FAMILIES as readonly string[]).includes(id) ? id as Family : null
  if (!family) return id
  const models = await claudeModels()
  return models.find((model) => familyOf(model.id) === family)?.id ?? id
}

function familyOf(id: string): Family | null {
  return FAMILIES.find((family) => id.startsWith(`claude-${family}-`)) ?? null
}

/** Family order, then version descending: claude-opus-4-10 sorts above claude-opus-4-8. */
function sortModels(models: ModelOption[]): ModelOption[] {
  const version = (id: string) => id.split('-').slice(2).filter((part) => part.length < 8).map(Number)
  return models.sort((a, b) => {
    const family = FAMILIES.indexOf(familyOf(a.id)!) - FAMILIES.indexOf(familyOf(b.id)!)
    if (family) return family
    const [va, vb] = [version(a.id), version(b.id)]
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const diff = (vb[i] ?? 0) - (va[i] ?? 0)
      if (diff) return diff
    }
    return 0
  })
}
