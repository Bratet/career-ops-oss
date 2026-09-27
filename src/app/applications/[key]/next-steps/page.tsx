import { notFound } from 'next/navigation'
import { getApplication } from '@/lib/applications'
import { readWorkspace } from '@/lib/workspaces'
import { NextSteps } from './next-steps'

export const dynamic = 'force-dynamic'

export default async function NextStepsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const app = await getApplication(key)
  if (!app) notFound()
  const workspace = await readWorkspace(key)
  return <NextSteps app={app} initialDrafts={workspace.outreach ?? {}} />
}
