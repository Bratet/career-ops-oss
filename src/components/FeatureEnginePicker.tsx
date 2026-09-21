'use client'

import { useEffect, useState } from 'react'
import type { AiFeature } from '@/lib/engine'
import type { EngineStatus, ModelOption } from '@/lib/engine/types'

interface EngineState {
  feature: AiFeature
  engine: string
  model: string
  models: Record<string, ModelOption[]>
  statuses: EngineStatus[]
}

export function FeatureEnginePicker({
  feature,
  disabled = false,
  compact = false,
  onEngineChange,
}: {
  feature: AiFeature
  disabled?: boolean
  compact?: boolean
  onEngineChange?: () => void
}) {
  const [state, setState] = useState<EngineState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/engine?feature=${encodeURIComponent(feature)}`, { cache: 'no-store' })
      .then(async (response) => {
        const value = await response.json()
        if (!response.ok) throw new Error(value.error ?? 'could not load AI preference')
        return value
      })
      .then((value) => { if (alive) setState(value as EngineState) })
      .catch(() => { if (alive) setState(null) })
    return () => { alive = false }
  }, [feature])

  async function save(patch: { engine?: string; model?: string }) {
    const previousEngine = state?.engine
    setSaving(true)
    try {
      const response = await fetch('/api/engine', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feature, ...patch }),
      })
      const data = await response.json() as EngineState & { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'could not save AI preference')
      setState(data)
      if (patch.engine && patch.engine !== previousEngine) onEngineChange?.()
    } finally {
      setSaving(false)
    }
  }

  const models = state?.models[state.engine] ?? []
  const modelListed = models.some((model) => model.id === state?.model)
  const status = state?.statuses.find((item) => item.id === state.engine)
  const blocked = disabled || saving || !state
  const selectClass = `${compact ? 'h-7' : 'h-8'} rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-muted)] outline-none focus:border-[var(--color-accent)] disabled:opacity-40`

  return (
    <div className="flex items-center gap-1.5" title={status?.ok ? status.version : status?.reason ?? 'Loading AI preference…'}>
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">LLM</span>
      <select
        value={state?.engine ?? ''}
        onChange={(event) => void save({ engine: event.target.value })}
        disabled={blocked}
        aria-label={`${feature} AI engine`}
        className={selectClass}
      >
        {!state ? <option value="">Loading…</option> : null}
        {state?.statuses.map((item) => (
          <option key={item.id} value={item.id}>{item.id}{item.ok ? '' : ' (unavailable)'}</option>
        ))}
      </select>
      <select
        value={state?.model ?? ''}
        onChange={(event) => void save({ model: event.target.value })}
        disabled={blocked}
        aria-label={`${feature} AI model`}
        className={`${selectClass} max-w-52`}
      >
        {!modelListed && state ? <option value={state.model}>{state.model || 'CLI default'}</option> : null}
        {models.map((model) => (
          <option key={model.id || 'default'} value={model.id}>{model.label}</option>
        ))}
      </select>
    </div>
  )
}
