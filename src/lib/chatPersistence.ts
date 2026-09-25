import { resumeReviewParser, type ResumeReview } from './resumeReview'

const EDITOR_PREFIX = 'career-ops-editor-chat:v1:'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_TURNS = 100
const MAX_DRAFT = 8_000

export type ChatSkillEventKind = 'start' | 'activity' | 'reasoning' | 'preview' | 'change' | 'result'

export interface ChatSkillEvent {
  kind: ChatSkillEventKind
  text: string
}

export interface EditorChatTurn {
  role: 'user' | 'assistant'
  content: string
  changed?: boolean
  engine?: string
  reasoning?: string
  /** The user hit Stop before this turn finished; content/skillRun hold whatever streamed in first. */
  stopped?: boolean
  skillRun?: {
    skillId: string
    runId?: string
    events: ChatSkillEvent[]
  }
  review?: {
    report: ResumeReview
    reply: string
    fingerprint: string
    runId: string
    skillVersion: number
    engine: string
  }
  proposal?: {
    before: string
    after: string
    status: 'pending' | 'accepted' | 'rejected'
  }
}

export interface EditorChatSnapshot {
  sessionId: string
  turns: EditorChatTurn[]
  draft: string
  reviewMode?: boolean
}

/** Keep the existing chat as Resume & AI history; Overview gets its own session. */
export function applicationChatScope(key: string, surface: 'overview' | 'resume'): string {
  return surface === 'resume' ? `application:${key}` : `application:${key}:overview`
}

export function editorChatStorageKey(scope: string): string {
  return `${EDITOR_PREFIX}${encodeURIComponent(scope)}`
}

export function serializeEditorChatSnapshot(snapshot: EditorChatSnapshot): string {
  return JSON.stringify({
    version: 1,
    sessionId: snapshot.sessionId,
    turns: snapshot.turns.slice(-MAX_TURNS),
    draft: snapshot.draft.slice(0, MAX_DRAFT),
    reviewMode: snapshot.reviewMode === true,
  })
}

export function parseEditorChatSnapshot(value: string | null): EditorChatSnapshot | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed.version !== 1 || typeof parsed.sessionId !== 'string' || !UUID.test(parsed.sessionId)) return null
    if (!Array.isArray(parsed.turns) || typeof parsed.draft !== 'string') return null
    const turns = parsed.turns.map(parseTurn)
    if (turns.some((turn) => turn === null)) return null
    return {
      sessionId: parsed.sessionId,
      turns: (turns as EditorChatTurn[]).slice(-MAX_TURNS),
      draft: parsed.draft.slice(0, MAX_DRAFT),
      reviewMode: parsed.reviewMode === true,
    }
  } catch {
    return null
  }
}

function parseTurn(value: unknown): EditorChatTurn | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if ((row.role !== 'user' && row.role !== 'assistant') || typeof row.content !== 'string') return null

  const turn: EditorChatTurn = { role: row.role, content: row.content }
  if (typeof row.changed === 'boolean') turn.changed = row.changed
  if (typeof row.engine === 'string') turn.engine = row.engine
  if (typeof row.reasoning === 'string') turn.reasoning = row.reasoning
  if (typeof row.stopped === 'boolean') turn.stopped = row.stopped
  if (row.review !== undefined) {
    if (!row.review || typeof row.review !== 'object') return null
    const review = row.review as Record<string, unknown>
    const report = resumeReviewParser.safeParse(review.report)
    if (!report.success || typeof review.reply !== 'string' || typeof review.fingerprint !== 'string'
      || typeof review.runId !== 'string' || typeof review.skillVersion !== 'number' || typeof review.engine !== 'string') return null
    turn.review = { report: report.data, reply: review.reply, fingerprint: review.fingerprint, runId: review.runId, skillVersion: review.skillVersion, engine: review.engine }
  }
  if (row.skillRun !== undefined) {
    if (!row.skillRun || typeof row.skillRun !== 'object') return null
    const skillRun = row.skillRun as Record<string, unknown>
    if (typeof skillRun.skillId !== 'string' || !Array.isArray(skillRun.events)) return null
    const events = skillRun.events.map(parseSkillEvent)
    if (events.some((event) => event === null)) return null
    turn.skillRun = {
      skillId: skillRun.skillId,
      runId: typeof skillRun.runId === 'string' ? skillRun.runId : undefined,
      events: events as ChatSkillEvent[],
    }
  }
  if (row.proposal !== undefined) {
    if (!row.proposal || typeof row.proposal !== 'object') return null
    const proposal = row.proposal as Record<string, unknown>
    if (
      typeof proposal.before !== 'string'
      || typeof proposal.after !== 'string'
      || (proposal.status !== 'pending' && proposal.status !== 'accepted' && proposal.status !== 'rejected')
    ) return null
    turn.proposal = {
      before: proposal.before,
      after: proposal.after,
      status: proposal.status,
    }
  }
  return turn
}

function parseSkillEvent(value: unknown): ChatSkillEvent | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (
    row.kind !== 'start'
    && row.kind !== 'activity'
    && row.kind !== 'reasoning'
    && row.kind !== 'preview'
    && row.kind !== 'change'
    && row.kind !== 'result'
  ) return null
  if (typeof row.text !== 'string') return null
  return { kind: row.kind, text: row.text }
}
