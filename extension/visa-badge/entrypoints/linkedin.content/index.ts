import { browser } from 'wxt/browser'
import { MIN_CONFIDENCE, REMOTE_LABELS, VISA_LABELS, type Answer, type Posting } from '../../lib/jev'
import { cleanDescription, guestPostingUrl, isAboutHeading, jobIdFromUrl, parseGuestPosting, textKey, type GuestPosting } from '../../lib/linkedin'
import type { ClassifyReply, Message } from '../../lib/messages'
import './style.css'

// Read-only on LinkedIn: this script never clicks or scrolls. It reads the job
// header and description LinkedIn already rendered, asks the background worker
// for Jev's verdict, and shows two badges above the job title: visa
// sponsorship, and whether a remote job accepts people outside Europe.
//
// LinkedIn's logged-in markup changes without notice (the /jobs/search-results/
// layout shares none of the classes below). When the page can't be read but the
// URL names a job, the posting comes from LinkedIn's public guest page instead,
// fetched without cookies, and the badges float in the corner if there's no
// title to sit above.
//
// Each job id is classified once. LinkedIn redraws the description several
// times while a job loads, so the text is read only after the page settles,
// and never while it still shows the previous job's text.

const BADGE_ID = 'visa-badge'
const SETTLE_MS = 500
// LinkedIn rarely goes fully quiet (timestamps, ads), so settling is capped.
const MAX_SETTLE_MS = 1500
// A new job id with the old description usually means the pane hasn't swapped yet.
const STALE_WAIT_MS = 2500

// LinkedIn renames classes often; the first selector that matches wins.
const DESCRIPTION = [
  '#job-details',
  '.jobs-description__content',
  '.jobs-description-content__text',
  '.jobs-box__html-content',
  '.show-more-less-html__markup',
  '.description__text',
]
const TITLE = [
  '.job-details-jobs-unified-top-card__job-title',
  '.jobs-unified-top-card__job-title',
  '.top-card-layout__title',
]
// Title, company, location ("EMEA (Remote)"), workplace type.
const HEADER = [
  '.job-details-jobs-unified-top-card__container--two-pane',
  '.jobs-unified-top-card',
  '.job-details-jobs-unified-top-card__primary-description-container',
  '.top-card-layout__entity-info',
]

function first(selectors: string[]) {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector)
    if (element?.innerText.trim()) return element
  }
  return null
}

// Class-free fallback: the "About the job" heading, then the nearest ancestor
// that holds the description under it.
function descriptionByHeading() {
  for (const heading of document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, [role="heading"]')) {
    if (!isAboutHeading(heading.innerText)) continue
    let element: HTMLElement | null = heading.parentElement
    for (let depth = 0; element && depth < 6; depth++, element = element.parentElement) {
      if (element.innerText.length > heading.innerText.length + 200) return element
    }
  }
  return null
}


interface Pill {
  modifiers: string[]
  text: string
  extra?: string
  tooltip: string
  onClick?: () => void
}

function answerPill<Label extends string>(
  answer: Answer<Label>,
  names: Record<Label, string>,
  cached: boolean,
  retry: () => void,
): Pill {
  const unsure = answer.confidence < MIN_CONFIDENCE
  const percent = Math.round(answer.confidence * 100)
  const breakdown = (Object.keys(names) as Label[])
    .filter((label) => answer.probabilities[label] !== undefined)
    .map((label) => `${names[label]}: ${Math.round((answer.probabilities[label] ?? 0) * 100)}%`)
    .join('\n')
  return {
    modifiers: unsure ? [answer.label, 'unsure'] : [answer.label],
    text: `${unsure ? 'Unsure: ' : ''}${names[answer.label]}`,
    extra: `· Jev ${percent}%`,
    tooltip: `Jev confidence ${percent}%${cached ? ' (cached)' : ''}${breakdown ? `\n\n${breakdown}` : ''}\n\nClick to re-check.`,
    onClick: retry,
  }
}

function pills(reply: ClassifyReply | null, retry: () => void): Pill[] {
  if (!reply) return [{ modifiers: ['loading'], text: 'Checking visa & remote…', tooltip: 'Asking Jev about this posting.' }]
  if (!reply.ok) {
    if (reply.error === 'no-key') {
      return [{
        modifiers: ['setup'],
        text: 'Add OpenRouter key',
        tooltip: 'Click to open the extension settings and paste your OpenRouter key.',
        onClick: () => browser.runtime.sendMessage({ type: 'open-options' } satisfies Message),
      }]
    }
    return [{ modifiers: ['error'], text: 'Jev check failed', extra: '· retry', tooltip: reply.error, onClick: retry }]
  }
  const { visa, remote } = reply.verdict
  // Both badges always show, so a missing one means something is broken.
  return [answerPill(visa, VISA_LABELS, reply.cached, retry), answerPill(remote, REMOTE_LABELS, reply.cached, retry)]
}

function render(anchor: HTMLElement | null, items: Pill[], dataset: Record<string, string> = {}) {
  const row = document.createElement('div')
  row.id = BADGE_ID
  row.className = 'visa-badges'
  Object.assign(row.dataset, dataset)
  for (const { modifiers, text, extra, tooltip, onClick } of items) {
    const pill = document.createElement('div')
    pill.className = ['visa-badge', ...modifiers.map((m) => `visa-badge--${m}`)].join(' ')
    pill.title = tooltip
    const dot = document.createElement('span')
    dot.className = 'visa-badge__dot'
    pill.append(dot, text)
    if (extra) {
      const span = document.createElement('span')
      span.className = 'visa-badge__extra'
      span.textContent = extra
      pill.append(span)
    }
    if (onClick) {
      pill.classList.add('visa-badge--clickable')
      pill.addEventListener('click', onClick)
    }
    row.append(pill)
  }

  document.getElementById(BADGE_ID)?.remove()
  const title = first(TITLE)
  if (title) title.insertAdjacentElement('beforebegin', row)
  else if (anchor) anchor.insertAdjacentElement('beforebegin', row)
  else {
    row.classList.add('visa-badges--floating')
    document.body.append(row)
  }
}

export default defineContentScript({
  // All of linkedin.com, because LinkedIn navigates to /jobs without a page load.
  matches: ['*://*.linkedin.com/*'],
  main(ctx) {
    const replies = new Map<string, ClassifyReply | null>()
    let activeKey = ''
    let activeText = ''
    let previousText = ''
    let switchedAt = 0
    let timer: number | undefined
    let waitingSince = 0

    const schedule = (ms = SETTLE_MS) => {
      if (timer !== undefined && Date.now() - waitingSince > MAX_SETTLE_MS) return
      if (timer === undefined) waitingSince = Date.now()
      clearTimeout(timer)
      timer = ctx.setTimeout(() => {
        timer = undefined
        update()
      }, ms)
    }

    const readHeader = () => cleanDescription(first(HEADER)?.innerText ?? '')
    const guests = new Map<string, GuestPosting | 'pending' | 'failed'>()

    const guestPosting = (jobId: string) => {
      const known = guests.get(jobId)
      if (known) return known
      guests.set(jobId, 'pending')
      fetch(guestPostingUrl(jobId), { credentials: 'omit' })
        .then((response) => response.ok ? response.text() : Promise.reject(new Error(`LinkedIn returned ${response.status}`)))
        .then((html) => { guests.set(jobId, parseGuestPosting(new DOMParser().parseFromString(html, 'text/html')) ?? 'failed') })
        .catch(() => { guests.set(jobId, 'failed') })
        .finally(() => { if (ctx.isValid) update() })
      return 'pending' as const
    }

    // Skips redraws when the badges already show this state for this job.
    const show = (anchor: HTMLElement | null, items: Pill[], key: string, state: string) => {
      const existing = document.getElementById(BADGE_ID)
      if (existing?.dataset.key === key && existing.dataset.state === state) return
      render(anchor, items, { key, state })
    }

    const ask = (key: string, posting: Posting, fresh = false) => {
      replies.set(key, null)
      update()
      browser.runtime.sendMessage({ type: 'jev-classify', key, posting, fresh } satisfies Message)
        .catch((error: unknown) => ({ ok: false, error: String(error) }) as ClassifyReply)
        .then((reply: ClassifyReply) => {
          if (!ctx.isValid) return
          replies.set(key, reply)
          update()
        })
    }

    function update() {
      if (!location.pathname.startsWith('/jobs')) {
        document.getElementById(BADGE_ID)?.remove()
        return
      }
      const jobId = jobIdFromUrl(location.href)
      const description = first(DESCRIPTION) ?? descriptionByHeading()
      let text = description ? cleanDescription(description.innerText) : ''
      let header = readHeader()
      let fromGuest = false
      // A job id with an unreadable page (or no header for the remote question)
      // falls back to the guest page, which is always about exactly this job.
      if (jobId && (!text || !header)) {
        const guest = guestPosting(jobId)
        if (guest === 'pending') {
          if (!replies.has(jobId)) show(description, pills(null, () => {}), jobId, 'reading')
          return
        }
        if (guest !== 'failed') {
          text = guest.description
          header = guest.header
          fromGuest = true
        } else if (!text) {
          show(description, [{
            modifiers: ['error'],
            text: 'Couldn’t read this job',
            tooltip: 'Neither the page nor LinkedIn’s public posting could be read. LinkedIn may have changed its layout; reload the tab to try again.',
          }], jobId, 'unreadable')
          return
        }
      }
      if (!text) return
      const key = jobId ?? textKey(text)

      if (key !== activeKey) {
        previousText = activeText
        activeKey = key
        switchedAt = Date.now()
      }
      if (!replies.has(key)) {
        if (!fromGuest && text === previousText && Date.now() - switchedAt < STALE_WAIT_MS) {
          render(description, pills(null, () => {}))
          schedule(300)
          return
        }
        activeText = text
        ask(key, { header, description: text })
        return
      }
      activeText = text

      // Redraw only when the badges are missing or their state changed.
      const reply = replies.get(key) ?? null
      const state = !reply ? 'loading' : !reply.ok ? reply.error
        : [reply.verdict.visa, reply.verdict.remote].map((a) => `${a.label}:${a.confidence}`).join('|')
      const existing = document.getElementById(BADGE_ID)
      if (existing?.dataset.key === key && existing.dataset.state === state) return
      const retry = () => ask(key, { header, description: text }, true)
      render(description, pills(reply, retry), { key, state })
    }

    const observer = new MutationObserver((mutations) => {
      // Our own badge insertions don't count as page changes.
      const ownOnly = (m: MutationRecord) => {
        const nodes = [...m.addedNodes, ...m.removedNodes]
        return m.type === 'childList' && nodes.length > 0 && nodes.every((n) => (n as HTMLElement).id === BADGE_ID)
      }
      if (mutations.every(ownOnly)) return
      schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    ctx.onInvalidated(() => {
      observer.disconnect()
      document.getElementById(BADGE_ID)?.remove()
    })
    schedule()
  },
})
