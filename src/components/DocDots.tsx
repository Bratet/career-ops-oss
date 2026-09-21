import { cn } from '@/lib/utils'

const DOCS = [
  { key: 'jd', label: 'jd.md' },
  { key: 'yaml', label: 'tailored YAML' },
  { key: 'pdf', label: 'rendered PDF' },
  { key: 'notes', label: 'tailoring notes' },
] as const

/**
 * Four dots for the four documents an application folder should hold.
 *
 * Only one of the 40 historical folders has all four, so this makes the gaps
 * visible at a glance instead of hiding them behind a folder link.
 */
export function DocDots({ has }: { has: Record<string, boolean> | null }) {
  if (!has) {
    return <span className="text-[11px] text-[var(--color-faint)]">no folder</span>
  }

  const present = DOCS.filter((d) => has[d.key]).map((d) => d.label)
  const missing = DOCS.filter((d) => !has[d.key]).map((d) => d.label)

  return (
    <span
      className="flex items-center gap-1"
      title={`present: ${present.join(', ') || 'none'}\nmissing: ${missing.join(', ') || 'none'}`}
    >
      {DOCS.map((d) => (
        <span
          key={d.key}
          aria-label={`${d.label} ${has[d.key] ? 'present' : 'missing'}`}
          className={cn(
            'size-1.5 rounded-full',
            has[d.key] ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-border-strong)]',
          )}
        />
      ))}
    </span>
  )
}
