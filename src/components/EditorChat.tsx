'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Pencil, Square } from 'lucide-react'
import { Badge, Empty, Spinner } from './ui/primitives'
import { ResumeReview } from './ResumeReview'
import type { EditorApi } from './EditorPane'
import { readNdjson } from '@/lib/ndjson'
import type { Mode } from '@/lib/validate'
import { cn } from '@/lib/utils'
import { PROFILE_UPDATE_REQUEST } from '@/lib/skills/learning'
import { LearnFromChat } from './LearnFromChat'
import { FeatureEnginePicker } from './FeatureEnginePicker'
import { chatSkillForMessage } from '@/lib/chatSkills'
import { resumeFingerprint, resumeReviewParser, type ResumeReview as Review } from '@/lib/resumeReview'
import {
  editorChatStorageKey,
  parseEditorChatSnapshot,
  serializeEditorChatSnapshot,
  type EditorChatSnapshot,
  type ChatSkillEvent,
  type EditorChatTurn as DisplayTurn,
} from '@/lib/chatPersistence'

export function EditorChat({
  api,
  reviewOnly = false,
  onProfileUpdated,
  mode,
  applicationKey,
  chatScope,
  reviewSource,
  tailoring,
  tailoringSkill,
  autoStart = false,
}: {
  onProfileUpdated?: () => Promise<void>
  reviewOnly?: boolean
  api: EditorApi
  mode: Mode
  applicationKey?: string
  chatScope: string
  reviewSource?: string
  tailoring?: ReactNode
  /** Kick off tailoringSkill.run() the first time this chat is opened empty, instead of waiting for a typed request. */
  autoStart?: boolean
  tailoringSkill?: {
    run: (handlers: {
      conversation?: { role: 'user' | 'assistant'; content: string }[]
      onEvent: (event: ChatSkillEvent) => void
      signal?: AbortSignal
    }) => Promise<{ answer: string; engine?: string; skillId: string; runId?: string }>
    review?: ReactNode
  }
}) {
  const storageKey = editorChatStorageKey(chatScope)
  const [turns, setTurns] = useState<DisplayTurn[]>([])
  const [message, setMessage] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState<string | null>(null)
  const [liveReasoning, setLiveReasoning] = useState('')
  const [liveSkillEvents, setLiveSkillEvents] = useState<ChatSkillEvent[]>([])
  const [streamResponses, setStreamResponses] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const [resumeReviewMode, setResumeReviewMode] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const reviewStartRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const sessionRef = useRef('')
  const autoStartedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const pendingProposal = turns.some((turn) => turn.proposal?.status === 'pending')
  const latestResumeReviewIndex = turns.reduce((found, turn, index) => turn.review ? index : found, -1)
  const latestResumeReview = latestResumeReviewIndex >= 0 ? turns[latestResumeReviewIndex].review : undefined
  const staleResumeReview = Boolean(latestResumeReview && latestResumeReview.fingerprint !== resumeFingerprint(api.text))

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    setHydrated(false)
    const saved = parseEditorChatSnapshot(readEditorChat(storageKey))
    const nextTurns = saved?.turns ?? []
    const nextMessage = saved?.draft ?? ''
    sessionRef.current = saved?.sessionId ?? crypto.randomUUID()
    setTurns(nextTurns)
    setMessage(nextMessage)
    setError(null)
    setActivity(null)
    setLiveReasoning('')
    setLiveSkillEvents([])
    setEditingIndex(null)
    setEditingText('')
    setResumeReviewMode(saved?.reviewMode === true)
    setHydrated(true)

    const pending = [...nextTurns].reverse().find((turn) => turn.proposal?.status === 'pending')?.proposal
    if (pending) {
      api.setText(pending.after)
      api.setReviewPending(true)
    }
  }, [storageKey])

  useEffect(() => {
    const saved = readEditorChat('career-ops-editor-stream')
    if (saved !== null) setStreamResponses(saved === 'true')
  }, [])
  useEffect(() => {
    if (turns.at(-1)?.review && !busy) reviewStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, busy, activity, liveReasoning, liveSkillEvents])

  useEffect(() => {
    if (!hydrated || !autoStart || !tailoringSkill || autoStartedRef.current) return
    if (turns.length || busy || api.reviewPending) return
    autoStartedRef.current = true
    void send('Tailor my resume for this role.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, autoStart, turns.length, busy, api.reviewPending])

  function setStreaming(value: boolean) {
    setStreamResponses(value)
    try { window.localStorage.setItem('career-ops-editor-stream', String(value)) } catch { /* keep the in-memory choice */ }
  }

  function newChat() {
    if (pendingProposal || busy) return
    sessionRef.current = crypto.randomUUID()
    setTurns([])
    setMessage('')
    setError(null)
    setActivity(null)
    setLiveReasoning('')
    setLiveSkillEvents([])
    setEditingIndex(null)
    setEditingText('')
    setResumeReviewMode(false)
    storeEditorChat(storageKey, { sessionId: sessionRef.current, turns: [], draft: '', reviewMode: false })
  }

  function exitResumeReview() {
    setResumeReviewMode(false)
    storeEditorChat(storageKey, { sessionId: sessionRef.current, turns, draft: message, reviewMode: false })
    messageRef.current?.focus()
  }

  function discussFinding(value: string) {
    if (busy || staleResumeReview) return
    setResumeReviewMode(true)
    setMessage(value)
    storeEditorChat(storageKey, { sessionId: sessionRef.current, turns, draft: value, reviewMode: true })
    messageRef.current?.focus()
  }

  function stop() {
    abortRef.current?.abort()
  }

  function startEdit(index: number) {
    if (busy || resumeReviewMode || api.reviewPending || turns[index]?.role !== 'user' || turns[index + 1]?.review) return
    setEditingIndex(index)
    setEditingText(turns[index].content)
  }

  function cancelEdit() {
    setEditingIndex(null)
    setEditingText('')
  }

  /** Rewrite a past prompt: drop it and everything after, then resend from there. */
  async function submitEdit() {
    if (editingIndex === null) return
    const index = editingIndex
    const text = editingText.trim()
    if (!text) return
    for (const turn of turns.slice(index)) {
      if (turn.proposal?.status === 'pending') {
        api.setText(turn.proposal.before)
        api.setReviewPending(false)
      }
    }
    const truncated = turns.slice(0, index)
    setTurns(truncated)
    storeEditorChat(storageKey, { sessionId: sessionRef.current, turns: truncated, draft: '', reviewMode: resumeReviewMode })
    setEditingIndex(null)
    setEditingText('')
    await send(text, truncated)
  }

  async function send(request?: string, baseHistory?: DisplayTurn[], startResumeReview = false) {
    const userMessage = (request ?? message).trim()
    if (!userMessage || busy) return
    if (resumeReviewMode && staleResumeReview && !startResumeReview) return
    const activeReviewMode = Boolean(reviewSource && (startResumeReview || resumeReviewMode))
    const userTurn: DisplayTurn = { role: 'user', content: userMessage }
    const earlierTurns = baseHistory ?? turns
    const history = [...earlierTurns, userTurn]
    const activeStorageKey = storageKey
    const activeSessionId = sessionRef.current
    const activeDraft = startResumeReview ? message : ''
    setTurns(history)
    setMessage(activeDraft)
    storeEditorChat(activeStorageKey, { sessionId: activeSessionId, turns: history, draft: activeDraft, reviewMode: activeReviewMode })
    setBusy(true)
    setActivity(activeReviewMode ? 'Starting resume review…' : 'Starting the editor agent…')
    setLiveReasoning('')
    setLiveSkillEvents([])
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    let streamed = ''
    let reasoning = ''
    let skillEvents: ChatSkillEvent[] = []
    let doneEvent: Record<string, unknown> | null = null

    try {
      if (activeReviewMode && reviewSource) {
        setActivity(startResumeReview ? 'Reviewing the current draft…' : 'Reconsidering the review…')
        const previous = startResumeReview ? undefined : latestResumeReview?.report
        const response = await fetch('/api/profile/review', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            yaml: api.text,
            source: reviewSource,
            ...(previous ? {
              message: userMessage,
              previousReview: previous,
              conversation: (baseHistory ?? turns).slice(-20).map(({ role, content }) => ({ role, content: content.slice(0, 16000) })),
            } : {}),
          }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'Could not review this resume.')
        const report = resumeReviewParser.parse(result.review) as Review
        const reply = typeof result.reply === 'string' && result.reply.trim()
          ? result.reply.trim()
          : 'I reviewed the current draft. You can question any finding below.'
        const nextTurns: DisplayTurn[] = [...history, {
          role: 'assistant',
          content: formatResumeReviewForConversation(reply, report),
          review: {
            report, reply, fingerprint: resumeFingerprint(api.text),
            runId: result.runId, skillVersion: result.skillVersion, engine: result.engine,
          },
        }]
        setTurns(nextTurns)
        setResumeReviewMode(true)
        storeEditorChat(activeStorageKey, { sessionId: activeSessionId, turns: nextTurns, draft: activeDraft, reviewMode: true })
        return
      }
      if (tailoringSkill && chatSkillForMessage(userMessage) === 'tailor-cv') {
        setActivity(null)
        const result = await tailoringSkill.run({
          conversation: history.slice(-100).map(({ role, content }) => ({ role, content })),
          signal: controller.signal,
          onEvent: (event) => {
            skillEvents = [...skillEvents, { ...event, text: event.text.slice(0, 4_000) }].slice(-160)
            setLiveSkillEvents(skillEvents)
          },
        })
        const nextTurns: DisplayTurn[] = [...history, {
          role: 'assistant',
          content: result.answer,
          engine: result.engine,
          skillRun: { skillId: result.skillId, runId: result.runId, events: skillEvents },
        }]
        setTurns(nextTurns)
        storeEditorChat(activeStorageKey, { sessionId: activeSessionId, turns: nextTurns, draft: '', reviewMode: activeReviewMode })
        return
      }

      const response = await fetch('/api/editor/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          reviewOnly,
          yaml: api.text,
          mode,
          message: userMessage,
          applicationKey,
          sessionId: sessionRef.current,
          stream: streamResponses,
          conversation: (baseHistory ?? turns).slice(-100).map(({ role, content }) => ({ role, content })),
        }),
      })
      if (!response.ok) {
        const data = await response.json() as { error?: string }
        throw new Error(data.error ?? 'editor agent failed')
      }

      await readNdjson(response, (event) => {
        if (event.type === 'activity' && typeof event.text === 'string') {
          setActivity(event.text)
          return
        }
        if (event.type === 'delta' && typeof event.text === 'string') {
          streamed += event.text
          setActivity(null)
          const nextTurns: DisplayTurn[] = [...history, { role: 'assistant', content: streamed }]
          setTurns(nextTurns)
          storeEditorChat(activeStorageKey, { sessionId: activeSessionId, turns: nextTurns, draft: '', reviewMode: activeReviewMode })
          return
        }
        if (event.type === 'reasoning' && typeof event.text === 'string') {
          reasoning += event.text
          setLiveReasoning(reasoning)
          return
        }
        if (event.type === 'error') throw new Error(String(event.message ?? 'editor agent failed'))
        if (event.type === 'done') doneEvent = event
      })

      if (!doneEvent) throw new Error('editor agent ended without a result')
      const result = doneEvent as Record<string, unknown>
      const answer = typeof result.answer === 'string' ? result.answer : streamed || 'Done.'
      const changed = result.changed === true
      const engine = typeof result.engine === 'string' ? result.engine : undefined
      const changedYaml = changed && typeof result.yaml === 'string' ? result.yaml : null
      if (changedYaml) {
        api.setText(changedYaml)
        api.setReviewPending(true)
      }

      const nextTurns: DisplayTurn[] = [...history, {
        role: 'assistant',
        content: answer,
        changed,
        engine,
        reasoning: reasoning || undefined,
        proposal: changedYaml ? { before: api.text, after: changedYaml, status: 'pending' } : undefined,
      }]
      setTurns(nextTurns)
      storeEditorChat(activeStorageKey, { sessionId: activeSessionId, turns: nextTurns, draft: '', reviewMode: activeReviewMode })
      setActivity(null)
      setLiveReasoning('')
      if (userMessage === PROFILE_UPDATE_REQUEST || result.analysisUpdated === true) {
        try { await onProfileUpdated?.() } catch { setError('Changes were saved, but the overview could not refresh. Reload to see the updated analysis.') }
      }
    } catch (reason) {
      if (startResumeReview && !latestResumeReview) setResumeReviewMode(false)
      if (activeReviewMode) {
        setTurns(earlierTurns)
        setMessage(startResumeReview ? activeDraft : userMessage)
        if ((reason as Error).name !== 'AbortError') setError((reason as Error).message)
        storeEditorChat(activeStorageKey, { sessionId: activeSessionId, turns: earlierTurns, draft: startResumeReview ? activeDraft : userMessage, reviewMode: resumeReviewMode })
      } else if ((reason as Error).name === 'AbortError') {
        const stoppedTurn: DisplayTurn | null = streamed || skillEvents.length
          ? {
              role: 'assistant',
              content: streamed || 'Stopped before finishing.',
              reasoning: reasoning || undefined,
              stopped: true,
              skillRun: skillEvents.length ? { skillId: 'tailor-cv', events: skillEvents } : undefined,
            }
          : null
        const nextTurns = stoppedTurn ? [...history, stoppedTurn] : history
        setTurns(nextTurns)
        storeEditorChat(activeStorageKey, { sessionId: activeSessionId, turns: nextTurns, draft: activeDraft, reviewMode: resumeReviewMode })
      } else {
        setTurns(history)
        setError((reason as Error).message)
        setMessage(startResumeReview ? activeDraft : userMessage)
        storeEditorChat(activeStorageKey, { sessionId: activeSessionId, turns: history, draft: startResumeReview ? activeDraft : userMessage, reviewMode: resumeReviewMode })
      }
    } finally {
      abortRef.current = null
      setBusy(false)
      setActivity(null)
      setLiveReasoning('')
      setLiveSkillEvents([])
    }
  }

  async function acceptProposal(index: number) {
    const proposal = turns[index]?.proposal
    if (!proposal || proposal.status !== 'pending') return
    setResolving(index)
    setError(null)
    try {
      await api.save(api.text)
      updateProposalStatus(index, 'accepted')
      api.setReviewPending(false)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setResolving(null)
    }
  }

  function rejectProposal(index: number) {
    const proposal = turns[index]?.proposal
    if (!proposal || proposal.status !== 'pending') return
    api.setText(proposal.before)
    updateProposalStatus(index, 'rejected')
    api.setReviewPending(false)
  }

  function updateProposalStatus(index: number, status: 'accepted' | 'rejected') {
    setTurns((current) => {
      const next = current.map((turn, turnIndex) => turnIndex === index && turn.proposal
        ? { ...turn, proposal: { ...turn.proposal, status } }
        : turn)
      storeEditorChat(storageKey, { sessionId: sessionRef.current, turns: next, draft: message, reviewMode: resumeReviewMode })
      return next
    })
  }

  const reviewTurn = tailoringSkill?.review
    ? turns.reduce((found, turn, index) => turn.skillRun?.skillId === 'tailor-cv' ? index : found, -1)
    : -1

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3 py-2 text-[10px] text-[var(--color-faint)]">
        <FeatureEnginePicker feature="editor-chat" disabled={!hydrated || busy || pendingProposal} compact />
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={streamResponses}
            onChange={(event) => setStreaming(event.target.checked)}
            disabled={!hydrated || busy}
            className="accent-[var(--color-accent)]"
          />
          Stream responses
        </label>
        <button onClick={newChat} disabled={!hydrated || busy || api.reviewPending || pendingProposal || !turns.length} className="ml-auto hover:text-[var(--color-text)] disabled:opacity-40">
          New chat
        </button>
      </div>

      {reviewSource && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
          <button
            type="button"
            onClick={() => void send('Review this resume.', undefined, true)}
            disabled={!hydrated || busy || api.reviewPending || pendingProposal || !api.text.trim()}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-[var(--color-accent-soft)] px-2.5 text-xs font-medium text-[var(--color-accent)] hover:opacity-80 disabled:opacity-40"
          >
            <ClipboardCheck size={14} aria-hidden="true" />
            {latestResumeReview ? 'Review current draft' : 'Review resume'}
          </button>
          {resumeReviewMode && latestResumeReview ? (
            <button type="button" onClick={exitResumeReview} disabled={busy} className="min-h-8 rounded-md border px-2.5 text-xs font-medium hover:bg-[var(--color-surface-2)] disabled:opacity-40">Back to editing</button>
          ) : null}
          <span className="text-[11px] text-[var(--color-muted)]">{resumeReviewMode ? staleResumeReview ? 'Draft changed · run a new review to continue' : 'Question or challenge any finding below' : 'Review includes unsaved edits and leaves the resume unchanged'}</span>
          <Link href="/skills/review-resume" className="ml-auto text-[11px] text-[var(--color-muted)] underline underline-offset-4">Edit review skill</Link>
        </div>
      )}

      {applicationKey ? <LearnFromChat key={storageKey + sessionRef.current} skillId={reviewOnly ? 'analyze-job' : 'tailor-cv'} onUpdateProfile={() => void send(PROFILE_UPDATE_REQUEST)} turns={turns} disabled={!hydrated || busy || pendingProposal || api.reviewPending} /> : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!hydrated ? (
          <div className="flex h-48 items-center justify-center"><Spinner /></div>
        ) : turns.length ? turns.map((turn, index) => (
          editingIndex === index ? (
            <div key={index} className="ml-auto max-w-[88%] rounded-xl rounded-br-sm border border-[var(--color-accent)] bg-[var(--color-bg)] px-3 py-2">
              <textarea
                value={editingText}
                onChange={(event) => setEditingText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void submitEdit()
                  }
                  if (event.key === 'Escape') cancelEdit()
                }}
                autoFocus
                rows={3}
                maxLength={8000}
                aria-label="Edit message"
                className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button onClick={cancelEdit} className="rounded-md border border-[var(--color-border-strong)] px-2.5 py-1 text-[11px] hover:bg-[var(--color-surface-2)]">
                  Cancel
                </button>
                <button
                  onClick={() => void submitEdit()}
                  disabled={!editingText.trim()}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-bg)] disabled:opacity-40"
                >
                  Save &amp; rerun
                </button>
              </div>
            </div>
          ) : (
          <div
            key={index}
            ref={turn.review && index === latestResumeReviewIndex ? reviewStartRef : undefined}
            className={turn.role === 'user'
              ? 'group ml-auto max-w-[88%] rounded-xl rounded-br-sm bg-[var(--color-accent-soft)] px-3 py-2 text-sm leading-relaxed'
              : 'max-w-[94%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm leading-relaxed'}
          >
            <p className="whitespace-pre-wrap">{turn.review ? turn.review.reply : turn.content}</p>
            {turn.role === 'assistant' && turn.review ? (
              <ResumeReview review={turn.review} current={index === latestResumeReviewIndex} stale={staleResumeReview} onDiscuss={discussFinding} />
            ) : null}
            {turn.role === 'user' ? (
              <div className="mt-1 flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  onClick={() => startEdit(index)}
                  disabled={busy || resumeReviewMode || api.reviewPending || Boolean(turns[index + 1]?.review)}
                  className="flex items-center gap-1 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-0"
                >
                  <Pencil size={10} aria-hidden="true" /> Edit &amp; rerun
                </button>
              </div>
            ) : null}
            {turn.role === 'assistant' && turn.skillRun ? <SkillRunTranscript run={turn.skillRun} /> : null}
            {turn.role === 'assistant' && turn.reasoning ? <ReasoningSummary text={turn.reasoning} /> : null}
            {turn.role === 'assistant' && turn.proposal ? (
              <EditProposal
                proposal={turn.proposal}
                currentYaml={api.text}
                saving={resolving === index}
                onAccept={() => void acceptProposal(index)}
                onReject={() => rejectProposal(index)}
                onEdit={api.showEditor}
              />
            ) : null}
            {turn.role === 'assistant' && index === reviewTurn ? tailoringSkill?.review : null}
            {turn.role === 'assistant' && (turn.changed || turn.engine || turn.stopped) ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border)] pt-2 text-[10px]">
                {turn.stopped ? <Badge tone="warn">stopped</Badge> : turn.changed ? <Badge tone="ok">buffer updated</Badge> : <Badge>{reviewOnly ? 'analysis discussion' : 'no YAML changes'}</Badge>}
                {turn.engine ? <span className="text-[var(--color-faint)]">via {turn.engine} session</span> : null}
              </div>
            ) : null}
          </div>
          )
        )) : !tailoring ? (
          <Empty
            title={reviewOnly ? 'Let’s check whether this role works for you' : reviewSource ? 'Review or edit this resume' : tailoringSkill ? 'What should we do with this resume?' : 'Edit with a CLI agent'}
            hint={reviewOnly ? 'Ask about work authorization, discuss a gap, or correct the analysis. No resume tailoring starts until you request it.' : tailoringSkill
              ? 'Discuss the tailored draft, ask for changes, or compare it with anything in your repository. I can consult your masters, earlier applications, and notes.'
              : reviewSource ? 'Run a structured review, then challenge findings or answer its questions here. Switch back to editing whenever you want to change the draft.'
                : 'This is a persistent Claude/Codex session with file tools and buffer history. Ask it to edit, explain, compare, restore, or undo.'}
          />
        ) : null}
        {busy && liveReasoning ? (
          <div className="max-w-[94%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-faint)]">Reasoning summary · live</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted)]">{liveReasoning}</p>
          </div>
        ) : null}
        {busy && liveSkillEvents.length ? (
          <div className="max-w-[94%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm leading-relaxed">
            <p>Running the Tailor CV skill…</p>
            <SkillRunTranscript run={{ skillId: 'tailor-cv', events: liveSkillEvents }} live />
          </div>
        ) : null}
        {busy && activity ? <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]"><Spinner /> {activity}</div> : null}
        {tailoring}
        {tailoringSkill?.review && reviewTurn === -1 ? (
          <div className="max-w-[94%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm leading-relaxed">
            <p>I restored the tailoring proposal for review.</p>
            {tailoringSkill.review}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {error ? <p className="border-t border-[var(--color-bad-soft)] bg-[var(--color-bad-soft)] px-3 py-2 text-xs text-[var(--color-bad)]">{error}</p> : null}

      <div className="shrink-0 border-t border-[var(--color-border)] p-3">
        <textarea
          ref={messageRef}
          value={message}
          onChange={(event) => {
            const draft = event.target.value
            setMessage(draft)
            storeEditorChat(storageKey, { sessionId: sessionRef.current, turns, draft, reviewMode: resumeReviewMode })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder={resumeReviewMode ? 'Question a finding or add context…' : reviewOnly ? 'What should we clarify before I apply?' : tailoringSkill ? 'Try “Tailor my resume for this role”…' : tailoring ? 'Ask for another edit, explanation, or undo…' : 'Ask the Claude/Codex editor agent…'}
          aria-label="Message CV editor agent"
          disabled={!hydrated || busy || api.reviewPending || editingIndex !== null || (resumeReviewMode && (staleResumeReview || !latestResumeReview))}
          maxLength={8000}
          rows={3}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)] disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-[var(--color-faint)]">
            {editingIndex !== null ? 'Editing a previous message — save to rerun from there' : api.reviewPending ? 'Accept or reject the current proposal before sending another edit' : resumeReviewMode ? 'Your feedback updates the review, not the resume' : reviewOnly ? 'Confirmed corrections are saved to this application’s analysis' : 'AI edits are previewed before they can be saved'}
          </span>
          <button
            onClick={() => busy ? stop() : void send()}
            disabled={!hydrated || editingIndex !== null || (!busy && (api.reviewPending || (resumeReviewMode && (staleResumeReview || !latestResumeReview)) || !message.trim()))}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40',
              busy ? 'border border-[var(--color-bad)] text-[var(--color-bad)]' : 'bg-[var(--color-accent)] text-[var(--color-bg)]',
            )}
          >
            {busy ? <Square size={12} aria-hidden="true" /> : null}
            {busy ? 'Stop' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SkillRunTranscript({ run, live = false }: {
  run: NonNullable<DisplayTurn['skillRun']>
  live?: boolean
}) {
  const transcriptEndRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (live) transcriptEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [live, run.events.length])

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2.5 py-1.5 text-[10px]">
        {live ? <Spinner /> : <span className="text-[var(--color-ok)]">✓</span>}
        <span className="font-medium uppercase tracking-wide text-[var(--color-faint)]">{run.skillId} · {live ? 'live transcript' : 'run transcript'}</span>
        {run.runId ? <a href={`/runs/${run.runId}`} className="ml-auto text-[var(--color-accent)] hover:underline">Inspect run</a> : null}
      </div>
      <ol className="max-h-64 space-y-1 overflow-y-auto px-2.5 py-2">
        {run.events.map((event, index) => (
          <li key={`${index}-${event.kind}`} className="grid grid-cols-[4.5rem_1fr] gap-2 text-[10px] leading-relaxed">
            <span className={cn(
              'font-mono uppercase',
              event.kind === 'reasoning' ? 'text-[var(--color-accent)]'
                : event.kind === 'change' ? 'text-[var(--color-ok)]'
                  : event.kind === 'preview' ? 'text-[var(--color-warn)]'
                    : 'text-[var(--color-faint)]',
            )}>{event.kind}</span>
            <span className="whitespace-pre-wrap text-[var(--color-muted)]">{event.text}</span>
          </li>
        ))}
        <li ref={transcriptEndRef} />
      </ol>
    </div>
  )
}

function storeEditorChat(storageKey: string, snapshot: EditorChatSnapshot) {
  try {
    window.localStorage.setItem(storageKey, serializeEditorChatSnapshot(snapshot))
  } catch {
    // A full or disabled localStorage must not block editing or AI responses.
  }
}

function readEditorChat(storageKey: string): string | null {
  try { return window.localStorage.getItem(storageKey) } catch { return null }
}

function formatResumeReviewForConversation(reply: string, review: Review): string {
  return [
    reply,
    `Assessment: ${review.assessment}`,
    ...review.strengths.map((strength) => `Strength: ${strength}`),
    ...review.findings.map((finding) => `Finding in ${finding.location}: ${finding.issue} Recommendation: ${finding.recommendation}${finding.excerpt ? ` Excerpt: ${finding.excerpt}` : ''}${finding.suggestedWording ? ` Suggested wording: ${finding.suggestedWording}` : ''}`),
    ...review.questions.map((question) => `Question: ${question}`),
  ].join('\n')
}

function ReasoningSummary({ text }: { text: string }) {
  return (
    <details className="mt-2 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-muted)]">
      <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-[var(--color-faint)]">
        Reasoning summary
      </summary>
      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{text}</p>
    </details>
  )
}

function EditProposal({
  proposal,
  currentYaml,
  saving,
  onAccept,
  onReject,
  onEdit,
}: {
  proposal: NonNullable<DisplayTurn['proposal']>
  currentYaml: string
  saving: boolean
  onAccept: () => void
  onReject: () => void
  onEdit: () => void
}) {
  const pending = proposal.status === 'pending'
  const manuallyEdited = pending && currentYaml !== proposal.after
  const changes = changedLines(proposal.before, proposal.after)

  return (
    <div className="mt-2 border-t border-[var(--color-border)] pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-faint)]">
          {pending ? 'Proposed YAML changes' : proposal.status === 'accepted' ? 'Accepted changes' : 'Rejected changes'}
        </p>
        {manuallyEdited ? <Badge tone="accent">manual edits included</Badge> : null}
      </div>
      <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-[10px] leading-relaxed">
        {changes.map((change, index) => (
          <div
            key={`${index}-${change.text}`}
            className={cn(
              'px-2 py-0.5',
              change.kind === 'add' ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' : 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]',
            )}
          >
            {change.kind === 'add' ? '+' : '−'} {change.text || ' '}
          </div>
        ))}
      </div>
      {pending ? (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button onClick={onEdit} disabled={saving} className="rounded-md border border-[var(--color-border-strong)] px-2.5 py-1 text-[11px] disabled:opacity-40">
            Edit YAML
          </button>
          <button onClick={onReject} disabled={saving} className="rounded-md border border-[var(--color-bad)] px-2.5 py-1 text-[11px] text-[var(--color-bad)] disabled:opacity-40">
            Reject
          </button>
          <button onClick={onAccept} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-[var(--color-ok)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40">
            {saving ? <Spinner className="border-t-white" /> : null}
            {saving ? 'Saving…' : 'Accept & save'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

interface ChangedLine {
  kind: 'add' | 'remove'
  text: string
}

/** Small line-level LCS diff; unchanged YAML is intentionally omitted. */
function changedLines(before: string, after: string): ChangedLine[] {
  const left = before.split('\n')
  const right = after.split('\n')
  if (left.length * right.length > 1_000_000) return changedMiddle(left, right)
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1))

  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const changes: ChangedLine[] = []
  let i = 0
  let j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      i++
      j++
    } else if (j < right.length && (i === left.length || table[i][j + 1] >= table[i + 1][j])) {
      changes.push({ kind: 'add', text: right[j++] })
    } else if (i < left.length) {
      changes.push({ kind: 'remove', text: left[i++] })
    }
  }
  return changes.slice(0, 120)
}

/** Avoid allocating a quadratic LCS table for unusually large YAML buffers. */
function changedMiddle(left: string[], right: string[]): ChangedLine[] {
  let start = 0
  while (start < left.length && start < right.length && left[start] === right[start]) start++

  let leftEnd = left.length - 1
  let rightEnd = right.length - 1
  while (leftEnd >= start && rightEnd >= start && left[leftEnd] === right[rightEnd]) {
    leftEnd--
    rightEnd--
  }

  return [
    ...left.slice(start, leftEnd + 1).map((text) => ({ kind: 'remove' as const, text })),
    ...right.slice(start, rightEnd + 1).map((text) => ({ kind: 'add' as const, text })),
  ].slice(0, 120)
}
