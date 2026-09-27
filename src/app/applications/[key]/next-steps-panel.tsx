'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, CircleCheck, FileText, Linkedin, Lock, Mail, Send } from 'lucide-react'
import type { Application } from '@/lib/applications'
import type { OutreachDrafts, OutreachKind } from '@/lib/outreach'
import { STATUSES } from '@/lib/statuses'
import { Badge, Card, Spinner, statusTone } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export type NextStep = 'status' | OutreachKind

const input = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-60'
const secondary = 'inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40'
const primary = 'inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40'

const messages: Record<OutreachKind, { title: string; description: string; icon: ReactNode; placeholder: string }> = {
  'cover-letter': { title: 'Write a cover letter', description: 'Only if the application asks for one. Drafted from your finalized resume and the posting.', icon: <FileText size={18} />, placeholder: 'Language, points to stress, anything the posting asks you to address…' },
  email: { title: 'Draft an application email', description: 'For applying or following up by email. Includes a subject line.', icon: <Mail size={18} />, placeholder: 'Recipient name, language, whether this is a first contact or a follow-up…' },
  linkedin: { title: 'Write a LinkedIn message', description: 'A short note to a recruiter or hiring manager.', icon: <Linkedin size={18} />, placeholder: 'Who you are writing to and why, language, connection request or InMail…' },
}

/** Step 3 of the application flow: pick one follow-up task at a time instead of facing every form at once. */
export function NextStepsPanel({ app, status, onStatusSaved, initialDrafts, step, onStep, onGoToResume, onLocatePdf }: {
  app: Application
  status: string
  onStatusSaved: (status: string) => void
  initialDrafts: OutreachDrafts
  step: NextStep | null
  onStep: (step: NextStep | null) => void
  onGoToResume: () => void
  onLocatePdf: (reveal: boolean) => void
}) {
  const [drafts, setDrafts] = useState(initialDrafts)
  const [savedDrafts, setSavedDrafts] = useState(initialDrafts)
  const base = `/api/applications/${encodeURIComponent(app.key)}`
  const pdf = app.folder?.docs.find((doc) => doc.key === 'pdf')

  if (!pdf) return <Card className="mx-auto max-w-xl">
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]"><Lock size={18} aria-hidden="true" /></span>
      <h2 className="text-base font-semibold">Finalize your resume first</h2>
      <p className="max-w-sm text-sm text-[var(--color-muted)]">Once your resume is finalized, you can track your application and draft a cover letter, email, or LinkedIn message from it.</p>
      <button type="button" onClick={onGoToResume} className={cn(primary, 'mt-2')}><ArrowLeft size={14} aria-hidden="true" /> Go to Resume & AI</button>
    </div>
  </Card>

  if (step) return <div className="mx-auto max-w-3xl space-y-4">
    <button type="button" onClick={() => onStep(null)} className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"><ArrowLeft size={14} aria-hidden="true" /> All next steps</button>
    {step === 'status'
      ? <StatusTask app={app} base={base} status={status} onStatusSaved={onStatusSaved} />
      : <MessageTask key={step} kind={step} base={base} draft={drafts[step] ?? ''} saved={savedDrafts[step] ?? ''} onDraft={(text) => setDrafts((current) => ({ ...current, [step]: text }))} onSaved={(text) => setSavedDrafts((current) => ({ ...current, [step]: text }))} />}
  </div>

  const applied = status === 'Applied'
  const cards: { id: NextStep; title: string; description: string; icon: ReactNode; meta: ReactNode; recommended?: boolean }[] = [
    {
      id: 'status',
      title: applied ? 'Update status & notes' : 'Mark as applied',
      description: applied ? 'Record replies, interviews, and when to follow up.' : 'Sent your application? Record it and add follow-up notes.',
      icon: applied ? <CircleCheck size={18} /> : <Send size={18} />,
      meta: app.row ? <Badge tone={statusTone(status)}>{status}</Badge> : <Badge>No tracker row</Badge>,
      recommended: !!app.row && !applied,
    },
    ...(['cover-letter', 'email', 'linkedin'] as const).map((kind) => ({
      id: kind,
      title: messages[kind].title,
      description: messages[kind].description,
      icon: messages[kind].icon,
      meta: (drafts[kind] ?? '') !== (savedDrafts[kind] ?? '') ? <Badge tone="warn">Unsaved changes</Badge> : drafts[kind] ? <Badge tone="ok">Draft saved</Badge> : <span className="text-[11px] text-[var(--color-faint)]">Optional</span>,
    })),
  ]

  return <div className="space-y-5">
    <Card className="flex flex-wrap items-center gap-3 px-5 py-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-ok-soft)] text-[var(--color-ok)]"><CircleCheck size={18} aria-hidden="true" /></span>
      <div className="min-w-48 flex-1">
        <h2 className="text-sm font-semibold">Your resume is ready</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">{pdf.name} · attach it to your application, then pick what to do next.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`${base}/file/${encodeURIComponent(pdf.name)}`} target="_blank" rel="noreferrer" className={secondary}>Open PDF</a>
        <button type="button" onClick={() => onLocatePdf(true)} className={secondary}>Reveal in Finder</button>
        <button type="button" onClick={() => onLocatePdf(false)} className={secondary}>Copy path</button>
      </div>
    </Card>
    <div>
      <h2 className="text-base font-semibold">What would you like to do next?</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">Choose one. You can come back here for the others anytime.</p>
    </div>
    <ul className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => <li key={card.id}>
        <button
          type="button"
          onClick={() => onStep(card.id)}
          className={cn(
            'group flex h-full w-full flex-col gap-3 rounded-xl border bg-[var(--color-surface)] p-5 text-left transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]',
            card.recommended ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]',
          )}
        >
          <span className="flex w-full items-start justify-between gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]" aria-hidden="true">{card.icon}</span>
            {card.recommended ? <span className="text-[11px] font-medium text-[var(--color-accent)]">Suggested next</span> : null}
          </span>
          <span className="block">
            <span className="block text-sm font-semibold">{card.title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted)]">{card.description}</span>
          </span>
          <span className="mt-auto flex w-full items-center justify-between gap-2 pt-1">
            {card.meta}
            <ChevronRight size={16} className="text-[var(--color-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" aria-hidden="true" />
          </span>
        </button>
      </li>)}
    </ul>
    <p className="text-xs text-[var(--color-muted)]">All done? <Link href="/applications" className="text-[var(--color-accent)] hover:underline">Back to your applications</Link></p>
  </div>
}

async function request(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Could not save. Please try again.')
  return data
}

function TaskHeader({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]" aria-hidden="true">{icon}</span>
    <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-0.5 text-xs leading-relaxed text-[var(--color-muted)]">{hint}</p></div>
  </div>
}

function Feedback({ error, notice }: { error: string | null; notice: string }) {
  return <>
    {error ? <p role="alert" className="text-xs text-[var(--color-bad)]">{error}</p> : null}
    <p role="status" className="text-xs text-[var(--color-ok)]">{notice}</p>
  </>
}

function StatusTask({ app, base, status, onStatusSaved }: { app: Application; base: string; status: string; onStatusSaved: (status: string) => void }) {
  const [value, setValue] = useState(status === 'Applied' ? status : app.row ? 'Applied' : status)
  const [notes, setNotes] = useState(app.row?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  if (!app.row) return <Card>
    <TaskHeader icon={<Send size={18} />} title="Track this application" hint="This application has no tracker row, so there is no status to update." />
    <p className="px-5 py-4 text-sm text-[var(--color-muted)]">You can still draft a cover letter, email, or LinkedIn message from the other next steps.</p>
  </Card>

  return <Card>
    <TaskHeader icon={<Send size={18} />} title={status === 'Applied' ? 'Update status & notes' : 'Mark as applied'} hint="Choose Applied once you have sent the application. Notes are saved to your tracker." />
    <form className="space-y-4 p-5" onSubmit={async (event) => {
      event.preventDefault()
      setBusy(true); setError(null); setNotice('')
      try {
        await request(base, 'PATCH', { status: value, notes })
        onStatusSaved(value)
        setNotice(value === 'Applied' && status !== 'Applied' ? 'Marked as applied. Good luck!' : 'Status and notes saved.')
      } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
    }}>
      <fieldset className="space-y-2">
        <legend className="text-sm">Status</legend>
        <div className="flex flex-wrap gap-2">
          {STATUSES.filter((option) => option !== 'SKIP').map((option) => <label key={option} className={cn('cursor-pointer rounded-md border px-3 py-1.5 text-xs has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-accent)]', value === option ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]')}>
            <input type="radio" name="status" value={option} checked={value === option} disabled={busy} onChange={() => { setValue(option); setNotice('') }} className="sr-only" />{option}
          </label>)}
          {!STATUSES.includes(value as never) ? <span className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-xs">{value}</span> : null}
        </div>
      </fieldset>
      <label className="block space-y-2 text-sm"><span>Notes and follow-up reminders</span><textarea disabled={busy} className={input} rows={4} value={notes} onChange={(event) => { setNotes(event.target.value); setNotice('') }} placeholder="Where you applied, contact person, when to follow up…" /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className={primary}>{busy ? <><Spinner /> Saving…</> : value === 'Applied' && status !== 'Applied' ? 'Mark as applied' : 'Save status and notes'}</button>
        <Feedback error={error} notice={notice} />
      </div>
    </form>
  </Card>
}

function MessageTask({ kind, base, draft, saved, onDraft, onSaved }: { kind: OutreachKind; base: string; draft: string; saved: string; onDraft: (text: string) => void; onSaved: (text: string) => void }) {
  const meta = messages[kind]
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const dirty = draft !== saved

  async function perform(action: 'generate' | 'save', task: () => Promise<void>) {
    setBusy(action); setError(null); setNotice('')
    try { await task() } catch (reason) { setError((reason as Error).message) } finally { setBusy(null) }
  }

  async function save(text: string) {
    await request(`${base}/outreach`, 'PUT', { kind, text })
    onSaved(text)
  }

  return <Card>
    <TaskHeader icon={meta.icon} title={meta.title} hint="AI drafts use your finalized resume and the job posting. Nothing is sent. Review the wording before you use it." />
    <div className="space-y-5 p-5">
      <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <label className="block space-y-2 text-sm"><span className="font-medium">1. Tell the AI what matters <span className="font-normal text-[var(--color-faint)]">(optional)</span></span><textarea disabled={!!busy} rows={2} maxLength={8000} className={input} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder={meta.placeholder} /></label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!!busy} className={primary} onClick={() => {
            if (draft && dirty && !window.confirm('Replace your unsaved edits with a new draft?')) return
            void perform('generate', async () => {
              const data = await request(`${base}/outreach`, 'POST', { kind, instructions })
              onDraft(data.text); await save(data.text)
              setNotice('Draft ready and saved. Review and edit it below.')
            })
          }}>{busy === 'generate' ? <><Spinner /> Writing… this can take a minute</> : draft ? 'Regenerate draft' : 'Draft it with AI'}</button>
          {draft && busy !== 'generate' ? <span className="text-[11px] text-[var(--color-faint)]">Regenerating replaces the draft below.</span> : null}
        </div>
      </section>
      <label className="block space-y-2 text-sm">
        <span className="flex items-center gap-2 font-medium">2. Review and edit {dirty ? <Badge tone="warn">Unsaved changes</Badge> : draft ? <Badge tone="ok">Saved</Badge> : null}</span>
        <textarea disabled={!!busy} rows={14} maxLength={30000} className={`${input} leading-relaxed`} value={draft} onChange={(event) => { onDraft(event.target.value); setNotice('') }} placeholder="Generate a draft above, or write your own here." />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!!busy || !dirty} className={secondary} onClick={() => void perform('save', async () => { await save(draft); setNotice('Draft saved.') })}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
        <button type="button" disabled={!!busy || !draft} className={secondary} onClick={() => void perform('save', async () => { await navigator.clipboard.writeText(draft); setNotice('Copied to clipboard.') })}>Copy to clipboard</button>
        <Feedback error={error} notice={notice} />
      </div>
    </div>
  </Card>
}
