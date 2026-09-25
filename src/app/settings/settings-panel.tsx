'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Check, CircleAlert, Monitor, Moon, Sun } from 'lucide-react'
import type { AiFeature } from '@/lib/engine'
import type { EngineId, EngineStatus, ModelOption } from '@/lib/engine/types'

export type SettingsFeature = AiFeature
type Theme = 'system' | 'light' | 'dark'

interface SettingsData {
  features: Record<SettingsFeature, { engine: EngineId; model: string }>
  statuses: EngineStatus[]
  models: Record<EngineId, ModelOption[]>
}

const FEATURE_COPY: { id: SettingsFeature; title: string; description: string }[] = [
  { id: 'job-analysis', title: 'Job analysis', description: 'Read a posting and identify requirements before an application is created.' },
  { id: 'tailoring', title: 'Resume tailoring', description: 'Adapt a copy of your source resume to an application.' },
  { id: 'editor-chat', title: 'Editor chat', description: 'Discuss and revise application documents in the workspace.' },
]

const THEMES: { id: Theme; label: string; icon: typeof Monitor }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
]

export function SettingsPanel({ initial }: { initial: SettingsData }) {
  const [data, setData] = useState(initial)
  const [theme, setTheme] = useState<Theme>('system')
  const [saving, setSaving] = useState<SettingsFeature | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SettingsFeature | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('career-ops-theme')
    setTheme(stored === 'light' || stored === 'dark' ? stored : 'system')
  }, [])

  function chooseTheme(next: Theme) {
    setTheme(next)
    localStorage.setItem('career-ops-theme', next)
    document.documentElement.dataset.theme = next
  }

  async function save(feature: SettingsFeature, patch: { engine?: EngineId; model?: string }) {
    setSaving(feature)
    setError(null)
    setSaved(null)
    try {
      const response = await fetch('/api/engine', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feature, ...patch }),
      })
      const result = await response.json() as { engine?: EngineId; model?: string; error?: string }
      if (!response.ok || !result.engine || result.model === undefined) throw new Error(result.error ?? 'Could not save this AI preference.')
      setData((current) => ({ ...current, features: { ...current.features, [feature]: { engine: result.engine!, model: result.model! } } }))
      setSaved(feature)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <div className="border-b border-[var(--color-border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">Choose how the app looks and which local AI CLI handles each part of your application workflow.</p>
      </div>

      <section aria-labelledby="appearance-heading" className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <h2 id="appearance-heading" className="text-base font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Saved in this browser.</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-sm font-medium">Color theme</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">System follows your device preference.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3" role="group" aria-label="Color theme">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => chooseTheme(id)} aria-pressed={theme === id} className="flex min-h-12 items-center gap-3 rounded-lg border border-[var(--color-border)] px-4 text-left text-sm transition-colors hover:border-[var(--color-border-strong)] aria-pressed:border-[var(--color-accent)] aria-pressed:bg-[var(--color-accent-soft)] aria-pressed:text-[var(--color-accent)]">
                <Icon aria-hidden="true" className="size-4" />
                <span className="flex-1">{label}</span>
                {theme === id ? <Check aria-hidden="true" className="size-4" /> : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="ai-heading" className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <h2 id="ai-heading" className="text-base font-semibold">AI preferences</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">Each task can use its own engine and model. Changes save automatically.</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            {FEATURE_COPY.map(({ id, title, description }, index) => {
              const choice = data.features[id]
              const available = data.models[choice.engine]
              const listed = available.some((model) => model.id === choice.model)
              return (
                <div key={id} className={`grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_160px_200px] lg:items-center ${index ? 'border-t border-[var(--color-border)]' : ''}`}>
                  <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--color-muted)]">{description}</p>
                  </div>
                  <label className="text-xs font-medium text-[var(--color-muted)]">Engine
                    <select aria-label={`${title} engine`} value={choice.engine} disabled={saving === id} onChange={(event) => void save(id, { engine: event.target.value as EngineId })} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50">
                      {data.statuses.map((status) => <option key={status.id} value={status.id} disabled={!status.ok && choice.engine !== status.id}>{status.id === 'claude' ? 'Claude' : 'Codex'}{status.ok ? '' : ' (unavailable)'}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-[var(--color-muted)]">Model
                    <select aria-label={`${title} model`} value={choice.model} disabled={saving === id} onChange={(event) => void save(id, { model: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50">
                      {!listed ? <option value={choice.model}>{choice.model || 'CLI default'}</option> : null}
                      {available.map((model) => <option key={model.id || 'default'} value={model.id}>{model.label}</option>)}
                    </select>
                  </label>
                </div>
              )
            })}
          </div>
          {error ? <p role="alert" className="flex items-center gap-2 text-sm text-[var(--color-bad)]"><CircleAlert className="size-4" />{error}</p> : null}
          {saved ? <p role="status" className="flex items-center gap-2 text-xs text-[var(--color-ok)]"><Check className="size-4" />{FEATURE_COPY.find((item) => item.id === saved)?.title} preference saved.</p> : null}
          <div className="rounded-xl bg-[var(--color-surface-2)] p-4">
            <p className="text-xs font-medium">Local CLI status</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {data.statuses.map((status) => <span key={status.id} className="text-xs text-[var(--color-muted)]"><span className={`mr-1.5 inline-block size-2 rounded-full ${status.ok ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-bad)]'}`} aria-hidden="true" />{status.id === 'claude' ? 'Claude' : 'Codex'}: {status.ok ? 'ready' : status.reason ?? 'unavailable'}</span>)}
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)]">To edit the instructions behind a task, visit <Link href="/skills" className="font-medium text-[var(--color-accent)] underline underline-offset-2">Skills</Link>.</p>
        </div>
      </section>
    </div>
  )
}
