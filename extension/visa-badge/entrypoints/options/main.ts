import { browser } from 'wxt/browser'
import { REMOTE_LABELS, VISA_LABELS, type Answer } from '../../lib/jev'
import { KEY_STORAGE, type ClassifyReply, type Message } from '../../lib/messages'

const input = document.querySelector<HTMLInputElement>('#key')!
const status = document.querySelector<HTMLPreElement>('#status')!
const say = (text: string) => { status.textContent = text }

browser.storage.local.get(KEY_STORAGE).then((stored) => {
  if (stored[KEY_STORAGE]) say('A key is saved.')
})

document.querySelector('#save')!.addEventListener('click', async () => {
  const key = input.value.trim()
  if (!key) return say('Paste a key first.')
  await browser.storage.local.set({ [KEY_STORAGE]: key })
  input.value = ''
  say('Saved. Reload your LinkedIn tabs.')
})

document.querySelector('#clear')!.addEventListener('click', async () => {
  await browser.storage.local.remove(KEY_STORAGE)
  say('Key removed.')
})

// A live, uncached call with a known "no sponsorship" sample, showing exactly
// what came back so the setup can be checked end to end.
document.querySelector('#test')!.addEventListener('click', async () => {
  say('Asking Jev…')
  const message: Message = {
    type: 'jev-classify',
    key: 'options-test',
    fresh: true,
    posting: {
      header: 'Machine Learning Engineer · Acme · European Union (Remote)',
      description: 'Fully remote role. You must be based in the EU. We are unable to offer visa sponsorship for this role.',
    },
  }
  const reply: ClassifyReply = await browser.runtime.sendMessage(message)
  if (!reply.ok) return say(reply.error === 'no-key' ? 'Save a key first.' : `Failed: ${reply.error}`)
  const { verdict, usage, ms } = reply
  const correct = verdict.visa.label === 'no' && verdict.remote.label === 'europe-only'
  const line = <L extends string>(name: string, answer: Answer<L>, names: Record<L, string>) => [
    `${name.padEnd(12)}${names[answer.label]} (${Math.round(answer.confidence * 100)}% confidence)`,
    ...(Object.entries(answer.probabilities) as [L, number][]).map(([label, p]) => `              ${names[label].padEnd(30)} ${Math.round(p * 100)}%`),
  ]
  say([
    correct
      ? 'Works: Jev answered both questions correctly for the sample (no sponsorship, EU residents only).'
      : 'Call works, but Jev did not answer "No sponsorship" + "Europe residents only" for the sample.',
    '',
    ...line('Visa', verdict.visa, VISA_LABELS),
    ...line('Remote', verdict.remote, REMOTE_LABELS),
    '',
    `Latency     ${ms} ms`,
    `Model       ${usage?.model ?? '?'}${usage?.provider ? ` via ${usage.provider}` : ''}`,
    `Input       ${usage?.inputTokens ?? '?'} tokens`,
    `Cost        ${usage?.cost !== undefined ? `$${usage.cost.toFixed(7)}` : '?'}`,
  ].join('\n'))
})
