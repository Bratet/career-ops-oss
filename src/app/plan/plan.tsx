'use client'

import { useRef, useState } from 'react'
import { ArrowUpRight, Plus, Search, X } from 'lucide-react'
import { Badge, Card } from '@/components/ui/primitives'
import { savedSearchSchema, type SavedSearch } from '@/lib/savedSearchSchema'

const secondaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1.5 block min-h-10 w-full rounded-lg border bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-faint)]'
const blank = (): SavedSearch => ({ id: crypto.randomUUID(), title: '', url: '', track: '', notes: '' })

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

export function ApplyPlan({ initial }: { initial: { searches: SavedSearch[]; revision: string } }) {
  const [data, setData] = useState(initial)
  const [draft, setDraft] = useState<SavedSearch | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const tracks = [...new Set(data.searches.map((search) => search.track || 'Other'))].sort((a, b) => a.localeCompare(b))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visible = data.searches.filter((search) =>
    (!trackFilter || (search.track || 'Other') === trackFilter)
    && (!normalizedQuery || [search.title, search.track, search.notes, hostname(search.url)].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))),
  )
  const editing = draft && data.searches.some((search) => search.id === draft.id)

  function draftChanged() {
    if (!draft) return false
    const original = data.searches.find((search) => search.id === draft.id)
    return JSON.stringify(draft) !== JSON.stringify(original ?? { ...draft, title: '', url: '', track: '', notes: '' })
  }

  function edit(search: SavedSearch) {
    if (draftChanged() && !window.confirm('Discard your unsaved search changes?')) return
    setDraft({ ...search })
    setError('')
    setNotice('')
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      formRef.current?.querySelector('input')?.focus()
    })
  }

  function cancel() {
    if (draftChanged() && !window.confirm('Discard your unsaved search changes?')) return
    setDraft(null)
    setError('')
    addRef.current?.focus()
  }

  async function save(searches: SavedSearch[], message: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/saved-searches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searches, revision: data.revision }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save your searches.')
      setData(result)
      setDraft(null)
      setRemoving(null)
      if (trackFilter && !searches.some((search) => (search.track || 'Other') === trackFilter)) setTrackFilter('')
      setNotice(message)
      addRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Saved searches</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">Keep your filtered job-board links in one place. Open a search when you’re ready to find the next role.</p>
        </div>
        <button ref={addRef} type="button" className={primaryButton} disabled={busy} onClick={() => edit(blank())}><Plus size={16} aria-hidden="true" />Add search</button>
      </div>

      {notice && <p role="status" className="text-xs text-[var(--color-ok)]">{notice}</p>}
      {busy && <p role="status" className="text-xs text-[var(--color-muted)]">Saving changes…</p>}

      {draft && (
        <Card className="p-4 sm:p-6">
          <form ref={formRef} className="max-w-3xl space-y-5" onSubmit={(event) => {
            event.preventDefault()
            const parsed = savedSearchSchema.safeParse(draft)
            if (!parsed.success) { setError(parsed.error.issues[0].message); return }
            const searches = editing
              ? data.searches.map((search) => search.id === draft.id ? parsed.data : search)
              : [...data.searches, parsed.data]
            void save(searches, editing ? 'Search updated.' : 'Search added.')
          }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{editing ? 'Edit saved search' : 'Add a saved search'}</h2>
                <p className="mt-1 text-xs text-[var(--color-muted)]">Copy the address after setting filters on a job board. You can return to the same search anytime.</p>
              </div>
              <button type="button" onClick={cancel} aria-label="Close search form" className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><X size={16} aria-hidden="true" /></button>
            </div>
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium">Search name<input required maxLength={120} className={input} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="AI roles · remote worldwide" /></label>
                <label className="text-xs font-medium">Track <span className="font-normal text-[var(--color-muted)]">(optional)</span><input maxLength={80} list="search-tracks" className={input} value={draft.track} onChange={(event) => setDraft({ ...draft, track: event.target.value })} placeholder="Remote" /><datalist id="search-tracks">{tracks.map((track) => <option key={track} value={track} />)}</datalist></label>
              </div>
              <label className="block text-xs font-medium">Search URL<input required type="url" maxLength={12000} className={input} value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://www.linkedin.com/jobs/search/…" /></label>
              <label className="block text-xs font-medium">Notes <span className="font-normal text-[var(--color-muted)]">(optional)</span><textarea maxLength={2000} rows={3} className={input} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="What to look for, what to skip, or when to run this search." /></label>
              {error && <p role="alert" className="text-xs text-[var(--color-bad)]">{error}</p>}
              <div className="flex flex-wrap gap-2"><button type="submit" className={primaryButton}>{editing ? 'Save changes' : 'Save search'}</button><button type="button" className={secondaryButton} onClick={cancel}>Cancel</button></div>
            </fieldset>
          </form>
        </Card>
      )}

      {data.searches.length ? (
        <section className="space-y-4" aria-label="Your saved searches">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Your searches <span className="ml-1 font-normal text-[var(--color-muted)] tnum">({data.searches.length})</span></h2>
            <span className="text-xs text-[var(--color-muted)]">Links open in a new tab</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="relative min-w-52 flex-1 text-xs font-medium sm:max-w-sm">Find a search
              <Search aria-hidden="true" size={15} className="absolute bottom-3 left-3 text-[var(--color-muted)]" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={input + ' pl-9'} placeholder="Search names and notes" />
            </label>
            <label className="min-w-40 text-xs font-medium">Track
              <select className={input} value={trackFilter} onChange={(event) => setTrackFilter(event.target.value)}>
                <option value="">All tracks</option>
                {tracks.map((track) => <option key={track} value={track}>{track}</option>)}
              </select>
            </label>
            {(query || trackFilter) && <button type="button" className={secondaryButton} onClick={() => { setQuery(''); setTrackFilter('') }}>Clear filters</button>}
          </div>
          {visible.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((search) => (
                <Card key={search.id} className="flex min-w-0 flex-col overflow-hidden">
                  <a href={search.url} target="_blank" rel="noopener noreferrer" className="group flex flex-1 flex-col p-5 transition-colors hover:bg-[var(--color-surface-2)] focus-visible:-outline-offset-2" aria-label={`Open ${search.title} in a new tab`}>
                    <div className="flex items-center justify-between gap-3"><Badge>{search.track || 'Other'}</Badge><ArrowUpRight size={17} aria-hidden="true" className="shrink-0 text-[var(--color-accent)]" /></div>
                    <h3 className="mt-4 break-words text-base font-semibold group-hover:text-[var(--color-accent)]">{search.title}</h3>
                    {search.notes && <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-muted)]">{search.notes}</p>}
                    <p className="mt-auto break-all pt-5 text-xs text-[var(--color-muted)]">{hostname(search.url)}</p>
                    <span className="mt-2 text-xs font-semibold text-[var(--color-accent)]">Open search</span>
                  </a>
                  <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
                    {removing === search.id ? (
                      <>
                        <span className="mr-auto text-xs">Remove this search?</span>
                        <button type="button" disabled={busy} className={secondaryButton + ' text-[var(--color-bad)]'} onClick={() => void save(data.searches.filter((item) => item.id !== search.id), 'Search removed.')}>Remove</button>
                        <button type="button" disabled={busy} className={secondaryButton} onClick={() => setRemoving(null)}>Keep</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={busy} className={secondaryButton} aria-label={`Edit ${search.title}`} onClick={() => edit(search)}>Edit</button>
                        <button type="button" disabled={busy || draft !== null} className={secondaryButton} aria-label={`Remove ${search.title}`} onClick={() => setRemoving(search.id)}>Remove</button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-sm font-medium">No searches match your filters</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">Try a different term or show all tracks.</p>
              <button type="button" className={secondaryButton + ' mt-4'} onClick={() => { setQuery(''); setTrackFilter('') }}>Show all searches</button>
            </Card>
          )}
        </section>
      ) : (
        <Card className="px-6 py-12 text-center">
          <h2 className="text-base font-semibold">Keep your next search close</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">Save a filtered job-board URL here, then reopen it whenever you’re ready to look for roles.</p>
          <button type="button" className={primaryButton + ' mt-5'} onClick={() => edit(blank())}><Plus size={16} aria-hidden="true" />Add your first search</button>
        </Card>
      )}
      {!draft && error && <p role="alert" className="text-xs text-[var(--color-bad)]">{error}</p>}
    </div>
  )
}
