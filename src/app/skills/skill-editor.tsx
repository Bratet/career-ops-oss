'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge, Card, Spinner } from '@/components/ui/primitives'
import type { SkillDocument, SkillRevision } from '@/lib/skills/types'

interface TestResult {
  runner: string
  placeholders: string[]
  characters: number
}

export function SkillEditor({
  initialSkill,
  initialRevisions,
}: {
  initialSkill: SkillDocument
  initialRevisions: SkillRevision[]
}) {
  const router = useRouter()
  const [skill, setSkill] = useState(initialSkill)
  const [markdown, setMarkdown] = useState(initialSkill.markdown)
  const [revisions, setRevisions] = useState(initialRevisions)
  const [busy, setBusy] = useState<'save' | 'test' | 'restore' | 'duplicate' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [test, setTest] = useState<TestResult | null>(null)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [duplicateId, setDuplicateId] = useState(`${skill.metadata.id}-copy`)

  const dirty = markdown !== skill.markdown

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, init)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? 'request failed')
    return data
  }

  async function refreshRevisions() {
    const data = await request(`/api/skills/${skill.metadata.id}/revisions`, { cache: 'no-store' })
    setRevisions(data.revisions as SkillRevision[])
  }

  async function save() {
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const data = await request(`/api/skills/${skill.metadata.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ markdown }),
      })
      const saved = data.skill as SkillDocument
      setSkill(saved)
      setMarkdown(saved.markdown)
      setNotice(`Saved as version ${saved.metadata.version}.`)
      setTest(null)
      await refreshRevisions()
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function testTemplate() {
    setBusy('test')
    setError(null)
    setNotice(null)
    try {
      const data = await request(`/api/skills/${skill.metadata.id}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ markdown }),
      })
      setTest(data as TestResult)
      setNotice('Template and runner contract are valid.')
    } catch (e) {
      setTest(null)
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function restore(revision: SkillRevision) {
    setBusy('restore')
    setError(null)
    setNotice(null)
    try {
      const data = await request(`/api/skills/${skill.metadata.id}/revisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: revision.file }),
      })
      const restored = data.skill as SkillDocument
      setSkill(restored)
      setMarkdown(restored.markdown)
      setNotice(`Restored version ${revision.version} as new version ${restored.metadata.version}.`)
      setTest(null)
      await refreshRevisions()
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function duplicate() {
    setBusy('duplicate')
    setError(null)
    setNotice(null)
    try {
      const data = await request('/api/skills', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId: skill.metadata.id, id: duplicateId }),
      })
      router.push(`/skills/${(data.skill as SkillDocument).metadata.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/skills" className="text-xs text-[var(--color-faint)] hover:text-[var(--color-accent)]">← Skills</Link>
          <div className="mt-1.5 flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{skill.metadata.name}</h1>
            <Badge tone="accent">v{skill.metadata.version}</Badge>
            <Badge>{skill.metadata.runner}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-faint)]">{skill.metadata.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={testTemplate} disabled={busy !== null} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40">
            {busy === 'test' ? 'Testing…' : 'Test template'}
          </button>
          <button onClick={() => setDuplicateOpen((open) => !open)} disabled={busy !== null} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40">
            Duplicate
          </button>
          <button onClick={save} disabled={busy !== null || !dirty} className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] disabled:opacity-40">
            {busy === 'save' ? <Spinner className="border-t-[var(--color-bg)]" /> : null}
            {busy === 'save' ? 'Saving…' : dirty ? 'Save new version' : 'Saved ✓'}
          </button>
        </div>
      </div>

      {duplicateOpen ? (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <label className="text-xs text-[var(--color-muted)]" htmlFor="duplicate-id">New skill ID</label>
          <input id="duplicate-id" value={duplicateId} onChange={(event) => setDuplicateId(event.target.value)} spellCheck={false} className="min-w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 font-mono text-xs outline-none focus:border-[var(--color-accent)]" />
          <button onClick={duplicate} disabled={busy !== null || !duplicateId.trim()} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] disabled:opacity-40">
            {busy === 'duplicate' ? 'Creating…' : 'Create copy'}
          </button>
        </Card>
      ) : null}

      {error ? <p className="rounded-md border border-[var(--color-bad-soft)] bg-[var(--color-bad-soft)] px-3 py-2 text-xs text-[var(--color-bad)]">{error}</p> : null}
      {notice ? <p className="rounded-md border border-[var(--color-ok-soft)] bg-[var(--color-ok-soft)] px-3 py-2 text-xs text-[var(--color-ok)]">{notice}</p> : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
            <div>
              <p className="text-xs font-medium">SKILL.md</p>
              <p className="text-[10px] text-[var(--color-faint)]">Frontmatter configures the runner; Markdown configures model behavior.</p>
            </div>
            {dirty ? <Badge tone="warn">unsaved</Badge> : null}
          </div>
          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            spellCheck={false}
            aria-label="Skill Markdown"
            className="h-[calc(100vh-15rem)] min-h-[520px] w-full resize-y bg-[var(--color-bg)] p-4 font-mono text-xs leading-relaxed text-[var(--color-text)] outline-none"
          />
        </Card>

        <div className="space-y-3">
          <Card>
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="text-sm font-medium">Runner contract</h2>
            </div>
            <dl className="space-y-2 p-4 text-xs">
              <Row label="Runner" value={skill.metadata.runner} mono />
              <Row label="Scope" value={skill.metadata.scope} />
              <Row label="Version" value={String(skill.metadata.version)} />
              <Row label="Capabilities" value={skill.metadata.capabilities.join(', ') || 'none'} />
            </dl>
            {test ? (
              <div className="border-t border-[var(--color-border)] px-4 py-3 text-[11px] text-[var(--color-muted)]">
                Valid · {test.characters.toLocaleString()} instruction characters · {test.placeholders.length} required placeholders
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="text-sm font-medium">Revision history</h2>
              <p className="mt-0.5 text-[10px] text-[var(--color-faint)]">Every save archives the previous version.</p>
            </div>
            {revisions.length ? (
              <ul className="max-h-80 divide-y divide-[var(--color-border)] overflow-y-auto">
                {revisions.map((revision) => (
                  <li key={revision.file} className="flex items-center gap-2 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs">Version {revision.version}</span>
                      <span className="block text-[10px] text-[var(--color-faint)]">{new Date(revision.createdAt).toLocaleString()}</span>
                    </span>
                    <button onClick={() => restore(revision)} disabled={busy !== null} className="text-[11px] text-[var(--color-accent)] hover:underline disabled:opacity-40">Restore</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-xs text-[var(--color-faint)]">No earlier versions yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">{label}</dt>
      <dd className={mono ? 'mt-0.5 font-mono text-[11px]' : 'mt-0.5 leading-relaxed text-[var(--color-muted)]'}>{value}</dd>
    </div>
  )
}
