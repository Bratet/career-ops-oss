import { allModels, allStatuses, readSettings, AI_FEATURES, modelFor } from '@/lib/engine'
import { SettingsPanel, type SettingsFeature } from './settings-panel'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [settings, statuses, models] = await Promise.all([readSettings(), allStatuses(), allModels()])
  const features = Object.fromEntries(AI_FEATURES.map((feature) => {
    const choice = settings.features[feature]
    return [feature, { engine: choice.engine, model: modelFor(choice, choice.engine) }]
  })) as Record<SettingsFeature, { engine: 'claude' | 'codex'; model: string }>

  return <SettingsPanel initial={{ features, statuses, models }} />
}
