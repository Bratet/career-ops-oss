'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { YamlEditor } from './YamlEditor'
import { EditorChat } from './EditorChat'
import { PdfPreview } from './PdfPreview'
import { Card, Badge, Empty } from './ui/primitives'
import { findPathOffset } from '@/lib/yamlPath'
import { cn } from '@/lib/utils'

interface Failure { kind: string; where: string; why: string }

interface RenderState {
  token: string | null
  pages: number | null
  fill: number | null
  failures: Failure[]
  notes: string[]
  ms: number
}

const DEBOUNCE_MS = 180

/** What a tools panel gets to work with. The pane keeps owning the buffer and the view. */
export interface EditorApi {
  text: string
  setText: (yaml: string) => void
  jumpTo: (path: string) => void
  save: (yaml?: string) => Promise<void>
  markSaved: () => void
  setReviewPending: (pending: boolean) => void
  reviewPending: boolean
  showEditor: () => void
  pages: number | null
  fill: number | null
}

export function EditorPane({
  initialYaml,
  mode,
  title,
  onSave,
  tools,
  applicationKey,
  chatScope,
  general = false,
}: {
  initialYaml: string
  mode: 'master' | 'tailored'
  title: string
  onSave?: (yaml: string) => Promise<void>
  /** Rendered under the rule panel. The master editor passes none. */
  tools?: (api: EditorApi) => ReactNode
  /** Adds the posting and application files to editor-chat context. */
  applicationKey?: string
  /** Keeps chat history isolated to this exact resume document. */
  chatScope: string
  general?: boolean
}) {
  const [text, setText] = useState(initialYaml)
  const [state, setState] = useState<RenderState | null>(null)
  const [rendering, setRendering] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reviewPending, setReviewPending] = useState(false)
  const [tab, setTab] = useState<'chat' | 'editor'>('chat')

  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRenderRef = useRef<string | null>(null)
  const stoppedRef = useRef(false)

  const render = useCallback(
    async (yaml: string) => {
      // Let the current compile finish and remember only the newest buffer. This
      // produces regular live updates while typing instead of repeatedly killing
      // RenderCV before it can show anything.
      if (abortRef.current) {
        pendingRenderRef.current = yaml
        return
      }
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setRendering(true)

      try {
        const r = await fetch('/api/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ yaml, mode: general ? 'general' : mode }),
          signal: ctrl.signal,
        })
        const d = await r.json()
        // An invalid intermediate edit should report its errors without
        // blanking the last good preview.
        setState((current) => ({ ...d, token: d.token ?? current?.token ?? null }))
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setState((current) => ({
            token: current?.token ?? null,
            pages: null,
            fill: null,
            notes: [],
            ms: 0,
            failures: [{ kind: 'render', where: 'network', why: (err as Error).message }],
          }))
        }
      } finally {
        if (abortRef.current !== ctrl) return
        abortRef.current = null
        const pending = pendingRenderRef.current
        pendingRenderRef.current = null
        if (pending !== null && pending !== yaml && !stoppedRef.current) {
          void render(pending)
        } else {
          setRendering(false)
        }
      }
    },
    [mode, general],
  )

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    // A completed word starts rendering immediately. Other edits wait for a
    // very short pause, which avoids compiling every partial word.
    const delay = /(?:\s|[.,;:!?])$/.test(text) ? 0 : DEBOUNCE_MS
    timerRef.current = setTimeout(() => void render(text), delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [text, render])

  useEffect(() => {
    stoppedRef.current = false
    return () => {
      stoppedRef.current = true
      pendingRenderRef.current = null
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => { setSaved(false) }, [text])

  function jumpTo(path: string) {
    const view = editorRef.current?.view
    if (!view) return
    const offset = findPathOffset(text, path)
    if (offset === null) return
    view.dispatch({ selection: { anchor: offset }, scrollIntoView: true })
    view.focus()
  }

  async function save(yaml = text) {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(yaml)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const failures = state?.failures ?? []
  const blocking = failures.filter((f) => f.kind === 'yaml' || f.kind === 'render')
  const api: EditorApi = {
    text,
    setText,
    jumpTo,
    save,
    markSaved: () => setSaved(true),
    setReviewPending,
    reviewPending,
    showEditor: () => setTab('editor'),
    pages: state?.pages ?? null,
    fill: state?.fill ?? null,
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold">{title}</h1>
          <Badge tone={mode === 'master' ? 'neutral' : 'accent'}>{general ? 'general' : mode}</Badge>
          {state ? (
            <span className="text-xs text-[var(--color-faint)] tnum">{state.ms}ms</span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <PageBadge pages={state?.pages ?? null} fill={state?.fill ?? null} mode={mode} />
          {onSave ? (
            <button
              onClick={() => void save()}
              disabled={saving || reviewPending}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : reviewPending ? 'Review proposal below' : saved ? 'Saved ✓' : 'Save'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5" role="tablist" aria-label="CV editing mode">
            {(['chat', 'editor'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs capitalize transition-colors',
                  tab === value
                    ? 'bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
                )}
              >
                {value === 'chat' ? 'Chat with AI' : 'YAML editor'}
              </button>
            ))}
            <span className="ml-auto pr-1 text-[10px] text-[var(--color-faint)]">
              {tab === 'chat' ? 'AI edits the current buffer' : 'Edit it yourself'}
            </span>
          </div>

          <div className={cn('min-h-0 flex-1 flex-col', tab === 'editor' ? 'flex' : 'hidden')}>
            <div className="min-h-0 flex-1 overflow-hidden">
              <YamlEditor ref={editorRef} value={text} onChange={setText} />
            </div>
            <ValidationPanel failures={failures} notes={state?.notes ?? []} onJump={jumpTo} />
          </div>
          <div className={cn('min-h-0 flex-1 flex-col', tab === 'chat' ? 'flex' : 'hidden')}>
            <EditorChat
              api={api}
              mode={mode}
              applicationKey={applicationKey}
              chatScope={chatScope}
              tailoring={tools?.(api)}
            />
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          {state?.token ? (
            <PdfPreview token={state.token} />
          ) : blocking.length ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <p className="text-sm text-[var(--color-bad)]">Cannot render</p>
              <p className="max-w-md font-mono text-xs leading-relaxed text-[var(--color-muted)]">{blocking[0].why}</p>
            </div>
          ) : (
            <Empty title={rendering ? 'Rendering…' : 'No preview yet'} hint="The PDF appears here once the YAML renders." />
          )}
        </Card>
      </div>
    </div>
  )
}

/** One page and 95%+ fill is the target for a tailored CV; a master has no limit. */
function PageBadge({ pages, fill, mode }: { pages: number | null; fill: number | null; mode: 'master' | 'tailored' }) {
  if (pages === null) return null

  const overflow = mode === 'tailored' && pages !== 1
  const thin = mode === 'tailored' && pages === 1 && fill !== null && fill < 95

  return (
    <div className="flex items-center gap-2">
      <Badge tone={overflow ? 'bad' : 'neutral'}>
        {pages} page{pages === 1 ? '' : 's'}
      </Badge>
      {fill !== null ? (
        <div className="flex items-center gap-1.5" title={`first-page fill ${fill}%`}>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, fill)}%`,
                background: overflow || thin ? 'var(--color-warn)' : 'var(--color-ok)',
              }}
            />
          </div>
          <span className="text-[11px] text-[var(--color-faint)] tnum">{fill}%</span>
        </div>
      ) : null}
    </div>
  )
}

const KIND_TONE: Record<string, string> = {
  'forbidden-name': 'var(--color-bad)',
  location: 'var(--color-bad)',
  'em-dash': 'var(--color-warn)',
  placeholder: 'var(--color-warn)',
  design: 'var(--color-warn)',
  'page-count': 'var(--color-bad)',
  yaml: 'var(--color-bad)',
  render: 'var(--color-bad)',
}

function ValidationPanel({
  failures, notes, onJump,
}: {
  failures: Failure[]
  notes: string[]
  onJump: (path: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="shrink-0 border-t border-[var(--color-border)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-surface-2)]"
      >
        <span className={cn('size-1.5 rounded-full', failures.length ? 'bg-[var(--color-bad)]' : 'bg-[var(--color-ok)]')} />
        <span className="font-medium">
          {failures.length ? `${failures.length} rule violation${failures.length === 1 ? '' : 's'}` : 'All rules pass'}
        </span>
        {notes.length ? <span className="truncate text-[var(--color-faint)]">· {notes[0]}</span> : null}
        <span className="ml-auto text-[var(--color-faint)]">{open ? '▾' : '▸'}</span>
      </button>

      {open && failures.length > 0 ? (
        <ul className="max-h-44 overflow-y-auto border-t border-[var(--color-border)]">
          {failures.map((f, i) => (
            <li key={i}>
              <button
                onClick={() => onJump(f.where)}
                className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
              >
                <span
                  className="mt-1 size-1.5 shrink-0 rounded-full"
                  style={{ background: KIND_TONE[f.kind] ?? 'var(--color-muted)' }}
                />
                <span className="min-w-0">
                  <span className="block font-mono text-[11px] text-[var(--color-accent)]">{f.where}</span>
                  <span className="block text-[11px] leading-snug text-[var(--color-muted)]">{f.why}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
