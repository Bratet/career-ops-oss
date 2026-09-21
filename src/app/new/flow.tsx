'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, CardHeader, Badge, Spinner } from '@/components/ui/primitives'
import { readNdjson } from '@/lib/ndjson'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import { cn } from '@/lib/utils'
import type { SkillSummary } from '@/lib/skills/types'
import { FeatureEnginePicker } from '@/components/FeatureEnginePicker'
import { GeneralApplicationForm } from '@/components/GeneralApplicationForm'

type Step = 'paste' | 'analyzing' | 'review' | 'creating'

export function NewApplicationFlow() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('paste')
  const [noJd, setNoJd] = useState(false)
  const [manualBusy, setManualBusy] = useState(false)
  const [jd, setJd] = useState('')
  const [url, setUrl] = useState('')
  const [analysis, setAnalysis] = useState<JdAnalysis | null>(null)
  const [progress, setProgress] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [skillId, setSkillId] = useState('analyze-job')
  const [runId, setRunId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/skills')
      .then((response) => response.json())
      .then((data) => setSkills((data.skills as SkillSummary[]).filter((skill) => skill.runner === 'job-analysis')))
      .catch(() => setSkills([]))
  }, [])

  const [createdKey, setCreatedKey] = useState<string | null>(null)

  async function analyze() {
    setStep('analyzing')
    setError(null)
    setProgress([])
    setRunId(null)

    try {
      const r = await fetch('/api/jd', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jd, skillId }),
      })

      if (!r.ok) {
        setError((await r.json()).error ?? 'analysis failed')
        setStep('paste')
        return
      }

      let completed: JdAnalysis | null = null
      let completedRun: string | null = null
      let failed = false
      // One event per line, so progress shows while the model works.
      await readNdjson(r, (e) => {
        if (e.type === 'start') {
          setProgress((p) => [...p, `engine: ${e.engine} · ${e.skillId} v${e.skillVersion}`])
          if (typeof e.runId === 'string') { setRunId(e.runId); completedRun = e.runId }
        }
        if (e.type === 'progress') setProgress((p) => [...p, e.message as string])
        if (e.type === 'error') { failed = true; setError(e.message as string); setStep('paste') }
        if (e.type === 'done') { completed = e.analysis as JdAnalysis; setAnalysis(completed) }
      })
      if (!failed && !completed) throw new Error('Analysis ended without a result. Please retry.')
      if (!failed && completed) await create(completed, completedRun)
    } catch (e) {
      setError((e as Error).message)
      setStep('paste')
    }
  }

  async function create(result = analysis, analysisRun = runId) {
    if (!result) return
    setStep('creating')
    setError(null)
    try {
      const r = await fetch('/api/applications/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analysis: result, jd, url, runId: analysisRun }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'create failed'); setStep('review'); return }
      setCreatedKey(d.key)
      router.push(`/applications/${d.key}?tab=overview`)
    } catch (e) {
      setError((e as Error).message)
      setStep('review')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">New application</h1>
        <p className="text-xs text-[var(--color-faint)]">
          {noJd ? 'Add the company details and start from your general resume.' : 'Analyze the posting, then discuss eligibility and gaps with the AI. Tailor your resume when you’re ready.'}
        </p>
      </div>

      {step === 'creating' ? <p role="status" className="text-sm text-[var(--color-muted)]">{progress.at(-1) ?? 'Opening your analysis…'}</p> : null}
      {createdKey && error ? <Link href={`/applications/${createdKey}?tab=overview`} className="text-sm text-[var(--color-accent)] underline">Open the analysis workspace</Link> : null}
      {error ? (
        <Card className="border-[var(--color-bad-soft)]">
          <p className="px-4 py-2.5 text-xs text-[var(--color-bad)]">{error}</p>
        </Card>
      ) : null}

      {step === 'paste' ? <div className="flex gap-2">
        <button disabled={manualBusy} aria-pressed={!noJd} onClick={() => setNoJd(false)} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs aria-pressed:bg-[var(--color-surface-2)]">I have a job description</button>
        <button disabled={manualBusy} aria-pressed={noJd} onClick={() => setNoJd(true)} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs aria-pressed:bg-[var(--color-surface-2)]">No job description</button>
      </div> : null}
      {noJd ? <Card><GeneralApplicationForm onBusy={setManualBusy} /></Card> : null}

      {!noJd && (step === 'paste' || step === 'analyzing') ? (
        <Card>
          <CardHeader title="Job posting" hint="Paste it verbatim. The source URL is stored on line 1 of jd.md." />
          <div className="space-y-3 p-4">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… (source URL, optional but recommended)"
              className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-[13px] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)]"
            />
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={16}
              disabled={step === 'analyzing'}
              className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-xs leading-relaxed outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)] disabled:opacity-60"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={analyze}
                disabled={jd.trim().length < 40 || step === 'analyzing'}
                className="flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40"
              >
                {step === 'analyzing' ? <Spinner className="border-t-[var(--color-bg)]" /> : null}
                {step === 'analyzing' ? 'Analyzing…' : 'Analyze job'}
              </button>
              <FeatureEnginePicker feature="job-analysis" disabled={step === 'analyzing'} />
              <select
                value={skillId}
                onChange={(event) => setSkillId(event.target.value)}
                disabled={step === 'analyzing'}
                aria-label="Job analysis skill"
                className="h-8 max-w-52 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-muted)] outline-none focus:border-[var(--color-accent)] disabled:opacity-40"
              >
                {skills.length ? skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>{skill.name} · v{skill.version}</option>
                )) : <option value="analyze-job">Analyze job posting</option>}
              </select>
              <Link href={`/skills/${skillId}`} className="text-xs text-[var(--color-accent)] hover:underline">Edit skill</Link>
              <span className="text-xs text-[var(--color-faint)] tnum">{jd.length.toLocaleString()} chars</span>
              {progress.length ? (
                <span className="truncate text-xs text-[var(--color-faint)]">{progress[progress.length - 1]}</span>
              ) : null}
            </div>
            {step === 'analyzing' ? (
              <p className="text-[11px] text-[var(--color-faint)]">
                This runs your local CLI against your subscription, so it can take up to a minute.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {analysis && step === 'review' && !createdKey ? (
        <>
          {runId ? (
            <div className="flex justify-end">
              <Link href={`/runs/${runId}`} className="text-xs text-[var(--color-accent)] hover:underline">Inspect analysis run →</Link>
            </div>
          ) : null}
          <Card>
            <CardHeader
              title="What the engine read"
              hint="Check this before creating the folder. Everything below comes from the posting."
              action={
                <button onClick={() => setStep('paste')} className="text-xs text-[var(--color-accent)] hover:underline">
                  Edit posting
                </button>
              }
            />
            <div className="grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
              <Field label="Company" value={analysis.company} />
              <Field label="Role" value={analysis.role} />
              <Field label="Archetype" value={analysis.archetype} />
              <Field label="Seniority" value={analysis.seniority} />
              <Field label="Location" value={analysis.location} />
              <Field label="Work mode" value={analysis.workMode} />
              <Field label="Language" value={analysis.language === 'fr' ? 'French → FR master' : 'English → EN master'} />
              <Field label="Paper" value={analysis.paperSize} />
              <Field label="Sponsorship" value={analysis.sponsorship} />
            </div>
            {analysis.summary ? (
              <p className="border-t border-[var(--color-border)] px-5 py-3 text-[13px] leading-relaxed text-[var(--color-muted)]">
                {analysis.summary}
              </p>
            ) : null}
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Requirements"
                hint={`${analysis.requirements.filter((r) => r.weight === 'must').length} must · ${analysis.requirements.filter((r) => r.weight === 'nice').length} nice`}
              />
              <ul className="max-h-80 divide-y divide-[var(--color-border)] overflow-y-auto">
                {[...analysis.requirements].sort((a, b) =>
                  a.weight === b.weight ? a.rank - b.rank : a.weight === 'must' ? -1 : 1,
                ).map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 px-5 py-2">
                    <Badge tone={r.weight === 'must' ? 'accent' : 'neutral'}>{r.weight} {r.rank}</Badge>
                    <span className="min-w-0 text-[13px] leading-snug text-[var(--color-muted)]">
                      <span className="block text-[var(--color-text)]">{r.text}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--color-faint)]">{r.priorityReason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Keywords" hint={`${analysis.keywords.length} extracted`} />
              <div className="flex flex-wrap gap-1.5 p-5">
                {analysis.keywords.length ? (
                  analysis.keywords.map((k) => <Badge key={k}>{k}</Badge>)
                ) : (
                  <p className="text-xs text-[var(--color-faint)]">None named in the posting.</p>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="flex-1">
                <p className="text-[13px]">Create the application folder</p>
                <p className="mt-0.5 text-xs text-[var(--color-faint)]">
                  Writes <code>jd.md</code>, a tailored resume YAML seeded from your{' '}
                  {analysis.language === 'fr' ? 'FR' : 'EN'} master, and <code>tailoring-notes.md</code> with the
                  requirement map. Review the analysis and clarify questions with the AI before requesting tailoring.
                </p>
              </div>
              <button
                onClick={() => void create()}
                className={cn(
                  'flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-bg)] hover:opacity-90',
                )}
              >
                Retry preparation
              </button>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--color-faint)]">{label}</p>
      <p className="mt-0.5 text-[13px]">{value || <span className="text-[var(--color-faint)]">—</span>}</p>
    </div>
  )
}
