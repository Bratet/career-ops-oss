import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import { get } from '@/lib/renderStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const pdfPath = get(token)
  if (!pdfPath) return new NextResponse('expired', { status: 404 })

  try {
    const buf = await readFile(pdfPath)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'inline; filename="preview.pdf"',
        'cache-control': 'no-store',
      },
    })
  } catch {
    return new NextResponse('gone', { status: 404 })
  }
}
