import { parseClaudeCatalog } from '../src/lib/engine/claudeModels'
import { mergeCodexCatalogs, parseCodexCache, parseCodexCatalog } from '../src/lib/engine/codexModels'

let failures = 0
function check(name: string, condition: boolean) {
  if (condition) console.log(`  ok   ${name}`)
  else { failures++; console.log(`  FAIL ${name}`) }
}

console.log('claude model catalog')

const page = `
| Feature | Claude Fable 5.1 | Claude Opus 5.5 | Claude Sonnet 5.5 | Claude Haiku 4.5 |
| :------ | :--------------- | :-------------- | :---------------- | :--------------- |
| Claude API ID | \`claude-fable-5-1\` | \`claude-opus-5-5\` | \`claude-sonnet-5-5\` | \`claude-haiku-4-5-20251001\` |
| Amazon Bedrock ID | \`anthropic.claude-fable-5-1\` | \`anthropic.claude-opus-5-5\` | \`anthropic.claude-sonnet-5-5\` | \`anthropic.claude-haiku-4-5\` |

Legacy models (still available): [Claude Opus 5](https://platform.claude.com/docs/en/models/opus-5/overview), [Claude Opus 4.8](https://platform.claude.com/docs/en/models/opus-4-8/overview), [Claude Opus 4.10](https://platform.claude.com/docs/en/models/opus-4-10/overview), [Claude Sonnet 4.6](https://platform.claude.com/docs/en/models/sonnet-4-6/overview).
`

const models = parseClaudeCatalog(page)
const ids = models.map((model) => model.id)
check('current models come from the API ID row', ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001'].every((id) => ids.includes(id)))
check('labels drop the "Claude" prefix', models.find((model) => model.id === 'claude-sonnet-5-5')?.label === 'Sonnet 5.5')
check('legacy models come from the link list', ids.includes('claude-opus-4-8') && ids.includes('claude-sonnet-4-6'))
check('cloud-provider ids are ignored', !ids.some((id) => id.startsWith('anthropic.')))
check('no family aliases are offered', !ids.some((id) => ['opus', 'sonnet', 'haiku', 'fable', ''].includes(id)))
check('families in order, newest first', JSON.stringify(ids) === JSON.stringify([
  'claude-fable-5-1',
  'claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-10', 'claude-opus-4-8',
  'claude-sonnet-5-5', 'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]))
check('a reshaped page yields nothing rather than junk', parseClaudeCatalog('# Models\n\nNothing tabular here.').length === 0)

console.log('codex model catalog')

const codexPage = `
<ModelDetails
  client:load
  name="gpt-6-astra"
  slug="gpt-6-astra"
  description="Our most capable model."
/>
Prose that mentions \`gpt-6-sol\` is not a card.
<ModelDetails name="gpt-6.1-sol" slug="gpt-6.1-sol" description="Workhorse." />
<ModelDetails name="gpt-7-nova" slug="gpt-7-nova" />
`
const cards = parseCodexCatalog(codexPage)
check('cards come from ModelDetails slugs in page order', JSON.stringify(cards.map((m) => m.id)) === JSON.stringify(['gpt-6-astra', 'gpt-6.1-sol', 'gpt-7-nova']))
check('prose mentions are not models', !cards.some((m) => m.id === 'gpt-6-sol'))
check('page labels match Codex naming', cards[1].label === 'GPT-6.1-Sol' && cards[0].note === 'Our most capable model.')
check('a page without cards yields nothing', parseCodexCatalog('# Models').length === 0)

const account = parseCodexCache({ models: [
  { slug: 'gpt-6-sol', display_name: 'GPT-6-Sol', visibility: 'list', priority: 3 },
  { slug: 'gpt-6.1-sol', display_name: 'GPT-6.1-Sol', visibility: 'list', priority: 1 },
  { slug: 'gpt-reserve', visibility: 'hide', priority: 2 },
  { slug: 'gpt-6-astra', display_name: 'GPT-6-Astra', visibility: 'list', priority: 2 },
] })
check('account list follows Codex priority and skips hidden models', JSON.stringify(account.map((m) => m.id)) === JSON.stringify(['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol']))
check('a malformed Codex file yields nothing', parseCodexCache({ models: 'nope' }).length === 0 && parseCodexCache(null).length === 0)

const merged = mergeCodexCatalogs(cards, account).map((m) => m.id)
check('merge lists models Codex has not seen yet first, without duplicates', JSON.stringify(merged) === JSON.stringify(['gpt-7-nova', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol']))
check('merge works with either source missing', mergeCodexCatalogs([], account).length === 3 && mergeCodexCatalogs(cards, []).length === 3)

if (failures) {
  console.log(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nall model catalog checks passed')
