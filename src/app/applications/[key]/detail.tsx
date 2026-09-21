'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Application } from '@/lib/applications'
import { STATUSES } from '@/lib/statuses'
import { Card, CardHeader, Badge, statusTone, Empty, Spinner } from '@/components/ui/primitives'
import { DocDots } from '@/components/DocDots'
import { fmtDate, cn } from '@/lib/utils'

type Tab = 'jd' | 'notes' | 'files' | 'yaml'

export function ApplicationDetail({
  app, jd, notes, yaml, yamlName, allFolders,
}: {
  app: Application
  jd: string | null
  notes: string | null
  yaml: string | null
  yamlName: string | null
  allFolders: string[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(jd ? 'jd' : notes ? 'notes' : 'files')
  const [status, setStatus] = useState(app.row?.status ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const pdf = app.folder?.docs.find((d) => d.key === 'pdf')

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/applications/${app.key}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'update failed')
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function removeApplication() {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/applications/${app.key}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'delete failed')
      router.replace('/applications')
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/applications" className="text-xs text-[var(--color-faint)] hover:text-[var(--color-accent)]">
            ← Applications
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold tracking-tight">
            {app.row?.company ?? app.folder?.slug ?? 'Unknown'}
          </h1>
          <p className="truncate text-xs text-[var(--color-muted)]">
            {app.row?.role ?? <span className="text-[var(--color-faint)]">no tracker row for this folder</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {app.folder ? (
            <Link href={`/runs?applicationKey=${encodeURIComponent(app.key)}`} className="text-xs text-[var(--color-accent)] hover:underline">
              AI runs
            </Link>
          ) : null}
          {app.row ? (
            <>
              <span className="text-xs text-[var(--color-faint)] tnum">#{app.row.id}</span>
              <span className="text-xs text-[var(--color-muted)] tnum">{fmtDate(app.row.date)}</span>
              {app.row.score !== 'N/A' ? <Badge>{app.row.score}</Badge> : null}
              <select
                value={status}
                disabled={busy}
                onChange={(e) => { setStatus(e.target.value); void patch({ status: e.target.value }) }}
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                {!STATUSES.includes(status as never) && status ? <option value={status}>{status} (legacy)</option> : null}
              </select>
            </>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="h-7 rounded-md border border-[var(--color-bad-soft)] px-2.5 text-xs text-[var(--color-bad)] hover:border-[var(--color-bad)] disabled:opacity-40"
          >
            Delete application
          </button>
          {busy ? <Spinner /> : null}
        </div>
      </div>

      {err ? (
        <Card className="border-[var(--color-bad-soft)]">
          <p className="px-4 py-2.5 text-xs text-[var(--color-bad)]">{err}</p>
        </Card>
      ) : null}

      {confirmDelete ? (
        <Card className="border-[var(--color-bad)]">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-64 flex-1">
              <p className="text-sm font-medium">Delete this application?</p>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                It will be removed from Applications{app.row ? ' and the tracker' : ''}.
                {app.folder
                  ? ' Its document folder will be moved to recoverable local trash.'
                  : ' No document folder is attached to this application.'}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeApplication()}
              className="rounded-md bg-[var(--color-bad)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {busy ? 'Deleting…' : 'Yes, delete application'}
            </button>
          </div>
        </Card>
      ) : null}

      {app.row && !app.folder ? <FolderLinker folders={allFolders} onLink={(f) => patch({ folder: f })} /> : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-2 py-1.5">
            {([
              ['jd', 'JD', !!jd],
              ['notes', 'Notes', !!notes],
              ['yaml', 'YAML', !!yaml],
              ['files', `Files (${app.folder?.docs.length ?? 0})`, true],
            ] as [Tab, string, boolean][]).map(([id, label, enabled]) => (
              <button
                key={id}
                disabled={!enabled}
                onClick={() => setTab(id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  tab === id ? 'bg-[var(--color-surface-2)] text-[var(--color-text)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
                  !enabled && 'cursor-not-allowed opacity-35',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[70vh] min-h-72 overflow-auto">
            {tab === 'files' ? (
              <FileList app={app} />
            ) : tab === 'jd' && jd ? (
              <Pre text={jd} />
            ) : tab === 'notes' && notes ? (
              <Pre text={notes} />
            ) : tab === 'yaml' && yaml ? (
              <Pre text={yaml} mono />
            ) : (
              <Empty title="Not in this folder" hint="Most of the historical folders only kept the rendered PDF." />
            )}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader
            title="Rendered CV"
            action={
              app.folder && yamlName ? (
                <Link href={`/applications/${app.key}/editor`} className="text-xs text-[var(--color-accent)] hover:underline">
                  Open in editor →
                </Link>
              ) : null
            }
          />
          {pdf && app.folder ? (
            <iframe
              src={`/api/applications/${app.key}/file/${encodeURIComponent(pdf.name)}#toolbar=0&navpanes=0&view=FitH`}
              className="h-[70vh] w-full bg-white"
              title="CV"
            />
          ) : (
            <Empty title="No rendered PDF" hint={app.folder ? 'This folder has no PDF in it.' : 'No folder linked.'} />
          )}
        </Card>
      </div>

      {app.row?.notes ? (
        <Card>
          <CardHeader title="Tracker notes" />
          <p className="px-5 py-3 text-[13px] leading-relaxed text-[var(--color-muted)]">{app.row.notes}</p>
        </Card>
      ) : null}
    </div>
  )
}

function Pre({ text, mono }: { text: string; mono?: boolean }) {
  return (
    <pre className={cn('whitespace-pre-wrap break-words px-5 py-4 text-xs leading-relaxed text-[var(--color-muted)]', mono && 'font-mono')}>
      {text}
    </pre>
  )
}

function FileList({ app }: { app: Application }) {
  if (!app.folder) return <Empty title="No folder linked" />
  if (!app.folder.docs.length) return <Empty title="Folder is empty" />

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-2.5">
        <code className="text-xs text-[var(--color-faint)]">output/{app.folder.folder}/</code>
        <DocDots has={app.folder.has} />
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {app.folder.docs.map((d) => (
          <li key={d.name}>
            <a
              href={`/api/applications/${app.key}/file/${encodeURIComponent(d.name)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-5 py-2 text-[13px] hover:bg-[var(--color-surface-2)]"
            >
              <span className="flex-1 truncate">{d.name}</span>
              <span className="text-xs text-[var(--color-faint)] tnum">{(d.size / 1024).toFixed(1)} KB</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FolderLinker({ folders, onLink }: { folders: string[]; onLink: (f: string) => void }) {
  const [pick, setPick] = useState('')
  return (
    <Card className="border-[var(--color-warn-soft)]">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <span className="text-xs text-[var(--color-warn)]">⚠</span>
        <p className="flex-1 text-xs text-[var(--color-muted)]">
          No folder is linked to this row, so its documents can&apos;t be shown.
        </p>
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="h-7 max-w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs outline-none"
        >
          <option value="">Pick a folder…</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button
          disabled={!pick}
          onClick={() => onLink(pick)}
          className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-[var(--color-bg)] disabled:opacity-40"
        >
          Link
        </button>
      </div>
    </Card>
  )
}
