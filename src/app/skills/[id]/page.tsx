import { notFound } from 'next/navigation'
import { getSkill, listSkillRevisions } from '@/lib/skills/registry'
import { SkillEditor } from '../skill-editor'

export const dynamic = 'force-dynamic'

export default async function SkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const [skill, revisions] = await Promise.all([getSkill(id), listSkillRevisions(id)])
    return <SkillEditor initialSkill={skill} initialRevisions={revisions} />
  } catch {
    notFound()
  }
}
