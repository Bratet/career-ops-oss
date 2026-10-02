/**
 * Plain-language versions of the failures this app actually hits. The raw
 * message stays available as detail; this only decides the headline and what
 * to do about it.
 */
export interface FriendlyError {
  title: string
  hint: string
  /** The original message, when it adds anything beyond the title. */
  detail: string | null
}

const RULES: { test: RegExp; title: string; hint: string }[] = [
  {
    test: /changed somewhere else|workspace changed/i,
    title: 'This was changed somewhere else.',
    hint: 'Reload the page to continue from the latest version.',
  },
  {
    test: /ENAMETOOLONG/,
    title: 'The request was too large to start the AI engine.',
    hint: 'This is an app bug rather than something you did. Retry, and report it if it keeps happening.',
  },
  {
    test: /ENOENT|not found on PATH|is not recognized|command not found/i,
    title: 'The AI engine could not be started.',
    hint: 'Check that the Claude or Codex CLI is installed and signed in (make engines), then retry.',
  },
  {
    test: /not logged in|please (?:run )?\/?login|unauthori[sz]ed|\b401\b|authentication/i,
    title: 'The AI engine is not signed in.',
    hint: 'Run claude login (or codex login) in a terminal, then retry.',
  },
  {
    test: /rate limit|\b429\b|overloaded|usage limit/i,
    title: 'The AI engine is busy or over its usage limit.',
    hint: 'Wait a moment and retry, or switch model in the engine picker.',
  },
  {
    test: /SIGKILL|timed out|timeout/i,
    title: 'The AI engine took too long and was stopped.',
    hint: 'Retry. A shorter request or a faster model usually helps.',
  },
  {
    test: /(?:claude|codex) (?:exited|reported an error|returned no)/i,
    title: 'The AI engine stopped with an error.',
    hint: 'Retry. If it happens again, the details below say what the CLI reported.',
  },
  {
    test: /rendercv|typst|could not be rendered|could not be verified/i,
    title: 'The PDF could not be rendered.',
    hint: 'Check the draft for the problem listed below, then try again.',
  },
  {
    test: /Failed to fetch|NetworkError|fetch failed|ECONNREFUSED/i,
    title: 'The app server could not be reached.',
    hint: 'Make sure make dev is still running, then retry.',
  },
]

export function friendlyError(message: string): FriendlyError {
  const rule = RULES.find((candidate) => candidate.test.test(message))
  if (!rule) return { title: message, hint: '', detail: null }
  return { title: rule.title, hint: rule.hint, detail: message }
}
