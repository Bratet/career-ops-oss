import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import { PATHS } from '@/lib/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Keep PDF.js fully local while still loading its module worker by URL. */
export async function GET() {
  try {
    const worker = await readFile(PATHS.pdfWorker, 'utf-8')
    return new NextResponse(worker, {
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse('PDF preview worker is unavailable', { status: 500 })
  }
}
