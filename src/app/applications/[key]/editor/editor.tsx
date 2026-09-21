'use client'

import Link from 'next/link'
import { EditorPane } from '@/components/EditorPane'
import { TailorPanel } from '@/components/TailorPanel'

export function TailoredEditor({
  appKey, folder, fileName, yaml, title, autoTailor,
}: {
  appKey: string
  folder: string
  fileName: string
  yaml: string
  title: string
  autoTailor: boolean
}) {
  async function save(text: string) {
    const r = await fetch(`/api/applications/${appKey}/yaml`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yaml: text, fileName }),
    })
    if (!r.ok) throw new Error((await r.json()).error ?? 'save failed')
  }

  return (
    <div className="space-y-3">
      <Link href={`/applications/${appKey}`} className="text-xs text-[var(--color-faint)] hover:text-[var(--color-accent)]">
        ← {folder}
      </Link>
      <EditorPane
        initialYaml={yaml}
        mode="tailored"
        title={title}
        onSave={save}
        applicationKey={appKey}
        chatScope={`application:${appKey}`}
        tools={(editor) => <TailorPanel appKey={appKey} api={editor} autoStart={autoTailor} />}
      />
    </div>
  )
}
