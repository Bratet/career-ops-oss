'use client'

import { useRef, useState } from 'react'
import { ArrowUpRight, Plus } from 'lucide-react'
import { Badge, Card, Empty } from '@/components/ui/primitives'
import { savedSearchSchema, type SavedSearch } from '@/lib/savedSearchSchema'

const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50'
const input = 'mt-1 block w-full rounded-md border bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--color-accent)]'
const blank = (): SavedSearch => ({ id: crypto.randomUUID(), title: '', url: '', track: '', notes: '' })

export function ApplyPlan({ initial }: { initial: { searches: SavedSearch[]; revision: string } }) {
  const [data, setData] = useState(initial)
  const [draft, setDraft] = useState<SavedSearch | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const tracks = [...new Set(data.searches.map((search) => search.track || 'Other'))]
  const visible = data.searches.filter((search) => !filter || (search.track || 'Other') === filter)

  function edit(search: SavedSearch) {
    setDraft({ ...search })
    setError('')
    setNotice('')
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      formRef.current?.querySelector('input')?.focus()
    })
  }

  async function save(searches: SavedSearch[], message: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/saved-searches', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searches, revision: data.revision }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save your searches.')
      setData(result)
      setDraft(null)
      setRemoving(null)
      if (filter && !searches.some((search) => (search.track || 'Other') === filter)) setFilter('')
      setNotice(message)
      addRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Apply plan</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">Your starting points for the next application session. Open a search and pick up with your filters ready.</p>
        </div>
        <button ref={addRef} className={button} disabled={busy} onClick={() => edit(blank())}><Plus size={14} />Add search</button>
      </div>

      {error && <p role="alert" className="text-sm text-[var(--color-bad)]">{error}</p>}
      <p role="status" className="text-xs text-[var(--color-muted)]">{busy ? 'Saving searches…' : notice}</p>

      {draft && (
        <Card className="p-5">
          <form ref={formRef} className="max-w-3xl space-y-4" onSubmit={(event) => {
            event.preventDefault()
            const parsed = savedSearchSchema.safeParse(draft)
            if (!parsed.success) { setError(parsed.error.issues[0].message); return }
            const exists = data.searches.some((search) => search.id === draft.id)
            void save(exists ? data.searches.map((search) => search.id === draft.id ? parsed.data : search) : [...data.searches, parsed.data], 'Search saved.')
          }}>
            <h2 className="text-sm font-medium">{data.searches.some((search) => search.id === draft.id) ? 'Edit search' : 'New saved search'}</h2>
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs">Search name<input required maxLength={120} className={input} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="AI roles · remote worldwide" /></label>
                <label className="text-xs">Track <span className="text-[var(--color-muted)]">(optional)</span><input maxLength={80} list="search-tracks" className={input} value={draft.track} onChange={(event) => setDraft({ ...draft, track: event.target.value })} placeholder="Remote" /><datalist id="search-tracks">{tracks.map((track) => <option key={track} value={track} />)}</datalist></label>
              </div>
              <label className="block text-xs">Search URL<input required type="url" maxLength={12000} className={input} value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://www.linkedin.com/jobs/search/…" /><span className="mt-1 block text-[var(--color-muted)]">Set your filters on LinkedIn or another job board, then paste the full address here.</span></label>
              <label className="block text-xs">Notes <span className="text-[var(--color-muted)]">(optional)</span><textarea maxLength={2000} rows={3} className={input} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="What to look for, what to skip, or when to run this search." /></label>
              <div className="flex gap-2"><button type="submit" className={button}>Save search</button><button type="button" className={button} onClick={() => { setDraft(null); setError(''); addRef.current?.focus() }}>Cancel</button></div>
            </fieldset>
          </form>
        </Card>
      )}

      {data.searches.length > 0 && <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs">Track<select className="rounded-md border bg-[var(--color-surface)] px-3 py-2" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All tracks</option>{tracks.map((track) => <option key={track}>{track}</option>)}</select></label><span className="text-xs text-[var(--color-muted)]">{visible.length} saved {visible.length === 1 ? 'search' : 'searches'} · opens in a new tab</span></div>}

      {!data.searches.length ? <Card><Empty title="Build your application routine" hint="Add a filtered job-search URL to create your first clickable search card." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((search) => (
            <Card key={search.id} className="flex min-w-0 flex-col overflow-hidden">
              <a href={search.url} target="_blank" rel="noopener noreferrer" className="group flex flex-1 flex-col p-5 transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]" aria-label={`${search.title} (opens in a new tab)`}>
                <div className="flex items-center justify-between gap-3"><Badge>{search.track || 'Other'}</Badge><ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-[var(--color-accent)]" /></div>
                <h2 className="mt-4 break-words text-base font-medium group-hover:text-[var(--color-accent)]">{search.title}</h2>
                {search.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-muted)]">{search.notes}</p>}
                <p className="mt-auto break-all pt-5 text-xs text-[var(--color-muted)]">{new URL(search.url).hostname.replace(/^www\./, '')}</p>
                <span className="mt-2 text-xs font-medium text-[var(--color-accent)]">Open search</span>
              </a>
              <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
                {removing === search.id ? <><span className="text-xs">Remove this search?</span><button disabled={busy} className={button} onClick={() => void save(data.searches.filter((item) => item.id !== search.id), 'Search removed.')}>Remove</button><button disabled={busy} className={button} onClick={() => setRemoving(null)}>Keep</button></> : <><button disabled={busy} className={button} aria-label={`Edit ${search.title}`} onClick={() => edit(search)}>Edit</button><button disabled={busy || draft !== null} className={button} aria-label={`Remove ${search.title}`} onClick={() => setRemoving(search.id)}>Remove</button></>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
