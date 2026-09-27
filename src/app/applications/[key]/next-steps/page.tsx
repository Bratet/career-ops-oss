import { redirect } from 'next/navigation'

/** Next steps are now step 3 of the application workspace; keep old links working. */
export default async function NextStepsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  redirect(`/applications/${encodeURIComponent(key)}?tab=next`)
}
