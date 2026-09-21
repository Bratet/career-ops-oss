import { readFile } from 'fs/promises'
import { eligibilityIssues, type CandidateEligibility } from '@/lib/eligibility'
import { notFound } from 'next/navigation'
import { getApplication, readDoc } from '@/lib/applications'
import { APP_FILES, PATHS } from '@/lib/paths'
import { jdAnalysisParser } from '@/lib/tailoring/jd'
import { readWorkspace } from '@/lib/workspaces'
import { ApplicationWorkspaceView } from './workspace'

export const dynamic = 'force-dynamic'

export default async function ApplicationPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const app = await getApplication(key)
  if (!app) notFound()
  const folder = app.folder?.folder
  const [analysisText, workspace] = await Promise.all([
    folder ? readDoc(folder, APP_FILES.analysis) : null,
    readWorkspace(key),
  ])
  let analysis = null
  if (analysisText) {
    try {
      const parsed = jdAnalysisParser.safeParse(JSON.parse(analysisText))
      if (parsed.success) analysis = parsed.data
    } catch {}
  }
  const eligibility = JSON.parse(await readFile(PATHS.candidateEligibility, 'utf-8')) as CandidateEligibility
  return <ApplicationWorkspaceView eligibility={analysis ? eligibilityIssues(analysis, eligibility) : []} app={app} initialWorkspace={workspace} analysis={analysis} />
}
