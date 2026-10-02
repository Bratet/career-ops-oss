import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { eligibilityIssues, type CandidateEligibility } from '@/lib/eligibility'
import { notFound } from 'next/navigation'
import { getApplication, readDoc, type Application } from '@/lib/applications'
import { letterFromInputs } from '@/lib/coverLetter'
import { APP_FILES, PATHS } from '@/lib/paths'
import { jdAnalysisParser } from '@/lib/tailoring/jd'
import { postingContact } from '@/lib/postingContact'
import { applicationLanguage, readWorkspace } from '@/lib/workspaces'
import { ApplicationWorkspaceView } from './workspace'

export const dynamic = 'force-dynamic'

/** The last finalized PDF's time and the source it was rendered from, or null when there is none. */
async function finalizedSource(app: Application, pdfKey: 'pdf' | 'letterPdf', sourceKey: 'yaml' | 'letterInput') {
  const folder = app.folder
  const pdf = folder?.docs.find((doc) => doc.key === pdfKey && doc.name.endsWith('.pdf'))
  const source = folder?.docs.find((doc) => doc.key === sourceKey)
  if (!folder || !pdf || !source) return null
  try {
    const [info, text] = await Promise.all([stat(join(PATHS.applications, folder.folder, pdf.name)), readDoc(folder.folder, source.name)])
    return text === null ? null : { at: info.mtime.toISOString(), text }
  } catch {
    return null
  }
}

export default async function ApplicationPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const app = await getApplication(key)
  if (!app) notFound()
  const folder = app.folder?.folder
  const [analysisText, workspace, jd, language] = await Promise.all([
    folder ? readDoc(folder, APP_FILES.analysis) : null,
    readWorkspace(key),
    folder ? readDoc(folder, APP_FILES.jd) : null,
    applicationLanguage(folder),
  ])
  let analysis = null
  if (analysisText) {
    try {
      const parsed = jdAnalysisParser.safeParse(JSON.parse(analysisText))
      if (parsed.success) analysis = parsed.data
    } catch {}
  }
  const eligibility = JSON.parse(await readFile(PATHS.candidateEligibility, 'utf-8')) as CandidateEligibility
  const [resumePdf, letterPdf] = await Promise.all([finalizedSource(app, 'pdf', 'yaml'), finalizedSource(app, 'letterPdf', 'letterInput')])
  const finalized = {
    resume: resumePdf ? { at: resumePdf.at, yaml: resumePdf.text } : null,
    letter: letterPdf ? { at: letterPdf.at, letter: letterFromInputs(letterPdf.text) } : null,
  }
  return <ApplicationWorkspaceView eligibility={analysis ? eligibilityIssues(analysis, eligibility) : []} app={app} initialWorkspace={workspace} analysis={analysis} language={language} contact={postingContact(jd)} finalized={finalized} />
}
