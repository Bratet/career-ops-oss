'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Spinner } from './ui/primitives'
import { readNdjson } from '@/lib/ndjson'
import type { EditorApi } from './EditorPane'
import type { Op, Rejection } from '@/lib/tailoring/ops'
import { cn } from '@/lib/utils'
import type { SkillSummary } from '@/lib/skills/types'
import { FeatureEnginePicker } from './FeatureEnginePicker'
import type { RequirementAction } from '@/lib/tailoring/rules'

/**
 * The tailoring pass, under the editor.
 *
 * Every pass starts from the general resume with master evidence, then cuts, orders
 * and minimally rewords it down to one page. The result is a proposal: it moves
 * the live preview, but nothing reaches the application files until Accept.
 *
 * Undo is a replay, not a stack: unchecking a row re-applies the remaining
 * operations to the snapshot taken before the pass, on the server, through the
 * same guards. An operation whose target has shifted is refused rather than
 * applied to the wrong line.
 */

type Phase = 'idle' | 'tailoring' | 'applying' | 'accepting'

export function TailorPanel({
  appKey,
  api,
  autoStart = false,
}: {
  appKey: string
  api: EditorApi
  autoStart?: boolean
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<string | null>(null)
  const [progressLog, setProgressLog] = useState<string[]>([])
  const [reasoning, setReasoning] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [skillId, setSkillId] = useState('tailor-cv')
  const [runId, setRunId] = useState<string | null>(null)

  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [operationBase, setOperationBase] = useState<string | null>(null)
  const [ops, setOps] = useState<Op[]>([])
  const [off, setOff] = useState<Set<number>>(new Set())
  const [rejected, setRejected] = useState<Rejection[]>([])
  const [gaps, setGaps] = useState<string[]>([])
  const [requirementActions, setRequirementActions] = useState<RequirementAction[]>([])
  const [proposalYaml, setProposalYaml] = useState<string | null>(null)
  const [proposalPages, setProposalPages] = useState<number | null>(null)
  const [proposalFill, setProposalFill] = useState<number | null>(null)
  const [iterations, setIterations] = useState(0)
  const [targetReached, setTargetReached] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const autoStartedRef = useRef(false)
  const tailorAbortRef = useRef<AbortController | null>(null)
  const streamEndRef = useRef<HTMLDivElement>(null)

  const busy = phase !== 'idle'

  useEffect(() => {
    fetch('/api/skills')
      .then((response) => response.json())
      .then((data) => setSkills((data.skills as SkillSummary[]).filter((skill) => skill.runner === 'cv-operations')))
      .catch(() => setSkills([]))
  }, [])

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return
    autoStartedRef.current = true
    void tailor().finally(clearAutoTailorParam)
  }, [autoStart])

  useEffect(() => {
    if (!progressLog.length && !reasoning && !ops.length && !snapshot) return
    const frame = window.requestAnimationFrame(() => {
      streamEndRef.current?.scrollIntoView({ block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [progressLog.length, reasoning, ops.length, snapshot])

  async function tailor() {
    if (snapshot) {
      setError('Accept or discard the current proposal before tailoring again.')
      setExpanded(true)
      return
    }
    setError(null)
    setNotice(null)
    setProgress(null)
    setProgressLog([])
    setReasoning('')
    setRunId(null)
    setExpanded(true)
    setOps([])
    setOff(new Set())
    setRejected([])
    setGaps([])
    setRequirementActions([])
    setProposalYaml(null)
    setProposalPages(null)
    setProposalFill(null)
    setIterations(0)
    setTargetReached(false)
    const bufferBeforeRun = api.text
    let receivedProposal = false
    let receivedCandidate = false
    let finalChangesStarted = false
    api.setReviewPending(true)

    try {
      setPhase('tailoring')
      const controller = new AbortController()
      tailorAbortRef.current = controller
      const r = await fetch(`/api/applications/${appKey}/tailor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skillId }),
        signal: controller.signal,
      })
      if (!r.ok) {
        setError(((await r.json()) as { error?: string }).error ?? 'tailor failed')
        return
      }
      await readNdjson(r, (e) => {
        if (e.type === 'start') {
          const message = `Started ${e.skillId} v${e.skillVersion} with ${e.engine}`
          setProgress(message)
          setProgressLog([message])
          if (typeof e.runId === 'string') setRunId(e.runId)
        }
        if (e.type === 'progress') {
          const message = e.message as string
          setProgress(message)
          setProgressLog((current) => current.at(-1) === message ? current : [...current, message])
        }
        if (e.type === 'reasoning' && typeof e.message === 'string') {
          setReasoning((current) => current + e.message)
        }
        if (e.type === 'candidate') {
          receivedCandidate = true
          const attempt = typeof e.attempt === 'number' ? e.attempt : 0
          setIterations(attempt)
          setProposalPages(typeof e.pages === 'number' ? e.pages : null)
          setProposalFill(typeof e.fill === 'number' ? e.fill : null)
          setOps((e.ops as Op[]) ?? [])
          setRejected((e.rejected as Rejection[]) ?? [])
          setProposalYaml(e.yaml as string)
          api.setText(e.yaml as string)
        }
        if (e.type === 'change' && e.op && typeof e.op === 'object') {
          if (!finalChangesStarted) {
            finalChangesStarted = true
            setOps([])
          }
          setOps((current) => [...current, e.op as Op])
        }
        if (e.type === 'error') setError(e.message as string)
        if (e.type === 'done') {
          receivedProposal = true
          setSnapshot(bufferBeforeRun)
          setOperationBase(e.baseYaml as string)
          setOps(e.ops as Op[])
          setOff(new Set())
          setRejected((e.rejected as Rejection[]) ?? [])
          setGaps((e.gaps as string[]) ?? [])
          setRequirementActions((e.requirementActions as RequirementAction[]) ?? [])
          setProposalPages(typeof e.pages === 'number' ? e.pages : null)
          setProposalFill(typeof e.fill === 'number' ? e.fill : null)
          setIterations((current) => typeof e.iterations === 'number' ? e.iterations : current)
          setTargetReached(e.targetReached === true)
          const yaml = e.yaml as string
          setProposalYaml(yaml)
          api.setText(yaml)
        }
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') setNotice('Tailoring canceled. The resume was not changed.')
      else setError((e as Error).message)
    } finally {
      if (!receivedProposal) {
        if (receivedCandidate) api.setText(bufferBeforeRun)
        setProposalYaml(null)
        api.setReviewPending(false)
      }
      tailorAbortRef.current = null
      setPhase('idle')
      setProgress(null)
    }
  }

  /** Replay the enabled subset onto the pre-pass snapshot. */
  async function toggle(i: number) {
    if (!snapshot || !operationBase) return
    const next = new Set(off)
    if (next.has(i)) next.delete(i)
    else next.add(i)

    setPhase('applying')
    setError(null)
    try {
      const keep = ops.filter((_, idx) => !next.has(idx))
      const r = await fetch(`/api/applications/${appKey}/apply-ops`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yaml: operationBase, ops: keep }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d.error ?? 'could not re-apply')
        return
      }
      setOff(next)
      setRejected(d.rejected ?? [])
      setProposalYaml(d.yaml as string)
      api.setText(d.yaml as string)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPhase('idle')
    }
  }

  async function accept() {
    if (!snapshot) return
    const keptOps = ops.filter((_, index) => !off.has(index))
    setPhase('accepting')
    setError(null)
    try {
      const response = await fetch(`/api/applications/${appKey}/tailor/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          yaml: api.text,
          ops: keptOps,
          requirementActions,
        }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'could not accept tailoring')
      api.markSaved()
      settleProposal()
      setNotice(`Accepted and saved ${keptOps.length} tailoring change${keptOps.length === 1 ? '' : 's'}.`)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setPhase('idle')
    }
  }

  function discard() {
    if (!snapshot || busy) return
    api.setText(snapshot)
    setOff(new Set(ops.map((_, index) => index)))
    settleProposal()
    setNotice('Tailoring proposal discarded. The original resume is back in the buffer.')
  }

  /** Close review ownership while keeping the completed turn readable in chat. */
  function settleProposal() {
    setSnapshot(null)
    setOperationBase(null)
    setProposalYaml(null)
    setRequirementActions([])
    setProposalPages(null)
    setProposalFill(null)
    setExpanded(true)
    api.setReviewPending(false)
  }

  const manualChanges = snapshot !== null && proposalYaml !== null && api.text !== proposalYaml
  const keptCount = ops.length - off.size

  return (
    <div className="max-w-[96%] overflow-hidden rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <span className="grid size-5 place-items-center rounded-md bg-[var(--color-accent-soft)] text-[10px] font-bold text-[var(--color-accent)]">AI</span>
        <div>
          <p className="text-xs font-medium">Tailoring assistant</p>
          <p className="text-[10px] text-[var(--color-faint)]">Native CLI agent · measured RenderCV loop · review before saving</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          onClick={() => phase === 'tailoring' ? tailorAbortRef.current?.abort() : void tailor()}
          disabled={phase === 'applying' || phase === 'accepting' || snapshot !== null || (api.reviewPending && phase === 'idle')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-40',
            phase === 'tailoring'
              ? 'border border-[var(--color-bad)] text-[var(--color-bad)]'
              : 'bg-[var(--color-accent)] text-[var(--color-bg)]',
          )}
          title="Tailors the general resume using the full master as evidence"
        >
          {phase === 'tailoring' ? <Spinner className="border-t-[var(--color-bg)]" /> : null}
          {phase === 'tailoring' ? 'Cancel tailoring' : snapshot ? 'Proposal ready' : 'Tailor resume'}
        </button>

        <FeatureEnginePicker feature="tailoring" disabled={busy} compact />

        <select
          value={skillId}
          onChange={(event) => setSkillId(event.target.value)}
          disabled={busy}
          aria-label="Tailoring skill"
          className="h-7 max-w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-muted)] outline-none focus:border-[var(--color-accent)] disabled:opacity-40"
        >
          {skills.length ? skills.map((skill) => (
            <option key={skill.id} value={skill.id}>{skill.name} · v{skill.version}</option>
          )) : <option value="tailor-cv">Tailor CV</option>}
        </select>

        <Link
          href={`/skills/${skillId}`}
          className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-40"
        >
          Edit skill
        </Link>

        {runId ? (
          <Link href={`/runs/${runId}`} className="text-[11px] text-[var(--color-accent)] hover:underline">
            Inspect run →
          </Link>
        ) : null}

        {progress ? <span className="min-w-32 flex-1 truncate text-[11px] text-[var(--color-faint)]">{progress}</span> : null}
        {snapshot && !progress ? (
          <button
            onClick={() => setExpanded((value) => !value)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-accent)]"
          >
            Review {keptCount}/{ops.length} proposed changes {expanded ? '▾' : '▸'}
          </button>
        ) : null}
      </div>

      {error ? <p className="px-3 pb-2 text-[11px] text-[var(--color-bad)]">{error}</p> : null}
      {notice ? <p className="px-3 pb-2 text-[11px] text-[var(--color-ok)]">{notice}</p> : null}

      {progressLog.length || reasoning ? (
        <div className="border-t border-[var(--color-border)] px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-faint)]">
            {phase === 'tailoring' ? 'Reasoning summary · streaming' : 'How the draft was built'}
          </p>
          {reasoning ? (
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted)]">{reasoning}</p>
          ) : null}
          <ol className="mt-2 space-y-1">
            {progressLog.map((item, index) => (
              <li key={`${index}-${item}`} className="flex items-start gap-2 text-[10px] text-[var(--color-faint)]">
                <span className={cn('mt-1 size-1.5 shrink-0 rounded-full', index === progressLog.length - 1 && phase === 'tailoring' ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-ok)]')} />
                {item}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {snapshot ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-accent-soft)] px-3 py-2">
          <div className="min-w-48 flex-1">
            <p className="text-xs font-medium">Previewing an unsaved tailoring proposal</p>
            <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">
              {manualChanges
                ? 'Your manual edits are included. The checklist is read-only to avoid overwriting them.'
                : 'The PDF shows this draft. Uncheck any change you do not want, then accept or discard it.'}
            </p>
            <p className="mt-1 text-[10px] font-medium text-[var(--color-faint)]">
              {proposalPages ?? '?'} page · {proposalFill ?? '?'}% fill · {iterations} agent iteration{iterations === 1 ? '' : 's'}
              {targetReached ? ' · one-page fit verified' : ' · page fit needs review'}
            </p>
          </div>
          <button
            onClick={api.showEditor}
            disabled={busy}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs hover:border-[var(--color-accent)] disabled:opacity-40"
          >
            Edit YAML
          </button>
          <button
            onClick={discard}
            disabled={busy}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-bad)] hover:border-[var(--color-bad)] disabled:opacity-40"
          >
            Discard
          </button>
          <button
            onClick={() => void accept()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-[var(--color-ok)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {phase === 'accepting' ? <Spinner className="border-t-white" /> : null}
            {phase === 'accepting' ? 'Saving…' : 'Accept & save'}
          </button>
        </div>
      ) : null}

      {ops.length && expanded ? (
        <ul className="max-h-52 divide-y divide-[var(--color-border)] overflow-y-auto border-t border-[var(--color-border)]">
          {ops.map((op, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-2)]">
              <input
                type="checkbox"
                checked={!off.has(i)}
                onChange={() => toggle(i)}
                disabled={busy || manualChanges || snapshot === null}
                className="mt-1 shrink-0 accent-[var(--color-accent)]"
                aria-label={`keep: ${op.why}`}
              />
              <button onClick={() => api.jumpTo(op.path)} className="min-w-0 flex-1 text-left">
                <span className={cn('block text-[11px] leading-snug', off.has(i) ? 'text-[var(--color-faint)] line-through' : 'text-[var(--color-text)]')}>
                  <span className="mr-1.5 font-mono text-[10px] uppercase text-[var(--color-accent)]">{op.op}</span>
                  {op.why}
                </span>
                <span className="block truncate font-mono text-[10px] text-[var(--color-faint)]">{op.path}</span>
                <ChangePreview op={op} disabled={off.has(i)} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {rejected.length && expanded ? (
        <ul className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
          {rejected.map((r, i) => (
            <li key={i} className="px-3 py-1.5 text-[10px] leading-snug text-[var(--color-muted)]">
              <span className="mr-1.5 font-mono uppercase text-[var(--color-warn)]">skipped</span>
              {r.why}
              <span className="ml-1 font-mono text-[var(--color-faint)]">{r.op.path}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {gaps.length && expanded ? (
        <div className="border-t border-[var(--color-border)] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">
            Gaps · nothing in the profile answers these
          </p>
          <ul className="mt-1 space-y-0.5">
            {gaps.map((g, i) => (
              <li key={i} className="text-[11px] leading-snug text-[var(--color-muted)]">
                · {g}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-[var(--color-faint)]">
            These will be written to tailoring-notes.md only if you accept. If one is actually true of you,
            add it on the Profile tab and tailor again.
          </p>
        </div>
      ) : null}
      <div ref={streamEndRef} />
    </div>
  )
}

function ChangePreview({ op, disabled }: { op: Op; disabled: boolean }) {
  if (op.op === 'reword') {
    return (
      <span className={cn('mt-1 block space-y-0.5 text-[10px] leading-snug', disabled && 'opacity-60')}>
        <span className="block text-[var(--color-bad)]">− {shorten(op.from)}</span>
        <span className="block text-[var(--color-ok)]">+ {shorten(op.to)}</span>
      </span>
    )
  }
  if (op.op === 'import') {
    return <span className="mt-1 block text-[10px] text-[var(--color-ok)]">+ {shorten(op.to ?? op.sourceExpect)} (from master)</span>
  }
  if (op.op === 'set') {
    return (
      <span className={cn('mt-1 block space-y-0.5 text-[10px] leading-snug', disabled && 'opacity-60')}>
        {op.expect ? <span className="block text-[var(--color-bad)]">− {shorten(op.expect)}</span> : null}
        <span className="block text-[var(--color-ok)]">+ {shorten(op.value)}</span>
      </span>
    )
  }
  if (op.op === 'drop') {
    return <span className="mt-1 block text-[10px] text-[var(--color-bad)]">− {shorten(op.expect)}</span>
  }
  const reordered = reorderLabels(op)
  return (
    <span className={cn('mt-1 block space-y-0.5 text-[10px] leading-snug', disabled && 'opacity-60')}>
      {reordered.before ? <span className="block text-[var(--color-bad)]">− {reordered.before}</span> : null}
      <span className="block text-[var(--color-ok)]">+ {reordered.after}</span>
    </span>
  )
}

function shorten(value: string | null | undefined): string {
  if (!value) return 'content at this path'
  let readable = value
  if (value.startsWith('{')) {
    try {
      const item = JSON.parse(value) as Record<string, unknown>
      readable = [item.position, item.company, item.name, item.label, item.details]
        .filter((part): part is string => typeof part === 'string')
        .join(' · ') || value
    } catch {
      // The stored fingerprint can also be an ordinary string beginning with {.
    }
  }
  return readable.length > 220 ? `${readable.slice(0, 217)}…` : readable
}

function reorderLabels(op: Op): { before: string | null; after: string } {
  try {
    const parsed = JSON.parse(op.expect ?? '') as unknown
    const items = op.path === 'cv.sections' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed)
      : parsed
    if (!Array.isArray(items)) throw new Error('not an array')
    const labels = items.map(itemLabel)
    return {
      before: labels.join(' → '),
      after: (op.order ?? []).map((index) => labels[index] ?? `item ${index + 1}`).join(' → '),
    }
  } catch {
    return {
      before: null,
      after: (op.order ?? []).map((index) => `item ${index + 1}`).join(' → '),
    }
  }
}

function itemLabel(value: unknown, index: number): string {
  if (typeof value === 'string') return shorten(value)
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    const label = [item.position, item.company, item.name, item.label]
      .find((part): part is string => typeof part === 'string' && part.length > 0)
    if (label) return shorten(label)
  }
  return `item ${index + 1}`
}

function clearAutoTailorParam() {
  const url = new URL(window.location.href)
  url.searchParams.delete('autoTailor')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}
