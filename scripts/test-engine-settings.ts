import { AI_FEATURES, isAiFeature, parseSettings, patchFeatureSettings } from '../src/lib/engine'

let failures = 0
function check(name: string, condition: boolean) {
  if (condition) console.log(`  ok   ${name}`)
  else { failures++; console.log(`  FAIL ${name}`) }
}

console.log('feature engine settings')

const migrated = parseSettings({ engine: 'codex', models: { codex: 'gpt-test', claude: 'sonnet' } })
check('legacy engine expands to every AI feature', AI_FEATURES.every((feature) => migrated.features[feature].engine === 'codex'))
check('legacy models survive migration', AI_FEATURES.every((feature) => migrated.features[feature].models.claude === 'sonnet'))

const split = patchFeatureSettings(migrated, 'job-analysis', { engine: 'claude', model: 'haiku' })
check('feature engine changes independently', split.features['job-analysis'].engine === 'claude' && split.features.tailoring.engine === 'codex')
check('feature model attaches to selected CLI', split.features['job-analysis'].models.claude === 'haiku')
check('other feature models remain untouched', split.features.tailoring.models.claude === 'sonnet')

const explicit = parseSettings({
  features: {
    'editor-chat': { engine: 'claude', models: { claude: 'opus' } },
    tailoring: { engine: 'codex', models: { codex: 'gpt-tailor' } },
  },
})
check('explicit feature choices stay distinct', explicit.features['editor-chat'].engine === 'claude' && explicit.features.tailoring.engine === 'codex')
check('missing features receive safe defaults', explicit.features['job-analysis'].engine === 'claude')

const unified = parseSettings({
  features: {
    'job-analysis': { engine: 'claude', models: { claude: 'haiku' } },
    'profile-fit': { engine: 'codex', models: { codex: 'old-fit-model' } },
    tailoring: { engine: 'codex', models: { codex: 'tailoring-model' } },
    'editor-chat': { engine: 'claude', models: { claude: 'opus' } },
  },
})
check('existing parsing choice wins over obsolete fit settings', unified.features['job-analysis'].engine === 'claude' && unified.features['job-analysis'].models.claude === 'haiku')
check('obsolete fit setting is removed and cannot be saved independently', !('profile-fit' in unified.features) && !isAiFeature('profile-fit'))
const changed = patchFeatureSettings(unified, 'job-analysis', { engine: 'codex', model: 'analysis-model' })
check('analysis model changes independently of tailoring and chat', changed.features['job-analysis'].models.codex === 'analysis-model' && changed.features.tailoring.models.codex === 'tailoring-model' && changed.features['editor-chat'].models.claude === 'opus')
check('settings round trip preserves unified choices', JSON.stringify(parseSettings(JSON.parse(JSON.stringify(changed)))) === JSON.stringify(changed))

console.log(failures ? `\n${failures} failure(s)` : '\nall feature engine setting checks pass')
process.exit(failures ? 1 : 0)
