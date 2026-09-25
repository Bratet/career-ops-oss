/**
 * The general and master resume sources shown on the Profile page.
 *
 * Not in shell.tsx: that file is a client component, and the page resolves the
 * source on the server to know which file to read.
 */
export const SOURCES = [
  { id: 'general-en', label: 'General EN', family: 'ownCv' as const, lang: 'en' as const },
  { id: 'general-fr', label: 'General FR', family: 'ownCv' as const, lang: 'fr' as const },
  { id: 'master-en', label: 'Master EN', family: 'masters' as const, lang: 'en' as const },
  { id: 'master-fr', label: 'Master FR', family: 'masters' as const, lang: 'fr' as const },
]

export type Source = (typeof SOURCES)[number]

export function sourceById(id: string | undefined): Source {
  return SOURCES.find((s) => s.id === id) ?? SOURCES[0]
}
