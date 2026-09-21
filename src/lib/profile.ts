import { parse } from 'yaml'

/**
 * What the master profile actually holds, for the Profile page's header.
 *
 * Section names differ between the two masters (Experience / Expérience), so
 * nothing here keys on a name. Parity is compared position by position, which is
 * the shape the two files are required to keep: content-identical, translated.
 */

export interface SectionStat {
  name: string
  entries: number
  highlights: number
}

export interface ProfileStats {
  sections: SectionStat[]
  highlights: number
}

type Entry = { highlights?: unknown[] }

export function profileStats(yaml: string): ProfileStats | null {
  let sections: Record<string, unknown[]>
  try {
    sections = (parse(yaml)?.cv?.sections ?? {}) as Record<string, unknown[]>
  } catch {
    return null
  }

  const stats = Object.entries(sections)
    .filter(([, items]) => Array.isArray(items))
    .map(([name, items]) => ({
      name,
      entries: items.length,
      highlights: items.reduce<number>(
        (n, item) => n + (Array.isArray((item as Entry)?.highlights) ? (item as Entry).highlights!.length : 0),
        0,
      ),
    }))

  return { sections: stats, highlights: stats.reduce((n, s) => n + s.highlights, 0) }
}

/**
 * The first place the two masters fall out of step, in words, or null when they
 * match. Counts only: a translation check is not something to fake with string
 * comparison.
 */
export function parityDiff(en: ProfileStats | null, fr: ProfileStats | null): string | null {
  if (!en || !fr) return null
  if (en.sections.length !== fr.sections.length) {
    return `EN has ${en.sections.length} sections, FR has ${fr.sections.length}`
  }

  for (let i = 0; i < en.sections.length; i++) {
    const a = en.sections[i]
    const b = fr.sections[i]
    if (a.entries !== b.entries) {
      return `${a.name}: ${a.entries} entries in EN, ${b.entries} in FR (${b.name})`
    }
    if (a.highlights !== b.highlights) {
      return `${a.name}: ${a.highlights} bullets in EN, ${b.highlights} in FR (${b.name})`
    }
  }
  return null
}
