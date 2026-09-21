'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { Application } from '@/lib/applications'
import { Card, Badge, statusTone, Empty, Spinner } from '@/components/ui/primitives'
import { DocDots } from '@/components/DocDots'
import { fmtDate, cn } from '@/lib/utils'

type SortKey = 'date' | 'company' | 'score' | 'status'

export function ApplicationsTable({ applications, folders }: { applications: Application[]; folders: string[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('date')
  const [asc, setAsc] = useState(false)
  const [linking, setLinking] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const statuses = useMemo(
    () => [...new Set(applications.map((a) => a.row?.status).filter(Boolean) as string[])].sort(),
    [applications],
  )

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = applications.filter((a) => {
      if (status !== 'all' && a.row?.status !== status) return false
      if (!needle) return true
      return [a.row?.company, a.row?.role, a.folder?.folder, a.row?.notes]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(needle))
    })

    const dir = asc ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'company':
          return dir * (a.row?.company ?? a.folder?.slug ?? '').localeCompare(b.row?.company ?? b.folder?.slug ?? '')
        case 'score': {
          const pa = Number.parseFloat(a.row?.score ?? '') || -1
          const pb = Number.parseFloat(b.row?.score ?? '') || -1
          return dir * (pa - pb)
        }
        case 'status':
          return dir * (a.row?.status ?? '').localeCompare(b.row?.status ?? '')
        default:
          return dir * (a.row?.date ?? a.folder?.date ?? '').localeCompare(b.row?.date ?? b.folder?.date ?? '')
      }
    })
  }, [applications, q, status, sort, asc])

  const byKey = useMemo(() => new Map(applications.map((a) => [a.key, a])), [applications])
  const selectedShown = rows.filter((r) => selected.has(r.key)).map((r) => r.key)
  const allShownSelected = rows.length > 0 && selectedShown.length === rows.length

  const unlinked = applications.filter((a) => a.row && !a.folder).length
  const orphanFolders = applications.filter((a) => !a.row && a.folder).length

  async function autoLink() {
    setLinking(true)
    try {
      const r = await fetch('/api/applications/link', { method: 'POST' })
      const d = await r.json()
      alert(`Linked ${d.linked} folder(s).\n${d.stillUnlinkedRows} rows and ${d.stillUnclaimedFolders} folders still unmatched.`)
      location.reload()
    } finally {
      setLinking(false)
    }
  }

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function deleteKeys(keys: string[]) {
    setDeleting(true)
    setErr(null)
    const failures: string[] = []
    for (const key of keys) {
      try {
        const r = await fetch(`/api/applications/${encodeURIComponent(key)}`, { method: 'DELETE' })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'delete failed')
      } catch (e) {
        failures.push(`${key}: ${(e as Error).message}`)
      }
    }
    setDeleting(false)
    setConfirm(null)
    setSelected(new Set())
    if (failures.length) setErr(failures.join(' · '))
    router.refresh()
  }

  function toggle(key: SortKey) {
    if (sort === key) setAsc((v) => !v)
    else { setSort(key); setAsc(key === 'company') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Applications</h1>
          <p className="text-xs text-[var(--color-faint)]">
            {rows.length} of {applications.length}
            {unlinked ? ` · ${unlinked} row${unlinked === 1 ? '' : 's'} with no folder` : ''}
            {orphanFolders ? ` · ${orphanFolders} folder${orphanFolders === 1 ? '' : 's'} with no row` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedShown.length > 0 ? (
            <button
              onClick={() => setConfirm(selectedShown)}
              disabled={deleting}
              className="rounded-md border border-[var(--color-bad-soft)] px-2.5 py-1.5 text-xs text-[var(--color-bad)] transition-colors hover:border-[var(--color-bad)] disabled:opacity-40"
            >
              Delete {selectedShown.length} selected
            </button>
          ) : null}
          {unlinked > 0 ? (
            <button
              onClick={autoLink}
              disabled={linking}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--color-border-strong)] disabled:opacity-50"
            >
              {linking ? <Spinner /> : null} Auto-link folders
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, role, notes…"
          className="h-8 min-w-64 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[13px] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[13px] outline-none focus:border-[var(--color-accent)]"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {err ? (
        <Card className="border-[var(--color-bad-soft)]">
          <p className="px-4 py-2.5 text-xs text-[var(--color-bad)]">{err}</p>
        </Card>
      ) : null}

      {confirm ? (
        <Card className="border-[var(--color-bad)]">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-64 flex-1">
              <p className="text-sm font-medium">
                Delete {confirm.length === 1 ? 'this application' : `these ${confirm.length} applications`}?
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                {confirm.map((k) => label(byKey.get(k))).join(', ')} will be removed from Applications and the
                tracker. Document folders are moved to recoverable local trash.
              </p>
            </div>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirm(null)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void deleteKeys(confirm)}
              className="rounded-md bg-[var(--color-bad)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty title="Nothing matches" hint="Try clearing the search or the status filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] text-[var(--color-faint)]">
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all shown applications"
                      checked={allShownSelected}
                      onChange={() => setSelected(allShownSelected ? new Set() : new Set(rows.map((r) => r.key)))}
                      className="cursor-pointer align-middle accent-[var(--color-accent)]"
                    />
                  </th>
                  <Th w="w-12" onClick={() => toggle('date')} active={sort === 'date'} asc={asc}>#</Th>
                  <Th w="w-28" onClick={() => toggle('date')} active={sort === 'date'} asc={asc}>Date</Th>
                  <Th onClick={() => toggle('company')} active={sort === 'company'} asc={asc}>Company</Th>
                  <Th>Role</Th>
                  <Th w="w-16" onClick={() => toggle('score')} active={sort === 'score'} asc={asc}>Score</Th>
                  <Th w="w-28" onClick={() => toggle('status')} active={sort === 'status'} asc={asc}>Status</Th>
                  <Th w="w-20">Docs</Th>
                  <Th w="w-32">Readiness</Th>
                  <Th w="w-16"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.key}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open workspace for ${a.row?.company ?? a.folder?.slug ?? 'application'}`}
                    onClick={() => router.push(`/applications/${encodeURIComponent(a.key)}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        router.push(`/applications/${encodeURIComponent(a.key)}`)
                      }
                    }}
                    className="group cursor-pointer border-b border-[var(--color-border)] outline-none last:border-0 hover:bg-[var(--color-surface-2)] focus-visible:bg-[var(--color-accent-soft)]"
                  >
                    <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${label(a)}`}
                        checked={selected.has(a.key)}
                        onChange={() => toggleSelected(a.key)}
                        className="cursor-pointer align-middle accent-[var(--color-accent)]"
                      />
                    </td>
                    <td className="px-3 py-2 text-[var(--color-faint)] tnum">{a.row?.id ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)] tnum whitespace-nowrap">
                      {fmtDate(a.row?.date ?? a.folder?.date ?? '')}
                    </td>
                    <td className="max-w-56 truncate px-3 py-2">
                      <span>{a.row?.company ?? a.folder?.slug ?? '—'}</span>
                    </td>
                    <td className="max-w-80 truncate px-3 py-2 text-[var(--color-muted)]">
                      {a.row?.role ?? <span className="text-[var(--color-faint)]">folder only, no tracker row</span>}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-muted)] tnum">{a.row?.score ?? '—'}</td>
                    <td className="px-3 py-2">
                      {a.row ? <Badge tone={statusTone(a.row.status)}>{a.row.status}</Badge> : <Badge>orphan</Badge>}
                    </td>
                    <td className="px-3 py-2"><DocDots has={a.folder?.has ?? null} /></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {a.workspace?.fit ? <Badge tone={a.workspace.fit === 'Strong' ? 'ok' : a.workspace.fit === 'Partial' ? 'warn' : 'bad'}>{a.workspace.fit} fit</Badge> : null}
                        <Badge tone={a.workspace?.resume === 'finalized' ? 'ok' : a.workspace?.resume === 'draft' ? 'warn' : 'neutral'}>{a.workspace?.resume ?? 'missing'}</Badge>
                        {a.workspace?.pending ? <Badge tone="warn">review</Badge> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        disabled={deleting}
                        aria-label={`Delete ${label(a)}`}
                        onClick={() => setConfirm([a.key])}
                        className="rounded-md border border-transparent px-2 py-1 text-xs text-[var(--color-faint)] opacity-0 transition-opacity hover:border-[var(--color-bad)] hover:text-[var(--color-bad)] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function label(a?: Application): string {
  return a?.row?.company ?? a?.folder?.slug ?? a?.key ?? 'application'
}

function Th({
  children, w, onClick, active, asc,
}: {
  children?: React.ReactNode
  w?: string
  onClick?: () => void
  active?: boolean
  asc?: boolean
}) {
  return (
    <th className={cn('px-3 py-2 font-medium', w)}>
      {onClick ? (
        <button onClick={onClick} className={cn('hover:text-[var(--color-text)]', active && 'text-[var(--color-text)]')}>
          {children}
          {active ? <span className="ml-1">{asc ? '↑' : '↓'}</span> : null}
        </button>
      ) : (
        children
      )}
    </th>
  )
}
