/**
 * The details a posting gives about who to write to and what to send, read
 * straight from the text so the letter, the email and the next-steps cards can
 * use them without the candidate retyping anything. Deliberately conservative: a name
 * is only inferred from a personal-looking address, never guessed.
 */
export interface PostingContact {
  email: string | null
  /** "Ryan Martin" from ryan.martin@..., when the address looks like a person's. */
  name: string | null
  firstName: string | null
  /** Whether the posting asks for a cover letter, and whether it asks for a short one. */
  coverLetter: 'short' | 'requested' | null
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const ROLE_MAILBOX = /^(?:jobs?|careers?|hr|recruit(?:ing|ment)?|talent|info|contact|apply|applications?|hiring|people|team|hello|rh|emploi|recrutement)$/i

export function postingContact(jd: string | null | undefined): PostingContact {
  const text = jd ?? ''
  const email = text.match(EMAIL)?.[0].replace(/\.$/, '') ?? null
  const name = email ? nameFromEmail(email) : null
  return {
    email,
    name,
    firstName: name?.split(' ')[0] ?? null,
    coverLetter: /\b(?:short|brief)\s+(?:cover|motivation)\s+letter\b/i.test(text)
      ? 'short'
      : /\b(?:cover|motivation)\s+letter\b|lettre de motivation/i.test(text) ? 'requested' : null,
  }
}

function nameFromEmail(email: string): string | null {
  const local = email.split('@')[0]
  if (ROLE_MAILBOX.test(local)) return null
  const parts = local.split(/[._-]/)
  if (parts.length !== 2 || !parts.every((part) => /^[a-z]{2,}$/i.test(part))) return null
  return parts.map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase()).join(' ')
}
