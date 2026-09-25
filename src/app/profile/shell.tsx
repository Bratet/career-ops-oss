'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileText, Layers3 } from 'lucide-react'
import { EditorPane } from '@/components/EditorPane'
import { Badge, Card, Empty } from '@/components/ui/primitives'
import type { ProfileStats } from '@/lib/profile'
import { cn } from '@/lib/utils'
import { SOURCES, sourceById } from './sources'

const GROUPS = [
  { family: 'ownCv', title: 'General resumes', description: 'Starting CVs for applications without a job description.', icon: FileText },
  { family: 'masters', title: 'Master resumes', description: 'Source material for job-specific CV tailoring.', icon: Layers3 },
] as const

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
  const [dirty, setDirty] = useState(false)

  function selectSource(id: string) {
    if (id === src) return
    if (dirty && !window.confirm('You have unsaved resume changes. Switch sources and discard them?')) return
    setDirty(false)
    router.push(`/profile?src=${id}`)
  }

  async function save(text: string) {
    const response = await fetch(`/api/masters/${source.lang}?family=${source.family}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yaml: text }),
    })
    if (!response.ok) throw new Error((await response.json()).error ?? 'Could not save this resume.')
    router.refresh()
  }

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">Resume sources</h1>
        <Card>
          <Empty title="Source not found" hint={error} />
          <div className="flex flex-wrap justify-center gap-2 px-5 pb-6">
            {SOURCES.filter((item) => item.id !== src).map((item) => (
              <button key={item.id} type="button" onClick={() => selectSource(item.id)} className="min-h-9 rounded-lg border px-3 text-xs font-medium hover:bg-[var(--color-surface-2)]">Open {item.label}</button>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Resume sources</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-muted)]">Maintain the resumes new applications start from. Each application gets its own copy, so later edits here won’t change existing applications.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2" aria-label="Resume source groups">
        {GROUPS.map((group) => {
          const active = source.family === group.family
          return (
            <section key={group.family} className={cn('rounded-xl border bg-[var(--color-surface)] p-4 sm:p-5', active && 'border-[var(--color-border-strong)]')}>
              <div className="flex items-start gap-3">
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-muted)]', active && 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]')}>
                  <group.icon aria-hidden="true" size={18} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">{group.title}</h2>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--color-muted)]">{group.description}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 sm:pl-12" aria-label={`${group.title} languages`}>
                {SOURCES.filter((item) => item.family === group.family).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectSource(item.id)}
                    aria-pressed={item.id === src}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)]',
                      item.id === src && 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
                    )}
                  >
                    {item.lang === 'en' ? 'English' : 'French'}
                    {item.id === src && <ArrowRight aria-hidden="true" size={13} />}
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-3">
        <p className="text-xs text-[var(--color-muted)]">Editing {source.lang === 'en' ? 'English' : 'French'} · Save changes before switching sources.</p>
        {source.family === 'ownCv' ? null : parity ? (
          <span className="max-w-full text-xs text-[var(--color-warn)]">EN / FR structure differs: {parity}</span>
        ) : (
          <Badge tone="ok">EN / FR structure in step</Badge>
        )}
      </div>

      {stats?.sections.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]" aria-label="Resume content summary">
          {stats.sections.map((section) => (
            <span key={section.name} className="tnum">
              {section.name} <strong className="font-medium text-[var(--color-text)]">{section.entries}</strong>
            </span>
          ))}
          <span className="tnum">bullets <strong className="font-medium text-[var(--color-text)]">{stats.highlights}</strong></span>
        </div>
      ) : null}

      <EditorPane
        key={src}
        initialYaml={yaml}
        mode="master"
        title={`${source.family === 'ownCv' ? 'General' : 'Master'} resume · ${source.lang.toUpperCase()}`}
        general={source.family === 'ownCv'}
        onSave={save}
        onDirtyChange={setDirty}
        chatScope={`profile:${src}`}
        reviewSource={source.id}
      />
    </div>
  )
}
