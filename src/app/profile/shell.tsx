'use client'

import { useRouter } from 'next/navigation'
import { EditorPane } from '@/components/EditorPane'
import { Badge, Card, Empty } from '@/components/ui/primitives'
import type { ProfileStats } from '@/lib/profile'
import { SOURCES, sourceById } from './sources'
import { cn } from '@/lib/utils'

/**
 * The profile: the master resume in both languages, edited in place.
 *
 * The masters are the single source every tailored CV is cut from, so this is
 * the only place new material enters the system.
 */

export function ProfileShell({
  src,
  yaml,
  error,
  stats,
  parity,
}: {
  src: string
  yaml: string
  error: string | null
  stats: ProfileStats | null
  parity: string | null
}) {
  const router = useRouter()
  const source = sourceById(src)
  async function save(text: string) {
    const r = await fetch(`/api/masters/${source.lang}?family=${source.family}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yaml: text }),
    })
    if (!r.ok) throw new Error((await r.json()).error ?? 'save failed')
  }

  if (error) {
    return (
      <Card>
        <Empty title="Source not found" hint={error} />
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)]">Edit your general CV for applications without a job description, or your master resume for job-specific tailoring. New applications receive their own copy.</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => router.push(`/profile?src=${s.id}`)}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs',
                s.id === src
                  ? 'bg-[var(--color-surface-2)] font-medium'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {source.family === 'ownCv' ? null : parity ? (
          // The two masters are required to stay content-identical, only
          // translated, so a count that diverges is a real defect to see here.
          <span className="text-[11px] leading-snug text-[var(--color-warn)]">
            EN and FR differ: {parity}
          </span>
        ) : (
          <Badge tone="ok">EN and FR in step</Badge>
        )}
      </div>

      {stats?.sections.length ? (
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--color-faint)]">
          {stats.sections.map((s) => (
            <span key={s.name} className="tnum">
              {s.name} <span className="text-[var(--color-muted)]">{s.entries}</span>
            </span>
          ))}
          <span className="tnum">
            bullets <span className="text-[var(--color-muted)]">{stats.highlights}</span>
          </span>
        </p>
      ) : null}

      <EditorPane
        key={src}
        initialYaml={yaml}
        mode="master"
        title={source.family === 'ownCv' ? 'General resume' : 'Master resume'}
        general={source.family === 'ownCv'}
        onSave={save}
        chatScope={`profile:${src}`}
      />
    </div>
  )
}
