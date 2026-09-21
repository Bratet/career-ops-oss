'use client'

import { useEffect, useRef, useState } from 'react'
import { Empty } from './ui/primitives'

interface PreviewPage {
  url: string
  width: number
  height: number
}

export function PdfPreview({ token }: { token: string | null }) {
  const [pages, setPages] = useState<PreviewPage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pagesRef = useRef<PreviewPage[]>([])
  const generationRef = useRef(0)

  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  useEffect(() => {
    if (!token) return
    const generation = ++generationRef.current
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    async function update() {
      const response = await fetch(`/api/render/${token}`, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('preview expired before it could be displayed')
      const bytes = new Uint8Array(await response.arrayBuffer())
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = '/api/pdf-worker'
      const document = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise
      const next: PreviewPage[] = []

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber)
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(2, 1200 / base.width)
        const viewport = page.getViewport({ scale })
        const canvas = window.document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('browser could not create a preview canvas')
        await page.render({ canvasContext: context, viewport }).promise
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => value ? resolve(value) : reject(new Error('could not encode preview page')), 'image/png')
        })
        next.push({ url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height })
      }

      if (generation !== generationRef.current) {
        next.forEach((page) => URL.revokeObjectURL(page.url))
        return
      }
      const previous = pagesRef.current
      pagesRef.current = next
      setPages(next)
      previous.forEach((page) => URL.revokeObjectURL(page.url))
    }

    void update().catch((reason) => {
      if ((reason as Error).name !== 'AbortError' && generation === generationRef.current) {
        setError((reason as Error).message)
      }
    }).finally(() => {
      if (generation === generationRef.current) setLoading(false)
    })

    return () => controller.abort()
  }, [token])

  useEffect(() => () => {
    pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url))
  }, [])

  if (!pages.length && loading) {
    return <Empty title="Rendering preview" hint="The first page will appear as soon as RenderCV finishes." />
  }
  if (!pages.length && error) return <Empty title="Preview unavailable" hint={error} />
  if (!pages.length) return <Empty title="No preview yet" hint="The CV appears here once the YAML renders." />

  return (
    <div className="relative h-full overflow-y-auto bg-[var(--color-surface-2)] p-3">
      <div className="mx-auto flex max-w-[900px] flex-col gap-3">
        {pages.map((page, index) => (
          // The whole page set swaps only after the new PDF has rendered, avoiding
          // the white flash and scroll reset caused by replacing an iframe.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${token}-${index}`}
            src={page.url}
            width={page.width}
            height={page.height}
            alt={`CV preview page ${index + 1}`}
            className="h-auto w-full bg-white shadow-sm"
          />
        ))}
      </div>
      {error ? <p className="sticky bottom-2 mx-auto mt-2 w-fit rounded-md bg-[var(--color-bad-soft)] px-2 py-1 text-[10px] text-[var(--color-bad)]">{error}</p> : null}
    </div>
  )
}
