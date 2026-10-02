'use client'

import { useEffect, useRef, useState } from 'react'
import { Square } from 'lucide-react'
import type { Application } from '@/lib/applications'
import { LETTER_WORD_TARGET, letterMatchesFinalized, wordCount, type CoverLetter, type LetterTurn } from '@/lib/coverLetter'
import type { Failure } from '@/lib/validate'
import { ErrorNotice } from '@/components/ErrorNotice'
import { FinalizeStatus, type FinalizedState } from '@/components/FinalizeStatus'
import { LearnFromChat } from '@/components/LearnFromChat'
import { PdfPreview } from '@/components/PdfPreview'
import { Badge, Card, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

type SaveState = 'saved' | 'saving' | 'error'
type Pane = 'ai' | 'letter'

const field = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)] disabled:opacity-60'
const outline = 'rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]'
const QUICK_PROMPTS = ['Draft my cover letter for this role.', 'Make it shorter and more direct.', 'Write it in French.']

function chatKey(appKey: string) {
  return `career-ops-cover-letter-chat:${appKey}`
}

function readTurns(appKey: string): LetterTurn[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(chatKey(appKey)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((turn) => (turn?.role === 'user' || turn?.role === 'assistant') && typeof turn.content === 'string') : []
  } catch {
    return []
  }
}

function storeTurns(appKey: string, turns: LetterTurn[]) {
  try { window.localStorage.setItem(chatKey(appKey), JSON.stringify(turns.slice(-100))) } catch { /* the chat stays in memory */ }
}

/**
 * The cover letter workspace, laid out like Resume & AI: an AI companion and a
 * direct editor on the left, the letter rendered with templates/cover-letter.typ
 * on the right, and a finalize step that writes the PDF next to the resume.
 */
export function CoverLetterTask({ app, initialLetter, savedLetter, finalizedAtLoad, onLetterSaved }: {
  app: Application
  initialLetter: CoverLetter
  /** The letter actually stored, or null when there is none yet. Every save is checked against it. */
  savedLetter: CoverLetter | null
  finalizedAtLoad: FinalizedState['letter']
  onLetterSaved: (letter: CoverLetter) => void
}) {
  const base = `/api/applications/${encodeURIComponent(app.key)}/cover-letter`
  const [letter, setLetter] = useState(initialLetter)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const savedJson = useRef(JSON.stringify(initialLetter))
  const baseLetter = useRef(savedLetter)
  const [conflict, setConflict] = useState(false)
  // Saves run one at a time, so each one carries the base the previous save left.
  const saveChain = useRef<Promise<void>>(Promise.resolve())
  const [pane, setPane] = useState<Pane>(initialLetter.content.trim() ? 'letter' : 'ai')
  const [preview, setPreview] = useState<{ token: string | null; pages: number | null; failures: Failure[] }>({ token: null, pages: null, failures: [] })
  const [rendering, setRendering] = useState(false)
  const [turns, setTurns] = useState<LetterTurn[]>([])
  const [message, setMessage] = useState('')
  const [thinking, setThinking] = useState(false)
  const [undo, setUndo] = useState<CoverLetter | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [letterFinalized, setLetterFinalized] = useState(finalizedAtLoad)
  const [finalizedPdf, setFinalizedPdf] = useState<string | null>(app.folder?.docs.find((doc) => doc.key === 'letterPdf' && doc.name.endsWith('.pdf'))?.name ?? null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [retry, setRetry] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const words = wordCount(letter.content)
  const busy = thinking || finalizing

  useEffect(() => { setTurns(readTurns(app.key)) }, [app.key])
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, thinking])

  // Autosave, as the resume draft does, once typing pauses.
  useEffect(() => {
    const json = JSON.stringify(letter)
    if (json === savedJson.current || conflict) return
    setSaveState('saving')
    const timer = window.setTimeout(() => { saveChain.current = saveChain.current.then(async () => {
      try {
        const response = await fetch(base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ letter, base: baseLetter.current }) })
        const data = await response.json()
        if (response.status === 409) setConflict(true)
        if (!response.ok) throw new Error(data.error ?? 'autosave failed')
        savedJson.current = json
        baseLetter.current = letter
        onLetterSaved(letter)
        setSaveState('saved')
      } catch (reason) {
        setSaveState('error')
        setError((reason as Error).message)
      }
    }) }, 650)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, letter, conflict])

  // Live preview through the real template. A newer edit aborts the older render.
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setRendering(true)
      try {
        const response = await fetch(`${base}/preview`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ letter }), signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'preview failed')
        setPreview({ token: data.token, pages: data.pages, failures: data.failures ?? [] })
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError') setPreview((current) => ({ ...current, failures: [{ kind: 'render', where: 'preview', why: (reason as Error).message }] }))
      } finally {
        if (!controller.signal.aborted) setRendering(false)
      }
    }, 500)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [base, letter])

  function edit(patch: Partial<CoverLetter>) {
    setLetter((current) => ({ ...current, ...patch }))
    setNotice('')
  }

  async function send(text = message) {
    const request = text.trim()
    if (!request || busy) return
    const history = [...turns, { role: 'user' as const, content: request }]
    setTurns(history); storeTurns(app.key, history)
    setMessage(''); setThinking(true); setError(null); setRetry(null); setNotice(''); setUndo(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ letter, message: request, conversation: turns.slice(-40) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'the AI companion failed')
      const next = [...history, { role: 'assistant' as const, content: data.reply || 'Updated the letter.' }]
      setTurns(next); storeTurns(app.key, next)
      setUndo(letter)
      setLetter(data.letter)
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') { setError((reason as Error).message); setRetry(request) }
      setTurns(turns); storeTurns(app.key, turns)
      setMessage(request)
    } finally {
      setThinking(false)
      abortRef.current = null
    }
  }

  async function finalize() {
    setFinalizing(true); setError(null); setNotice('')
    try {
      await saveChain.current
      const response = await fetch(`${base}/finalize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ letter, base: baseLetter.current }) })
      const data = await response.json()
      if (response.status === 409) setConflict(true)
      if (!response.ok) throw new Error(data.error ?? 'finalize failed')
      savedJson.current = JSON.stringify(letter)
      baseLetter.current = letter
      onLetterSaved(letter)
      setSaveState('saved')
      setFinalizedPdf(data.finalized.pdfName)
      setLetterFinalized({ at: new Date().toISOString(), letter })
      setNotice(`Saved ${data.finalized.pdfName} next to your resume.`)
    } catch (reason) { setError((reason as Error).message) } finally { setFinalizing(false) }
  }

  async function locate(reveal: boolean) {
    setError(null)
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/reveal`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: 'letterPdf', reveal }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not locate the cover letter')
      if (!reveal && data.path) await navigator.clipboard.writeText(data.path)
      setNotice(reveal ? 'Opened the folder.' : 'Copied the path.')
    } catch (reason) { setError((reason as Error).message) }
  }

  const blocking = preview.failures.length > 0 || (preview.pages !== null && preview.pages !== 1)
  const wordTone = words === 0 ? 'neutral' : words > LETTER_WORD_TARGET.max + 50 ? 'warn' : 'ok'

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <FinalizeStatus saveState={saveState} pendingReview={!!undo} finalized={letterFinalized} upToDate={letterMatchesFinalized(letter, letterFinalized?.letter ?? null)} />
      {rendering ? <span className="flex items-center gap-1 text-xs text-[var(--color-faint)]"><Spinner /> Rendering…</span> : preview.pages ? <Badge tone={blocking ? 'warn' : 'ok'}>{preview.pages} page</Badge> : null}
      <Badge tone={wordTone}>{words} words · aim {LETTER_WORD_TARGET.min}–{LETTER_WORD_TARGET.max}</Badge>
      {notice ? <span role="status" className="text-xs text-[var(--color-accent)]">{notice}</span> : null}
      <div className="ml-auto flex items-center gap-2">
        {finalizedPdf ? <>
          <a href={`/api/applications/${encodeURIComponent(app.key)}/file/${encodeURIComponent(finalizedPdf)}`} target="_blank" rel="noreferrer" className={outline}>Open PDF</a>
          <button type="button" onClick={() => void locate(true)} className={outline}>Reveal in Finder</button>
          <button type="button" onClick={() => void locate(false)} className={outline}>Copy path</button>
        </> : null}
        <button type="button" disabled={busy || conflict || blocking || saveState === 'saving' || !letter.content.trim()} onClick={() => void finalize()} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] disabled:opacity-40">
          {finalizing ? 'Finalizing…' : finalizedPdf ? 'Finalize again' : 'Finalize cover letter'}
        </button>
      </div>
    </div>
    {conflict ? <Card className="flex flex-wrap items-center gap-3 border-[var(--color-bad-soft)] px-4 py-3">
      <p role="alert" className="flex-1 text-xs text-[var(--color-bad)]">This cover letter was changed somewhere else, in another tab or by Claude. Your edits here are not saved. Reload to continue from the latest version.</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)]">Reload</button>
    </Card> : error ? <ErrorNotice error={error} className="rounded-md" onRetry={retry && !busy ? () => void send(retry) : undefined} onDismiss={() => { setError(null); setRetry(null) }} /> : null}
    {preview.failures.length ? <Card className="border-[var(--color-bad-soft)]"><ul className="list-disc px-8 py-2 text-xs text-[var(--color-bad)]">{preview.failures.map((failure, index) => <li key={index}>{failure.why}</li>)}</ul></Card> : null}

    <div className="grid min-h-[70vh] items-start gap-5 lg:grid-cols-2">
      <Card className="flex h-[680px] min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5" role="tablist" aria-label="Cover letter workspace mode">
          {([['ai', 'A.I Companion'], ['letter', 'Letter']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={pane === value} onClick={() => setPane(value)} className={cn('rounded-md px-3 py-1.5 text-xs transition-colors', pane === value ? 'bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]')}>{label}</button>)}
          <span className="ml-auto pr-1 text-[10px] text-[var(--color-faint)]">{pane === 'ai' ? 'Draft and revise with AI' : 'Edit the letter directly'}</span>
        </div>

        {pane === 'ai' ? <div className="flex min-h-0 flex-1 flex-col">
          {turns.length >= 2 ? <LearnFromChat skillId="write-cover-letter" turns={turns} disabled={busy} /> : null}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {turns.length ? turns.map((turn, index) => <div key={index} className={turn.role === 'user'
              ? 'ml-auto max-w-[88%] rounded-xl rounded-br-sm bg-[var(--color-accent-soft)] px-3 py-2 text-sm leading-relaxed'
              : 'max-w-[94%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm leading-relaxed'}>
              <p className="whitespace-pre-wrap">{turn.content}</p>
            </div>) : <div className="space-y-3 py-6 text-center">
              <p className="text-sm font-medium">Start from your finalized resume and the posting</p>
              <p className="mx-auto max-w-sm text-xs leading-relaxed text-[var(--color-muted)]">The AI writes in your plain, direct style, keeps to facts on your resume, and never names clients. Every change shows in the preview and can be undone.</p>
            </div>}
            {thinking ? <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]"><Spinner /> Writing… this can take a minute</div> : null}
            <div ref={endRef} />
          </div>
          {undo && !thinking ? <div className="flex items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-xs">
            <span className="text-[var(--color-muted)]">The letter was updated. Check the preview.</span>
            <button type="button" onClick={() => setUndo(null)} className="ml-auto rounded-md bg-[var(--color-ok)] px-2.5 py-1 text-[11px] font-medium text-white">Keep</button>
            <button type="button" onClick={() => { setLetter(undo); setUndo(null) }} className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] hover:bg-[var(--color-surface-2)]">Undo</button>
          </div> : null}
          <div className="shrink-0 border-t border-[var(--color-border)] px-4 py-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(letter.content.trim() ? QUICK_PROMPTS.slice(1) : QUICK_PROMPTS.slice(0, 1)).map((prompt) => <button key={prompt} type="button" disabled={busy} onClick={() => void send(prompt)} className="rounded-md bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent)] hover:opacity-80 disabled:opacity-40">{prompt}</button>)}
            </div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void send()
                }
              }}
              placeholder={letter.content.trim() ? 'Ask for a change: stress a project, cut a paragraph, address visa…' : 'Language, points to stress, the recipient if you know them…'}
              aria-label="Message the cover letter companion"
              disabled={busy}
              maxLength={8000}
              rows={3}
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)] disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-[var(--color-faint)]">Uses your finalized resume and the job posting. Nothing is sent.</span>
              <button
                type="button"
                onClick={() => thinking ? abortRef.current?.abort() : void send()}
                disabled={finalizing || (!thinking && !message.trim())}
                className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40', thinking ? 'border border-[var(--color-bad)] text-[var(--color-bad)]' : 'bg-[var(--color-accent)] text-[var(--color-bg)]')}
              >
                {thinking ? <Square size={12} aria-hidden="true" /> : null}
                {thinking ? 'Stop' : 'Send'}
              </button>
            </div>
          </div>
        </div> : <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <LetterField label="Recipient name" value={letter.recipientName} disabled={busy} placeholder="Leave empty if unknown" onChange={(recipientName) => edit({ recipientName })} />
            <LetterField label="Recipient title" value={letter.recipientTitle} disabled={busy} placeholder="e.g. Talent Acquisition" onChange={(recipientTitle) => edit({ recipientTitle })} />
            <LetterField label="Company" value={letter.companyName} disabled={busy} onChange={(companyName) => edit({ companyName })} />
            <LetterField label="Company address" value={letter.companyAddress} disabled={busy} placeholder="Optional" onChange={(companyAddress) => edit({ companyAddress })} />
            <LetterField label="Greeting" value={letter.salutation} disabled={busy} placeholder={letter.recipientName ? `Dear ${letter.recipientName},` : 'Dear Hiring Manager,'} onChange={(salutation) => edit({ salutation })} />
            <LetterField label="Closing" value={letter.closing} disabled={busy} placeholder="Sincerely," onChange={(closing) => edit({ closing })} />
            <LetterField label="Date" value={letter.date} disabled={busy} onChange={(date) => edit({ date })} />
            <label className="block space-y-1 text-xs text-[var(--color-muted)]"><span>Paper</span>
              <select value={letter.paper} disabled={busy} onChange={(event) => edit({ paper: event.target.value as CoverLetter['paper'] })} className={field}>
                <option value="a4">A4</option>
                <option value="us-letter">US Letter (US and Canada)</option>
              </select>
            </label>
          </div>
          <label className="flex min-h-[260px] flex-1 flex-col gap-1 text-xs text-[var(--color-muted)]">
            <span className="flex items-center justify-between"><span>Letter body</span><span className="text-[10px] text-[var(--color-faint)]">Separate paragraphs with a blank line</span></span>
            <textarea value={letter.content} disabled={busy} onChange={(event) => edit({ content: event.target.value })} placeholder="Write the letter here, or ask the A.I Companion for a first draft." className={cn(field, 'min-h-0 flex-1 resize-none leading-relaxed')} />
          </label>
        </div>}
      </Card>
      <Card className="h-[680px] overflow-hidden"><PdfPreview token={preview.token} document="cover letter" engine="Typst" source="letter" /></Card>
    </div>
  </div>
}

function LetterField({ label, value, placeholder, disabled, onChange }: { label: string; value: string; placeholder?: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <label className="block space-y-1 text-xs text-[var(--color-muted)]">
    <span>{label}</span>
    <input value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={field} />
  </label>
}
