'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Application } from '@/lib/applications'
import { OUTREACH_KINDS, type OutreachDrafts, type OutreachKind } from '@/lib/outreach'
import { STATUSES } from '@/lib/statuses'
import { Card, CardHeader } from '@/components/ui/primitives'

const labels: Record<OutreachKind, string> = { 'cover-letter': 'Cover letter', email: 'Application email', linkedin: 'LinkedIn message' }
const input = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]'
const button = 'rounded-md border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40'

export function NextSteps({ app, initialDrafts }: { app: Application; initialDrafts: OutreachDrafts }) {
  const router = useRouter()
  const [status, setStatus] = useState(app.row?.status ?? 'Preparing')
  const [notes, setNotes] = useState(app.row?.notes ?? '')
  const [kind, setKind] = useState<OutreachKind>('cover-letter')
  const [drafts, setDrafts] = useState(initialDrafts)
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const base = `/api/applications/${encodeURIComponent(app.key)}`
  const back = `/applications/${encodeURIComponent(app.key)}?tab=resume`
  const pdf = app.folder?.docs.find((doc) => doc.key === 'pdf')

  async function perform(action: string, task: () => Promise<void>) {
    setBusy(action); setError(null); setNotice('')
    try { await task() } catch (err) { setError((err as Error).message) } finally { setBusy(null) }
  }

  async function request(url: string, method: string, body: object) {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? 'Could not save. Please try again.')
    return data
  }

  return <div className="mx-auto max-w-4xl space-y-6">
    <div>
      <Link href={back} className="text-xs text-[var(--color-accent)] hover:underline">← Back to resume</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{pdf ? 'Your resume is ready. What’s next?' : 'Prepare your next steps'}</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{app.row?.company ?? app.folder?.slug} · {app.row?.role ?? 'Application'}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Update your tracker and prepare anything else you need before sending your application.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {pdf ? <a href={`${base}/file/${encodeURIComponent(pdf.name)}`} target="_blank" rel="noreferrer" className={button}>Open finalized PDF</a> : <Link href={back} className={button}>Finalize your resume first</Link>}
        <Link href="/applications" className={button}>Back to applications</Link>
      </div>
    </div>
    {error ? <p role="alert" className="text-sm text-[var(--color-bad)]">{error}</p> : null}
    <p role="status" className="text-sm text-[var(--color-ok)]">{notice}</p>
    <Card>
      <CardHeader title="Update application status" hint="Choose Applied once you have sent the application." />
      {app.row ? <form className="space-y-4 p-5" onSubmit={(event) => {
        event.preventDefault()
        void perform('status', async () => { await request(base, 'PATCH', { status, notes }); setNotice('Status and notes saved.'); router.refresh() })
      }}>
        <label className="block space-y-2 text-sm"><span>Status</span><select disabled={!!busy} className={input} value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUSES.map((value) => <option key={value}>{value}</option>)}
          {!STATUSES.includes(status as never) ? <option>{status}</option> : null}
        </select></label>
        <label className="block space-y-2 text-sm"><span>Notes and follow-up reminders</span><textarea disabled={!!busy} className={input} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contact person, submission details, or when to follow up…" /></label>
        <button disabled={!!busy} className={button}>{busy === 'status' ? 'Saving…' : 'Save status and notes'}</button>
      </form> : <p className="p-5 text-sm text-[var(--color-muted)]">This application has no tracker row. You can still prepare your messages below.</p>}
    </Card>
    <Card>
      <CardHeader title="Prepare an optional message" hint="AI drafts use your finalized resume and job posting. Review the wording before sending. Drafts stay here when you save them." />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Message type">
          {OUTREACH_KINDS.map((value) => <button key={value} disabled={!!busy} aria-pressed={kind === value} onClick={() => { setKind(value); setNotice('') }} className={`${button} ${kind === value ? 'bg-[var(--color-surface-2)] text-[var(--color-accent)]' : ''}`}>{labels[value]}{drafts[value] ? ' · Draft' : ''}</button>)}
        </div>
        <label className="block space-y-2 text-sm"><span>Instructions for AI (optional)</span><textarea disabled={!!busy} rows={2} maxLength={8000} className={input} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Recipient, language, tone, or points to include…" /></label>
        <button disabled={!!busy || !pdf} className={button} onClick={() => void perform('generate', async () => {
          const data = await request(`${base}/outreach`, 'POST', { kind, instructions })
          setDrafts((current) => ({ ...current, [kind]: data.text })); setNotice('Draft generated. Review, edit, and save it below.')
        })}>{busy === 'generate' ? 'Writing draft… This may take a minute.' : drafts[kind] ? 'Regenerate draft' : `Draft ${labels[kind].toLowerCase()} with AI`}</button>
        {drafts[kind] ? <p className="text-xs text-[var(--color-muted)]">Regenerating replaces the text below. Save or copy any wording you want to keep first.</p> : null}
        <label className="block space-y-2 text-sm"><span>{labels[kind]} draft</span><textarea disabled={!!busy} rows={12} maxLength={30000} className={`${input} leading-relaxed`} value={drafts[kind] ?? ''} onChange={(event) => { setDrafts((current) => ({ ...current, [kind]: event.target.value })); setNotice('') }} placeholder="Write your own message here, or generate a draft above." /></label>
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy} className={button} onClick={() => void perform('draft', async () => {
            await request(`${base}/outreach`, 'PUT', { kind, text: drafts[kind] ?? '' }); setNotice(`${labels[kind]} saved.`)
          })}>{busy === 'draft' ? 'Saving…' : 'Save draft'}</button>
          <button disabled={!!busy || !drafts[kind]} className={button} onClick={() => void perform('copy', async () => { await navigator.clipboard.writeText(drafts[kind] ?? ''); setNotice('Draft copied.') })}>Copy draft</button>
        </div>
      </div>
    </Card>
  </div>
}
