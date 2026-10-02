import { browser } from 'wxt/browser'
import { JEV_ENDPOINT, JEV_MODEL, QUESTIONS_VERSION, jevRequest, parseJevResponse, type JevVerdict, type Posting } from '../lib/jev'
import { KEY_STORAGE, type ClassifyReply, type Message } from '../lib/messages'

// Jev is called from here, not the content script: the extension's host
// permission lets this worker reach openrouter.ai, and the key never
// touches the LinkedIn page.
//
// One paid call per posting: answers are cached per job id (model, questions) for two
// weeks across tabs and restarts, and concurrent asks share one request.

const CACHE_PREFIX = `jev:${JEV_MODEL}:v${QUESTIONS_VERSION}:`
const TTL = 14 * 24 * 60 * 60 * 1000
const RETRIES = 2

interface Cached {
  verdict: JevVerdict
  at: number
}

const inflight = new Map<string, Promise<ClassifyReply>>()

async function callJev(apiKey: string, posting: Posting): Promise<ClassifyReply> {
  const started = Date.now()
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(JEV_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(jevRequest(posting)),
        signal: controller.signal,
      })
      // Rate limited or overloaded: back off and retry, as the Jev docs advise.
      if ((response.status === 429 || response.status >= 500) && attempt < RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
        continue
      }
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null
        return { ok: false, error: `HTTP ${response.status}${detail?.error?.message ? `: ${detail.error.message}` : ''}` }
      }
      const { verdict, usage } = parseJevResponse(await response.json())
      return { ok: true, verdict, usage, ms: Date.now() - started, cached: false }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      return { ok: false, error: aborted ? 'timed out' : error instanceof Error ? error.message : String(error) }
    } finally {
      clearTimeout(timeout)
    }
  }
}

async function classify(key: string, posting: Posting, fresh = false): Promise<ClassifyReply> {
  const cacheKey = CACHE_PREFIX + key
  if (!fresh) {
    const hit = (await browser.storage.local.get(cacheKey))[cacheKey] as Cached | undefined
    if (hit && Date.now() - hit.at < TTL) return { ok: true, verdict: hit.verdict, ms: 0, cached: true }
  }

  const stored = (await browser.storage.local.get(KEY_STORAGE))[KEY_STORAGE]
  if (typeof stored !== 'string' || !stored) return { ok: false, error: 'no-key' }

  const pending = inflight.get(cacheKey)
  if (pending) return pending
  const request = callJev(stored, posting).then(async (reply) => {
    if (reply.ok) await browser.storage.local.set({ [cacheKey]: { verdict: reply.verdict, at: Date.now() } satisfies Cached })
    return reply
  }).finally(() => inflight.delete(cacheKey))
  inflight.set(cacheKey, request)
  return request
}

async function pruneCache() {
  const all = await browser.storage.local.get(null)
  const expired = Object.entries(all)
    .filter(([name, value]) => name.startsWith('jev:') && (!name.startsWith(CACHE_PREFIX) || Date.now() - (value as Cached).at >= TTL))
    .map(([name]) => name)
  if (expired.length) await browser.storage.local.remove(expired)
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(pruneCache)
  browser.runtime.onStartup.addListener(pruneCache)
  browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    if (message?.type === 'open-options') {
      browser.runtime.openOptionsPage()
      return
    }
    if (message?.type !== 'jev-classify') return
    classify(message.key, message.posting, message.fresh).then(sendResponse)
    return true
  })
})
