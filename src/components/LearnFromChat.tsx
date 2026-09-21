'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { EditorChatTurn } from '@/lib/chatPersistence'

interface Proposal { markdown: string; before: string; summary: string; profileNotes?: string; expectedVersion: number }

export function LearnFromChat({ turns, disabled, skillId = 'tailor-cv', onUpdateProfile }: { turns: EditorChatTurn[]; disabled: boolean; skillId?: 'tailor-cv' | 'analyze-job' | 'profile-fit'; onUpdateProfile?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedVersion, setSavedVersion] = useState<number | null>(null)

  async function propose() {
    setBusy(true); setError(null); setSavedVersion(null)
    try {
      const response = await fetch(`/api/skills/${skillId}/learn`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ turns: turns.slice(-100).map(({ role, content, proposal }) => ({ role, content, proposal: proposal ? { status: proposal.status } : undefined })) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not prepare a skill update')
      setProposal(data)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function apply() {
    if (!proposal) return
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/skills/${skillId}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ markdown: proposal.markdown, expectedVersion: proposal.expectedVersion }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not save the skill update')
      setSavedVersion(data.skill.metadata.version); setProposal(null)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  return <div className="border-b border-[var(--color-border)] px-4 py-2 text-xs">
    <button type="button" onClick={() => void propose()} disabled={disabled || busy || turns.length < 2 || !!proposal}
      className="rounded-md px-2 py-1.5 text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] focus-visible:outline focus-visible:outline-2 disabled:opacity-40">
      {busy ? 'Working on the skill update…' : skillId === 'tailor-cv' ? 'Improve tailoring skill from this chat' : skillId === 'analyze-job' ? 'Improve job-analysis skill from this chat' : 'Improve fit-analysis skill from this chat'}
    </button>
    {onUpdateProfile ? <button type="button" onClick={onUpdateProfile} disabled={disabled || busy || turns.length < 2}
      className="rounded-md px-2 py-1.5 text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] focus-visible:outline focus-visible:outline-2 disabled:opacity-40">Update profile from this chat</button> : null}
    {onUpdateProfile ? <p className="px-2 py-1 leading-relaxed text-[var(--color-muted)]">Skill updates improve how jobs are analyzed. Profile updates save facts and preferences you confirmed.</p> : null}
    {error ? <p role="alert" className="mt-2 text-[var(--color-bad)]">{error}</p> : null}
    {savedVersion ? <p role="status" className="mt-2">Saved version {savedVersion}. <Link href={`/skills/${skillId}`} className="text-[var(--color-accent)] underline">View skill and revision history</Link></p> : null}
    {proposal ? <div className="mt-2 space-y-3">
      <p className="whitespace-pre-wrap leading-relaxed">{proposal.summary}</p>
      {proposal.profileNotes ? <div className="space-y-1 border-y border-[var(--color-border)] py-3"><p className="font-medium">Belongs in your profile</p><p className="whitespace-pre-wrap leading-relaxed">{proposal.profileNotes}</p><p className="text-[var(--color-muted)]">These facts are separate from the skill update. Use “Update profile from this chat” to save confirmed changes.</p></div> : null}
      <p className="text-[var(--color-muted)]">Review the update before it affects future applications. The previous version will be kept.</p>
      <details><summary className="cursor-pointer py-1 text-[var(--color-muted)]">Current instructions</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap py-2 text-[11px]">{proposal.before}</pre></details>
      <label className="block">Proposed instructions
        <textarea aria-label="Proposed skill instructions" value={proposal.markdown} disabled={busy} onChange={(event) => setProposal({ ...proposal, markdown: event.target.value })}
          className="mt-1 h-56 w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 font-mono text-[11px] focus:border-[var(--color-accent)]" />
      </label>
      <div className="flex gap-3">
        <button type="button" onClick={() => void apply()} disabled={busy || disabled || proposal.markdown === proposal.before} className="rounded-md bg-[var(--color-accent)] px-3 py-2 font-medium text-[var(--color-bg)] disabled:opacity-40">Apply skill update</button>
        <button type="button" disabled={busy} onClick={() => { setProposal(null); setError(null) }} className="rounded-md px-3 py-2 hover:bg-[var(--color-surface-2)]">Discard</button>
      </div>
    </div> : null}
  </div>
}
