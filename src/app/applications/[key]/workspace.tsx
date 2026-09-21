'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import type { Application } from '@/lib/applications'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import type { ApplicationWorkspace, WorkspaceProposal } from '@/lib/workspaces'
import type { Op } from '@/lib/tailoring/ops'
import type { RequirementAction } from '@/lib/tailoring/rules'
import { EditorChat } from '@/components/EditorChat'
import type { EditorApi } from '@/components/EditorPane'
import { Badge, Card, CardHeader, Empty, Spinner, statusTone } from '@/components/ui/primitives'
import { YamlEditor } from '@/components/YamlEditor'
import { PdfPreview } from '@/components/PdfPreview'
import { readNdjson } from '@/lib/ndjson'
import { STATUSES } from '@/lib/statuses'
import { findPathOffset } from '@/lib/yamlPath'
import { cn } from '@/lib/utils'
import { applicationChatScope, editorChatStorageKey, parseEditorChatSnapshot, type ChatSkillEvent } from '@/lib/chatPersistence'

import type { EligibilityIssue } from '@/lib/eligibility'
import { Overview } from './overview'

type Tab = 'overview' | 'resume'
type SaveState = 'saved' | 'saving' | 'error'

/** Background jobs (fit analysis, a concurrent tailoring run) bump the workspace revision on the server before this tab's own request resolves. */
function isRevisionConflict(message: string): boolean {
  return message.startsWith('workspace changed: expected revision')
}

export function ApplicationWorkspaceView({ app, initialWorkspace, analysis, eligibility }: {
  app: Application
  eligibility: EligibilityIssue[]
  initialWorkspace: ApplicationWorkspace
  analysis: JdAnalysis | null
}) {
  const router = useRouter()
  const requested = useSearchParams().get('tab')
  const [tab, setTab] = useState<Tab>(requested === 'resume' ? 'resume' : 'overview')
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [draft, setDraft] = useState(initialWorkspace.draftYaml)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [preview, setPreview] = useState<{ token: string | null; pages: number | null; fill: number | null; failures: { why: string }[] }>({ token: null, pages: null, fill: null, failures: [] })
  const [rendering, setRendering] = useState(false)
  const [tailoring, setTailoring] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editorReviewPending, setEditorReviewPending] = useState(false)
  const [editorPaneTab, setEditorPaneTab] = useState<'ai' | 'yaml'>('ai')
  const [status, setStatus] = useState(app.row?.status ?? '')
  const [located, setLocated] = useState<string | null>(null)
  const savedDraft = useRef(initialWorkspace.draftYaml)
  const revision = useRef(initialWorkspace.revision)
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const editorCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => { revision.current = workspace.revision }, [workspace.revision])

  /** Refetch the workspace to pick up a revision this tab did not know had already moved on. */
  async function refreshWorkspaceRevision(): Promise<ApplicationWorkspace> {
    const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok || !data.workspace) throw new Error(data.error ?? 'could not refresh the application workspace')
    setWorkspace(data.workspace)
    revision.current = data.workspace.revision
    return data.workspace as ApplicationWorkspace
  }

  /** Retry once against the latest revision instead of surfacing a raw conflict to the user. */
  async function withRevisionRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (!isRevisionConflict((error as Error).message)) throw error
      await refreshWorkspaceRevision()
      return await operation()
    }
  }

  useEffect(() => {
    if (draft === savedDraft.current || editorReviewPending || tailoring || workspace.pendingProposal) return
    setSaveState('saving')
    const timer = window.setTimeout(async () => {
      try {
        const saved = await withRevisionRetry(async () => {
          const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, {
            method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ revision: revision.current, draftYaml: draft }),
          })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error ?? 'autosave failed')
          return data.workspace as ApplicationWorkspace
        })
        savedDraft.current = draft
        revision.current = saved.revision
        setWorkspace(saved)
        setSaveState('saved')
      } catch (reason) {
        setSaveState('error')
        setError((reason as Error).message)
      }
    }, 650)
    return () => window.clearTimeout(timer)
  }, [app.key, draft, editorReviewPending, tailoring, workspace.pendingProposal])

  useEffect(() => {
    if (tab !== 'resume' || !draft.trim()) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setRendering(true)
      try {
        const response = await fetch('/api/render', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ yaml: draft, mode: workspace.general ? 'general' : 'tailored' }),
        })
        const data = await response.json()
        setPreview({ token: data.token, pages: data.pages, fill: data.fill, failures: data.failures ?? [] })
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError') setError((reason as Error).message)
      } finally { setRendering(false) }
    }, 700)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [draft, tab])

  useEffect(() => {
    if (workspace.fit.status !== 'queued' || !analysis) return
    let active = true
    void fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/fit`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }).then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'fit analysis failed')
      if (active) { setWorkspace(data.workspace); revision.current = data.workspace.revision }
    }).catch(async (reason) => {
      if (!active) return
      // A concurrent background request may already have claimed the job.
      // Refresh once so the local queued state cannot create a retry loop.
      try {
        const data = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' }).then((response) => response.json())
        if (data.workspace) { setWorkspace(data.workspace); revision.current = data.workspace.revision; return }
      } catch {}
      setError((reason as Error).message)
    })
    return () => { active = false }
  }, [analysis, app.key, workspace.fit.status])

  useEffect(() => {
    if (workspace.fit.status !== 'running') return
    let active = true
    const poll = window.setInterval(() => {
      void fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' })
        .then((response) => response.json())
        .then((data) => {
          if (!active || !data.workspace) return
          setWorkspace(data.workspace)
          revision.current = data.workspace.revision
        })
        .catch(() => {})
    }, 2000)
    return () => { active = false; window.clearInterval(poll) }
  }, [app.key, workspace.fit.status])

  async function patchStatus(next: string) {
    setBusy(true); setError(null)
    try {
      if (next === 'Applied') {
        const warnings = [!app.folder?.has.pdf && 'no finalized PDF', preview.failures.length > 0 && 'the current draft is invalid', (editorReviewPending || !!workspace.pendingProposal) && 'an AI resume edit is still pending'].filter(Boolean)
        if (warnings.length && !window.confirm(`Mark as Applied anyway?\n\nWarnings: ${warnings.join(', ')}.`)) return
      }
      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'status update failed')
      setStatus(next)
      if (next === 'Applied') {
        const refreshed = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' }).then((row) => row.json())
        if (refreshed.workspace) { setWorkspace(refreshed.workspace); revision.current = refreshed.workspace.revision }
      }
      router.refresh()
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function tailor(handlers: {
    onEvent: (event: ChatSkillEvent) => void
    conversation?: { role: 'user' | 'assistant'; content: string }[]
    signal?: AbortSignal
  }, surface: Tab = 'resume'): Promise<{ answer: string; engine?: string; skillId: string; runId?: string }> {
    if (tailoring || editorReviewPending) throw new Error('Finish the current resume changes before tailoring again.')
    if (workspace.pendingProposal) throw new Error('Accept or reject the current proposal before tailoring again.')
    if (saveState !== 'saved') throw new Error('Wait for the current resume draft to finish saving first.')
    setTab('resume'); setEditorPaneTab('ai')
    setTailoring(true); setError(null); handlers.onEvent({ kind: 'start', text: 'Invoking the Tailor CV skill.' })
    const beforeYaml = draft
    let conversation = handlers.conversation
    if (surface === 'resume') {
      try {
        const overview = parseEditorChatSnapshot(window.localStorage.getItem(editorChatStorageKey(applicationChatScope(app.key, 'overview'))))
        conversation = [...(overview?.turns ?? []).map(({ role, content }) => ({ role, content })), ...(conversation ?? [])].slice(-100)
      } catch { /* Tailoring can still use the current request if storage is unavailable. */ }
    }
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/tailor`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skillId: 'tailor-cv', conversation }), signal: handlers.signal,
      })
      if (!response.ok) throw new Error((await response.json()).error ?? 'tailoring failed')
      let engine: string | undefined
      let runId: string | undefined
      let result: { baseYaml: string; yaml: string; ops: Op[]; requirementActions: RequirementAction[]; pages: number; fill: number; iterations: number; runId: string } | null = null
      let streamError: string | null = null
      await readNdjson(response, (event) => {
        if (event.type === 'start') {
          if (typeof event.engine === 'string') engine = event.engine
          if (typeof event.runId === 'string') runId = event.runId
          handlers.onEvent({ kind: 'start', text: `${String(event.engine ?? 'AI')} started ${String(event.skillId ?? 'tailor-cv')} v${String(event.skillVersion ?? '')}.` })
        }
        if (event.type === 'progress' && typeof event.message === 'string') handlers.onEvent({ kind: 'activity', text: event.message })
        if (event.type === 'reasoning' && typeof event.message === 'string') handlers.onEvent({ kind: 'reasoning', text: event.message })
        if (event.type === 'candidate' && typeof event.yaml === 'string') {
          setDraft(event.yaml)
          handlers.onEvent({
            kind: 'preview',
            text: `Iteration ${String(event.attempt ?? '?')} preview: ${String(event.pages ?? '?')} page, ${String(event.fill ?? '?')}% fill, ${Array.isArray(event.ops) ? event.ops.length : 0} validated changes.`,
          })
        }
        if (event.type === 'change' && event.op && typeof event.op === 'object') {
          const op = event.op as Op
          handlers.onEvent({ kind: 'change', text: tailoringOperationEvent(op) })
        }
        if (event.type === 'error') {
          streamError = String(event.message ?? 'tailoring failed')
          setError(streamError)
        }
        if (event.type === 'done') {
          result = event as unknown as typeof result
          handlers.onEvent({
            kind: 'result',
            text: `Verified ${String(event.pages ?? '?')} page at ${String(event.fill ?? '?')}% fill after ${String(event.iterations ?? '?')} measured iterations.`,
          })
        }
      })
      const completed = result as { baseYaml: string; yaml: string; ops: Op[]; requirementActions: RequirementAction[]; pages: number; fill: number; iterations: number; runId: string } | null
      if (!completed) throw new Error(streamError ?? 'tailoring ended without a reviewable proposal')
      const saved = await withRevisionRetry(async () => {
        const response2 = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/proposal`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision: revision.current, kind: 'tailoring', beforeYaml, operationBaseYaml: completed.baseYaml, currentYaml: completed.yaml, ops: completed.ops, requirementActions: completed.requirementActions, pages: completed.pages, fill: completed.fill, runId: completed.runId }),
        })
        const data = await response2.json()
        if (!response2.ok) throw new Error(data.error ?? 'could not save proposal')
        return data.workspace as ApplicationWorkspace
      })
      savedDraft.current = saved.draftYaml
      setDraft(saved.draftYaml); setWorkspace(saved); revision.current = saved.revision; setSaveState('saved')
      return {
        answer: `I tailored the resume with the Tailor CV skill in ${completed.iterations} measured iteration${completed.iterations === 1 ? '' : 's'}. I’m previewing ${completed.ops.length} suggested change${completed.ops.length === 1 ? '' : 's'} at ${completed.pages} page and ${completed.fill}% fill. Review each change below, then accept or reject the proposal.`,
        engine,
        skillId: 'tailor-cv',
        runId: completed.runId ?? runId,
      }
    } catch (reason) {
      setDraft(savedDraft.current)
      const aborted = (reason as Error).name === 'AbortError'
      setError(aborted ? null : (reason as Error).message)
      throw reason
    } finally { setTailoring(false) }
  }

  async function toggleTailoringChange(index: number) {
    const proposal = workspace.pendingProposal
    if (!proposal?.operationBaseYaml || proposal.kind !== 'tailoring') return
    const choices = proposal.choices.map((choice, choiceIndex) => choiceIndex === index ? !choice : choice)
    setBusy(true); setError(null)
    try {
      const applyResponse = await fetch(`/api/applications/${encodeURIComponent(app.key)}/apply-ops`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yaml: proposal.operationBaseYaml, ops: proposal.ops.filter((_, opIndex) => choices[opIndex] !== false) }),
      })
      const applied = await applyResponse.json()
      if (!applyResponse.ok) throw new Error(applied.error ?? 'could not update the tailoring proposal')
      const saved = await withRevisionRetry(async () => {
        const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/proposal`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision: revision.current, action: 'update', yaml: applied.yaml, choices }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'could not save the tailoring choices')
        return data.workspace as ApplicationWorkspace
      })
      savedDraft.current = saved.draftYaml
      setDraft(saved.draftYaml); setWorkspace(saved); revision.current = saved.revision
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function resolveProposal(action: 'accept' | 'reject') {
    setBusy(true); setError(null)
    try {
      const saved = await withRevisionRetry(async () => {
        const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/proposal`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: revision.current, action, yaml: draft }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? `${action} failed`)
        return data.workspace as ApplicationWorkspace
      })
      savedDraft.current = saved.draftYaml
      setDraft(saved.draftYaml); setWorkspace(saved); revision.current = saved.revision
      router.refresh()
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function finalize() {
    if (saveState !== 'saved' || editorReviewPending) return
    setBusy(true); setError(null)
    try {
      const result = await withRevisionRetry(async () => {
        const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/finalize`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: revision.current }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'finalize failed')
        return data.workspace as ApplicationWorkspace
      })
      setWorkspace(result); revision.current = result.revision
      router.refresh()
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function locatePdf(reveal: boolean) {
    setError(null)
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/reveal`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: 'pdf', reveal }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not locate the finalized PDF')
      if (!reveal) await navigator.clipboard.writeText(data.path)
      setLocated(reveal ? (data.revealed ? 'Revealed in Finder' : data.path) : 'Path copied')
      window.setTimeout(() => setLocated(null), 2500)
    } catch (reason) { setError((reason as Error).message) }
  }

  async function saveEditorDraft(yaml = draft) {
    setSaveState('saving')
    setError(null)
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: revision.current, draftYaml: yaml }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'save failed')
      savedDraft.current = yaml
      revision.current = data.workspace.revision
      setDraft(yaml)
      setWorkspace(data.workspace)
      setSaveState('saved')
    } catch (reason) {
      setSaveState('error')
      setError((reason as Error).message)
      throw reason
    }
  }

  function jumpTo(path: string) {
    const view = editorRef.current?.view
    if (!view) return
    const offset = findPathOffset(draft, path)
    if (offset === null) return
    view.dispatch({ selection: { anchor: offset }, scrollIntoView: true })
    view.focus()
  }

  const reviewPending = editorReviewPending || tailoring || !!workspace.pendingProposal
  const editorApi: EditorApi = {
    text: draft,
    setText: setDraft,
    jumpTo,
    save: saveEditorDraft,
    markSaved: () => { savedDraft.current = draft; setSaveState('saved') },
    setReviewPending: setEditorReviewPending,
    reviewPending,
    showEditor: () => {
      setEditorPaneTab('yaml')
      editorCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.requestAnimationFrame(() => editorRef.current?.view?.focus())
    },
    pages: preview.pages,
    fill: preview.fill,
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><Link href="/applications" className="text-xs text-[var(--color-faint)] hover:text-[var(--color-accent)]">← Applications</Link><h1 className="mt-1 truncate text-lg font-semibold">{app.row?.company ?? app.folder?.slug ?? 'Application'}</h1><p className="truncate text-xs text-[var(--color-muted)]">{app.row?.role ?? 'No tracker row linked'}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {app.row ? <Badge tone={statusTone(status)}>{status}</Badge> : null}
          {app.row && status !== 'Applied' ? <button disabled={busy} onClick={() => void patchStatus('Applied')} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-bg)] disabled:opacity-40">Mark as Applied</button> : null}
          {app.row ? <select value={status} disabled={busy} onChange={(event) => void patchStatus(event.target.value)} className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs">{STATUSES.map((value) => <option key={value}>{value}</option>)}{!STATUSES.includes(status as never) && status ? <option>{status}</option> : null}</select> : null}
          {app.folder ? <Link href={`/runs?applicationKey=${encodeURIComponent(app.key)}`} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">AI runs</Link> : null}
        </div>
      </header>
      {error ? <Card className="border-[var(--color-bad-soft)]"><p className="px-4 py-2 text-xs text-[var(--color-bad)]">{error}</p></Card> : null}
      <nav aria-label="Application workflow">
        <ol className="application-flow">
          {([
            ['overview', workspace.general ? 'Review context' : 'Analyze & discuss', workspace.general ? 'Review the application details with AI' : 'Compare the job with your profile and clarify issues'],
            ['resume', 'Resume & AI', workspace.general ? 'Edit, review, and finalize your resume' : 'Use your analysis to tailor and finalize your resume'],
          ] as const).map(([value, label, description], index) => (
            <li key={value}>
              <button type="button" onClick={() => setTab(value)} aria-current={tab === value ? 'step' : undefined} className="application-flow-step">
                <span className="application-flow-number" aria-hidden="true">{index + 1}</span>
                <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted)]">{description}</span></span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs leading-relaxed text-[var(--color-muted)]">
          {tab === 'overview'
            ? 'Work through the details with AI below. When you’re ready, continue to your resume. You can return here anytime.'
            : workspace.general ? 'Review changes with AI, then finalize your resume.' : 'Build on your fit analysis and clarifications. Return to analysis whenever you need to revise them.'}
        </p>
        <button type="button" onClick={() => setTab(tab === 'overview' ? 'resume' : 'overview')} className={cn('inline-flex min-h-10 items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]', tab === 'overview' ? 'bg-[var(--color-accent)] text-[var(--color-bg)] hover:opacity-90' : 'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]')}>
          {tab === 'resume' ? <ArrowLeft size={16} aria-hidden="true" /> : null}
          {tab === 'overview' ? 'Continue to Resume & AI' : workspace.general ? 'Back to context' : 'Back to analysis'}
          {tab === 'overview' ? <ArrowRight size={16} aria-hidden="true" /> : null}
        </button>
      </div>

      <div className="space-y-3">
        {tab === 'resume' ? <>
        <div className="flex flex-wrap items-center gap-2"><span className={`text-xs ${saveState === 'error' ? 'text-[var(--color-bad)]' : 'text-[var(--color-faint)]'}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Autosave error'}</span>{rendering ? <span className="flex items-center gap-1 text-xs text-[var(--color-faint)]"><Spinner /> Rendering…</span> : preview.pages ? <Badge tone={preview.pages === 1 && !preview.failures.length ? 'ok' : 'warn'}>{preview.pages} page · {preview.fill ?? '—'}% fill</Badge> : null}{reviewPending ? <Badge tone="warn">Review AI changes</Badge> : null}{located ? <span className="text-xs text-[var(--color-accent)]">{located}</span> : null}<div className="ml-auto flex items-center gap-2">{app.folder?.has.pdf ? <><a href={`/api/applications/${encodeURIComponent(app.key)}/file/${encodeURIComponent(app.folder.docs.find((doc) => doc.key === 'pdf')?.name ?? 'resume.pdf')}`} target="_blank" rel="noreferrer" className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Open PDF</a><button onClick={() => void locatePdf(true)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Reveal in Finder</button><button onClick={() => void locatePdf(false)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Copy path</button></> : null}<button disabled={busy || reviewPending || saveState !== 'saved'} onClick={() => void finalize()} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] disabled:opacity-40">Finalize resume</button></div></div>
        {preview.failures.length ? <Card className="border-[var(--color-bad-soft)]"><ul className="list-disc px-8 py-2 text-xs text-[var(--color-bad)]">{preview.failures.map((failure, index) => <li key={index}>{failure.why}</li>)}</ul></Card> : null}
        </> : null}
        <div className="grid min-h-[70vh] items-start gap-5 lg:grid-cols-2">
          <div ref={editorCardRef} className={tab === 'overview' ? 'order-last lg:sticky lg:top-4' : ''}>
            <Card className="flex h-[680px] min-h-0 flex-col overflow-hidden">
              {tab === 'resume' ? <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5" role="tablist" aria-label="Resume workspace mode">
                {([['ai', 'A.I Companion'], ['yaml', 'YAML Editor']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={editorPaneTab === value} onClick={() => setEditorPaneTab(value)} className={cn('rounded-md px-3 py-1.5 text-xs transition-colors', editorPaneTab === value ? 'bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]')}>{label}</button>)}
                <span className="ml-auto pr-1 text-[10px] text-[var(--color-faint)]">{editorPaneTab === 'ai' ? 'Ask, tailor, and review changes' : 'Edit the current draft directly'}</span>
              </div>
              : <div className="border-b border-[var(--color-border)] p-4"><h2 className="text-sm font-semibold">{workspace.general ? 'Discuss your application' : 'Clarify before tailoring'}</h2><p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">Discuss eligibility, correct assumptions, or add context. Then continue to Resume & AI to work on your resume.</p></div>}
              <div className={cn('min-h-0 flex-1 flex-col', tab === 'overview' || editorPaneTab === 'ai' ? 'flex' : 'hidden')}>
                {(['overview', 'resume'] as const).map((surface) => <div key={surface} className={cn('min-h-0 flex-1 flex-col', tab === surface ? 'flex' : 'hidden')}>
                <EditorChat
                  onProfileUpdated={async () => {
                    const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' })
                    const data = await response.json()
                    if (response.ok && data.workspace) { setWorkspace(data.workspace); revision.current = data.workspace.revision }
                    router.refresh()
                  }}
                  reviewOnly={surface === 'overview'}
                  api={surface === 'overview' ? { ...editorApi, reviewPending: false } : editorApi}
                  mode={workspace.general ? 'master' : 'tailored'}
                  applicationKey={app.key}
                  chatScope={applicationChatScope(app.key, surface)}
                  autoStart={surface === 'resume' && tab === 'resume'}
                  tailoringSkill={workspace.general ? undefined : {
                    run: (handlers) => tailor(handlers, surface),
                    review: surface === 'resume' && workspace.pendingProposal ? (
                      <TailoringProposal
                        proposal={workspace.pendingProposal}
                        busy={busy}
                        currentPages={preview.pages}
                        currentFill={preview.fill}
                        onToggle={(index) => void toggleTailoringChange(index)}
                        onReject={() => void resolveProposal('reject')}
                        onAccept={() => void resolveProposal('accept')}
                      />
                    ) : undefined,
                  }}
                />
                </div>)}
              </div>
              <div className={cn('min-h-0 flex-1 overflow-hidden', tab === 'resume' && editorPaneTab === 'yaml' ? 'block' : 'hidden')}><YamlEditor ref={editorRef} value={draft} onChange={setDraft} /></div>
            </Card>
          </div>
          {tab === 'overview' ? <div className="order-first"><Overview eligibility={eligibility} onOpenChat={() => editorCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} analysis={analysis} workspace={workspace} onRetry={() => setWorkspace((current) => ({ ...current, fit: { ...current.fit, status: 'queued' } }))} /></div> : <Card className="h-[680px] overflow-hidden"><PdfPreview token={preview.token} /></Card>}
        </div>
      </div>
    </div>
  )
}

function tailoringOperationEvent(op: Op): string {
  const detail = op.op === 'reword'
    ? `\n− ${op.from ?? ''}\n+ ${op.to ?? ''}`
    : op.op === 'set'
      ? `\n+ ${op.value ?? ''}`
      : ''
  return `${op.op.toUpperCase()} ${op.path}\n${op.why}${detail}`
}

function TailoringProposal({ proposal, busy, currentPages, currentFill, onToggle, onReject, onAccept }: {
  proposal: WorkspaceProposal
  busy: boolean
  currentPages: number | null
  currentFill: number | null
  onToggle: (index: number) => void
  onReject: () => void
  onAccept: () => void
}) {
  const kept = proposal.choices.filter((choice) => choice !== false).length
  const individuallyReviewable = !!proposal.operationBaseYaml

  return (
    <div className="mt-2 overflow-hidden border-t border-[var(--color-border)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)] px-3 py-2.5">
        <div className="min-w-48 flex-1">
          <p className="text-xs font-medium">Tailoring proposal · {kept}/{proposal.ops.length} changes selected</p>
          <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">
            {currentPages ?? proposal.render.pages ?? '—'} page · {currentFill ?? proposal.render.fill ?? '—'}% fill · Nothing is finalized until you accept
          </p>
        </div>
        <button onClick={onReject} disabled={busy} className="rounded-md border border-[var(--color-bad)] px-2.5 py-1 text-[11px] text-[var(--color-bad)] disabled:opacity-40">Reject all</button>
        <button onClick={onAccept} disabled={busy || kept === 0} className="rounded-md bg-[var(--color-ok)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40">Accept & finalize</button>
      </div>
      {!individuallyReviewable ? <p className="border-b border-[var(--color-border)] px-3 py-2 text-[10px] text-[var(--color-faint)]">This older proposal can be accepted or rejected as a whole.</p> : null}
      <ul className="max-h-64 divide-y divide-[var(--color-border)] overflow-y-auto">
        {proposal.ops.map((op, index) => {
          const selected = proposal.choices[index] !== false
          return (
            <li key={`${op.path}-${index}`} className="flex items-start gap-2 px-3 py-2">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(index)}
                disabled={busy || !individuallyReviewable}
                aria-label={`Keep change: ${op.why}`}
                className="mt-0.5 shrink-0 accent-[var(--color-accent)]"
              />
              <div className={cn('min-w-0 flex-1', !selected && 'opacity-50')}>
                <p className={cn('text-[11px] leading-snug', !selected && 'line-through')}><span className="mr-1.5 font-mono text-[10px] uppercase text-[var(--color-accent)]">{op.op}</span>{op.why}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-faint)]">{op.path}</p>
                {op.op === 'reword' ? <p className="mt-1 text-[10px] text-[var(--color-muted)]"><span className="text-[var(--color-bad)]">− {op.from}</span><br /><span className="text-[var(--color-ok)]">+ {op.to}</span></p> : null}
                {op.op === 'set' ? <p className="mt-1 text-[10px] text-[var(--color-ok)]">+ {op.value}</p> : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
