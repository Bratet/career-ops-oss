// Page helpers that don't read the live page, so the repo tests can cover them.

// Job search/collections use ?currentJobId=; a single posting is /jobs/view/<slug-><id>.
export function jobIdFromUrl(url: string): string | null {
  const parsed = new URL(url)
  const current = parsed.searchParams.get('currentJobId')
  if (current && /^\d+$/.test(current)) return current
  return parsed.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1] ?? null
}

// LinkedIn's public, signed-out view of one posting. Its markup has stayed the
// same through the logged-in redesigns, so it backs up the page read.
export function guestPostingUrl(jobId: string) {
  return `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`
}

export interface GuestPosting { header: string; description: string }

// The guest page is a static HTML fragment, so DOMParser has no layout and no
// innerText: line breaks are written in before taking textContent.
function guestText(element: Element | null) {
  if (!element) return ''
  element.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  element.querySelectorAll('p, li, ul, ol, h1, h2, h3, h4, div').forEach((block) => block.append('\n'))
  return element.textContent ?? ''
}

// Takes a parsed Document so the repo tests can run it on a fixture.
export function parseGuestPosting(doc: Document): GuestPosting | null {
  const description = cleanDescription(guestText(doc.querySelector('.show-more-less-html__markup, .description__text')))
  if (!description) return null
  const header = [
    doc.querySelector('.top-card-layout__title'),
    doc.querySelector('.topcard__org-name-link, .topcard__flavor'),
    doc.querySelector('.topcard__flavor--bullet'),
    ...doc.querySelectorAll('.description__job-criteria-item'),
  ].map((element) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '').filter(Boolean).join('\n')
  return { header, description }
}

// The description's own heading, in the languages LinkedIn is used in here.
const ABOUT_HEADINGS = ['about the job', "a propos de l'offre d'emploi", 'over de vacature', 'uber den job', 'acerca del empleo']

export function isAboutHeading(text: string) {
  const normalized = text.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'")
  return ABOUT_HEADINGS.includes(normalized)
}

// Collapses LinkedIn's whitespace and drops its "About the job" heading: fewer
// input tokens, same meaning.
export function cleanDescription(text: string) {
  return text
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim()
    .replace(/^about the job\n/i, '')
}

// Stable key for postings whose URL carries no job id.
export function textKey(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return `h${(hash >>> 0).toString(36)}`
}
