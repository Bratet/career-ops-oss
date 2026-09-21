import { listApplications, listFolders } from '@/lib/applications'
import { ApplicationsTable } from './table'

export const dynamic = 'force-dynamic'

export default async function ApplicationsPage() {
  const [applications, folders] = await Promise.all([listApplications(), listFolders()])
  return <ApplicationsTable applications={applications} folders={folders.map((f) => f.folder)} />
}
