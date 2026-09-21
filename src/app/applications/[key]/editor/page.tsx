import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function TailoredEditorPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  redirect(`/applications/${encodeURIComponent(key)}?tab=resume`)
}
