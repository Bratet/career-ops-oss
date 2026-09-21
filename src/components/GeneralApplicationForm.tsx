'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Spinner } from './ui/primitives'

export function GeneralApplicationForm({ onCreated, onBusy }: { onCreated?: () => void; onBusy?: (busy: boolean) => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [language, setLanguage] = useState('en')

  return (
    <form className="space-y-4 p-5" onSubmit={async (event) => {
      event.preventDefault()
      const fields = Object.fromEntries(new FormData(event.currentTarget))
      setBusy(true)
      onBusy?.(true)
      setError(null)
      try {
        const response = await fetch('/api/applications/general', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not create application')
        if (data.warning) { setCreated(data.key); setError(data.warning); return }
        onCreated?.()
        router.push(`/applications/${data.key}?tab=resume`)
      } catch (reason) { setError((reason as Error).message) } finally { setBusy(false); onBusy?.(false) }
    }}>
      <p className="text-xs leading-relaxed text-[var(--color-muted)]">Enter what you know. We’ll create a tracked application with its own copy of your general CV, ready to tweak and finalize.</p>
      <fieldset disabled={busy || !!created} className="grid gap-3 sm:grid-cols-2">
        {([
          ['company', 'Company', true], ['role', 'Role / opportunity (optional)', false],
          ['location', 'Location (optional)', false], ['contact', 'HR contact (optional)', false],
          ['url', 'Company or opportunity URL (optional)', false],
        ] as const).map(([name, label, required]) => (
          <label key={name} className="block text-xs text-[var(--color-muted)]">{label}
            <input name={name} required={required} maxLength={name === 'url' ? 2000 : 300} type={name === 'url' ? 'url' : 'text'} className="mt-1 h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-[var(--color-accent)]" />
          </label>
        ))}
        <label className="block text-xs text-[var(--color-muted)]">General resume
          <select name="language" value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-[var(--color-accent)]">
            <option value="en">English</option><option value="fr">French</option>
          </select>
        </label>
        <label className="block text-xs text-[var(--color-muted)] sm:col-span-2">Notes / recruiter message (optional)
          <textarea name="notes" rows={3} maxLength={5000} className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm focus-visible:outline-[var(--color-accent)]" />
        </label>
      </fieldset>
      {error ? <p role="alert" className="text-xs text-[var(--color-bad)]">{error}</p> : null}
      {created ? <Link href={`/applications/${created}?tab=resume`} onClick={onCreated} className="text-sm text-[var(--color-accent)] underline">Open saved application</Link> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/profile?src=general-${language}`} onClick={onCreated} className="text-xs text-[var(--color-accent)] underline">Edit general CV in Profile</Link>
        <button disabled={busy || !!created} className="flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-[var(--color-bg)] disabled:opacity-50">{busy ? <Spinner /> : null}{busy ? 'Creating…' : 'Create with general resume'}</button>
      </div>
    </form>
  )
}
