import { allModels, allStatuses, readSettings, AI_FEATURES, resolvedModelFor } from '@/lib/engine'
import { SettingsPanel, type SettingsFeature } from './settings-panel'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [settings, statuses, models] = await Promise.all([readSettings(), allStatuses(), allModels()])
  const features = Object.fromEntries(await Promise.all(AI_FEATURES.map(async (feature) => {
    const choice = settings.features[feature]
    return [feature, { engine: choice.engine, model: await resolvedModelFor(choice, choice.engine) }] as const
  }))) as Record<SettingsFeature, { engine: 'claude' | 'codex'; model: string }>

  return <SettingsPanel initial={{ features, statuses, models }} />
}
