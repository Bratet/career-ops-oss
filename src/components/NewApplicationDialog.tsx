'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { FeatureEnginePicker } from '@/components/FeatureEnginePicker'
import { GeneralApplicationForm } from './GeneralApplicationForm'
import { Spinner } from '@/components/ui/primitives'
import { readNdjson } from '@/lib/ndjson'
import type { SkillSummary } from '@/lib/skills/types'
import type { JdAnalysis } from '@/lib/tailoring/jd'

type Phase = 'idle' | 'analyzing' | 'creating'

interface DialogContextValue {
  openNewApplication: () => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function NewApplicationProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <DialogContext.Provider value={{ openNewApplication: () => setOpen(true) }}>
      {children}
      <NewApplicationDialog open={open} onClose={() => setOpen(false)} />
    </DialogContext.Provider>
  )
}

export function useNewApplication() {
  const value = useContext(DialogContext)
  if (!value) throw new Error('useNewApplication must be used inside NewApplicationProvider')
  return value
}

function NewApplicationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [jd, setJd] = useState('')
  const [noJd, setNoJd] = useState(false)
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [skillId, setSkillId] = useState('analyze-job')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const busy = phase !== 'idle'

  useEffect(() => {
    fetch('/api/skills', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        const compatible = (data.skills as SkillSummary[]).filter((skill) => skill.runner === 'job-analysis')
        setSkills(compatible)
        if (compatible.length && !compatible.some((skill) => skill.id === skillId)) setSkillId(compatible[0].id)
      })
      .catch(() => setSkills([]))
  }, [])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, busy, onClose])

  function close() {
    if (!busy) onClose()
  }

  async function createApplication() {
    if (jd.trim().length < 40 || busy) return
    setPhase('analyzing')
    setProgress([])
    setCreatedKey(null)
    setError(null)
    let analysis: JdAnalysis | null = null
    let runId: string | null = null
    let streamError: string | null = null

    try {
      const analysisResponse = await fetch('/api/jd', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jd, skillId }),
      })
      if (!analysisResponse.ok) {
        const data = await analysisResponse.json() as { error?: string }
        throw new Error(data.error ?? 'analysis failed')
      }

      await readNdjson(analysisResponse, (event) => {
        if (event.type === 'start') {
          setProgress((current) => [...current, `${event.engine} started ${event.skillId} v${event.skillVersion}`])
          if (typeof event.runId === 'string') runId = event.runId
        }
        if (event.type === 'progress' && typeof event.message === 'string') {
          setProgress((current) => [...current, event.message as string])
        }
        if (event.type === 'error') streamError = String(event.message ?? 'analysis failed')
        if (event.type === 'done') analysis = event.analysis as JdAnalysis
      })

      if (streamError) throw new Error(streamError)
      const completedAnalysis = analysis as JdAnalysis | null
      if (!completedAnalysis) throw new Error('analysis ended without a result')

      setPhase('creating')
      setProgress((current) => [...current, 'Creating the application workspace…'])
      const createResponse = await fetch('/api/applications/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analysis: completedAnalysis, jd, url, runId }),
      })
      const created = await createResponse.json() as { key?: string; error?: string }
      if (!createResponse.ok || !created.key) throw new Error(created.error ?? 'create failed')

      setCreatedKey(created.key)

      setCreatedKey(null)
      setJd('')
      setUrl('')
      setProgress([])
      setPhase('idle')
      onClose()
      router.push(`/applications/${created.key}?tab=overview`)
    } catch (reason) {
      setError((reason as Error).message)
      setPhase('idle')
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-application-title"
        className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 id="new-application-title" className="text-base font-semibold">New application</h2>
            <p className="mt-0.5 text-xs text-[var(--color-faint)]">
              {noJd ? 'Add the company details and start from your general resume.' : 'Analyze the posting, then discuss eligibility and gaps with the AI. Tailor your resume when you’re ready.'}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close new application dialog"
            className="grid size-7 shrink-0 place-items-center rounded-md text-lg leading-none text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-30"
          >
            ×
          </button>
        </div>

        <div className="flex gap-2 px-5 pt-3">
          <button type="button" disabled={busy} aria-pressed={!noJd} onClick={() => setNoJd(false)} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs aria-pressed:bg-[var(--color-surface-2)]">I have a job description</button>
          <button type="button" disabled={busy} aria-pressed={noJd} onClick={() => setNoJd(true)} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs aria-pressed:bg-[var(--color-surface-2)]">No job description</button>
        </div>
        {noJd ? <div className="overflow-y-auto"><GeneralApplicationForm onCreated={onClose} onBusy={(value) => setPhase(value ? 'creating' : 'idle')} /></div> : <form
          className="min-h-0 flex-1 overflow-y-auto"
          onSubmit={(event) => { event.preventDefault(); void createApplication() }}
        >
          <div className="space-y-3 p-5">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Source URL <span className="font-normal text-[var(--color-faint)]">(optional)</span></span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
                placeholder="https://…"
                className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[13px] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)] disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Job description</span>
              <textarea
                ref={textareaRef}
                value={jd}
                onChange={(event) => setJd(event.target.value)}
                disabled={busy}
                placeholder="Paste the full job description here…"
                rows={14}
                className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-xs leading-relaxed outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)] disabled:opacity-60"
              />
            </label>

            {createdKey && error ? <Link href={`/applications/${createdKey}?tab=overview`} onClick={onClose} className="block text-sm text-[var(--color-accent)] underline">Open the analysis workspace</Link> : null}
            {error ? (
              <p className="rounded-md border border-[var(--color-bad-soft)] bg-[var(--color-bad-soft)] px-3 py-2 text-xs text-[var(--color-bad)]">{error}</p>
            ) : null}

            {progress.length ? (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                {progress.slice(-4).map((message, index) => (
                  <p key={`${index}-${message}`} className="flex items-center gap-2 text-[11px] leading-relaxed text-[var(--color-muted)]">
                    {index === progress.slice(-4).length - 1 && busy ? <Spinner /> : <span className="text-[var(--color-ok)]">✓</span>}
                    <span>{message}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
            <FeatureEnginePicker feature="job-analysis" disabled={busy} compact />
            <select
              value={skillId}
              onChange={(event) => setSkillId(event.target.value)}
              disabled={busy}
              aria-label="Job analysis skill"
              className="h-8 max-w-52 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs text-[var(--color-muted)] outline-none focus:border-[var(--color-accent)] disabled:opacity-40"
            >
              {skills.length ? skills.map((skill) => (
                <option key={skill.id} value={skill.id}>{skill.name} · v{skill.version}</option>
              )) : <option value="analyze-job">Analyze job posting</option>}
            </select>
            <Link href={`/skills/${skillId}`} onClick={close} className="text-xs text-[var(--color-accent)] hover:underline">Edit skill</Link>
            <span className="ml-auto text-[10px] text-[var(--color-faint)] tnum">{jd.length.toLocaleString()} chars</span>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || jd.trim().length < 40}
              className="flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Spinner className="border-t-[var(--color-bg)]" /> : null}
              {phase === 'analyzing' ? 'Analyzing…' : phase === 'creating' ? 'Creating…' : 'Analyze job'}
            </button>
          </div>
        </form>}
      </section>
    </div>
  )
}
