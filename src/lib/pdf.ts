import { readFile } from 'fs/promises'

/**
 * Page count and first-page fill, read straight from the PDF.
 *
 * "Fill" is how far down the first page the lowest piece of text sits, as a
 * percentage of page height. It is the number the one-page rule is tuned
 * against: the target for a tailored CV is 95%+, because a half-empty page reads
 * as a thin candidate, and under 80% means there is room for another bullet.
 */

export interface PageInfo {
  pages: number
  fill: number
}

// pdfjs ships an ESM build that expects a browser; the legacy build is the one
// that runs under Node. Imported lazily so the cost lands only on a real render.
type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjs: PdfjsModule | null = null

async function load(): Promise<PdfjsModule> {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  }
  return pdfjs
}

export async function pdfPageInfo(pdfPath: string): Promise<PageInfo | null> {
  try {
    const { getDocument } = await load()
    const data = new Uint8Array(await readFile(pdfPath))
    const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise

    try {
      const page = await doc.getPage(1)
      const height = page.view[3] - page.view[1]
      const content = await page.getTextContent()

      // transform[5] is the text baseline's y in PDF space, which grows upward.
      // The lowest text is therefore the smallest y, and fill measures from the
      // top of the page down to it.
      let lowest = height
      for (const item of content.items) {
        if (!('transform' in item)) continue
        const y = item.transform[5]
        if (Number.isFinite(y)) lowest = Math.min(lowest, y)
      }

      const fill = content.items.length === 0 ? 0 : Math.round(((height - lowest) / height) * 100)
      return { pages: doc.numPages, fill: Math.max(0, Math.min(100, fill)) }
    } finally {
      await doc.destroy()
    }
  } catch (err) {
    // A missing or unreadable PDF is reported as unverified rather than as a
    // rule violation; the caller decides what that means. It is logged because
    // a silent null here once hid a bundler misconfiguration for an hour.
    console.warn('[pdf] page info unavailable:', (err as Error).message)
    return null
  }
}
