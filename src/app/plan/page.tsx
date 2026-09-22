import { savedSearchStore } from '@/lib/savedSearches'
import { ApplyPlan } from './plan'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const data = await savedSearchStore.read()
  return <ApplyPlan initial={data} />
}
