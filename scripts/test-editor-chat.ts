import { editorAgentPrompt, runEditorAgent } from '../src/lib/editorAgent'
import {
  editorChatStorageKey,
  applicationChatScope,
  parseEditorChatSnapshot,
  serializeEditorChatSnapshot,
} from '../src/lib/chatPersistence'
import { chatSkillForMessage } from '../src/lib/chatSkills'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('editor chat')

const first = editorAgentPrompt('Remove the Summary section.', 'master', 0)
check('first turn gives the CLI a real YAML editing task', first.includes('Work directly on cv.yaml using your file tools'))
check('first turn preserves unsaved-buffer ownership', first.includes('app, not you, controls saving'))
check('first turn protects factual content', first.includes('Never invent employers, titles, dates, figures'))
check('first turn explains exact snapshot recovery', first.includes('history/NNN-before.yaml'))

const followUp = editorAgentPrompt('Actually take it back please.', 'master', 1)
check('follow-up directs undo to persisted history', followUp.includes('history/ contains exact earlier buffers'))
check('follow-up includes the new user request', followUp.includes('Actually take it back please.'))

const guidance = 'Prefer short application answers. Freelancing was alongside university.'
for (const turn of [0, 1]) {
  const guided = editorAgentPrompt('Keep the current summary.', 'tailored', turn, guidance)
  check(`candidate guidance reaches turn ${turn}`, guided.includes(guidance))
  check(`guidance does not replace the request on turn ${turn}`, guided.endsWith('Keep the current summary.'))
}

const sessionId = '123e4567-e89b-42d3-a456-426614174000'
const snapshot = parseEditorChatSnapshot(serializeEditorChatSnapshot({
  sessionId,
  draft: 'Keep this unfinished message',
  reviewMode: true,
  turns: [
    { role: 'user', content: 'Remove summary' },
    {
      role: 'assistant',
      content: 'I prepared that change.',
      changed: true,
      skillRun: {
        skillId: 'tailor-cv',
        runId: 'run-123',
        events: [
          { kind: 'reasoning', text: 'Prioritizing direct evidence.' },
          { kind: 'preview', text: 'One page at 96% fill.' },
        ],
      },
      proposal: { before: 'cv:\n  summary: old\n', after: 'cv: {}\n', status: 'pending' },
    },
    {
      role: 'assistant',
      content: 'Review: clear summary.',
      review: {
        report: { assessment: 'Clear summary.', strengths: [], findings: [], questions: [] },
        reply: 'I reviewed the draft.', fingerprint: '12:abc', runId: 'run-review', skillVersion: 3, engine: 'claude',
      },
    },
  ],
}))
check('editor conversation survives serialization', snapshot?.turns.length === 3 && snapshot.turns[1].proposal?.status === 'pending')
check('skill transcript survives serialization', snapshot?.turns[1].skillRun?.events.length === 2 && snapshot.turns[1].skillRun?.runId === 'run-123')
check('unfinished editor draft survives serialization', snapshot?.draft === 'Keep this unfinished message')
check('editor session id survives serialization', snapshot?.sessionId === sessionId)
check('review discussion mode survives serialization', snapshot?.reviewMode === true)
check('resume review survives serialization', snapshot?.turns[2].review?.report.assessment === 'Clear summary.' && snapshot.turns[2].review?.skillVersion === 3)
check('Overview and Resume AI have separate histories', editorChatStorageKey(applicationChatScope('example', 'overview')) !== editorChatStorageKey(applicationChatScope('example', 'resume')))
check('existing history remains available in Resume AI', applicationChatScope('example', 'resume') === 'application:example')
check('overview histories stay separate across applications', applicationChatScope('example', 'overview') !== applicationChatScope('another', 'overview'))
check('application histories use separate keys', editorChatStorageKey('application:a') !== editorChatStorageKey('application:b'))
check('profile sources use separate keys', editorChatStorageKey('profile:master-en') !== editorChatStorageKey('profile:master-fr'))
check('corrupt persisted history is ignored', parseEditorChatSnapshot('{not json') === null)
check('natural-language tailoring invokes the skill', chatSkillForMessage('Please tailor my resume for this role') === 'tailor-cv')
check('short CV tailoring command invokes the skill', chatSkillForMessage('Tailor my CV') === 'tailor-cv')
check('French tailoring command invokes the skill', chatSkillForMessage('Je veux adapter mon CV pour ce poste') === 'tailor-cv')
check('tailoring questions remain normal chat', chatSkillForMessage('How would tailoring improve my resume?') === null)
check('tailoring explanations remain normal chat', chatSkillForMessage('Can you explain how to tailor my resume?') === null)
check('negated tailoring does not invoke the skill', chatSkillForMessage('Do not tailor my resume') === null)
check('explicit slash command invokes the skill', chatSkillForMessage('/tailor focus on platform engineering') === 'tailor-cv')

for (const message of ['Before we tailor my resume, can you check my visa eligibility?', 'Should you tailor my resume for this role?', 'I want to clarify things first before you tailor my resume', 'If I am eligible can you tailor my resume']) {
  check(`clarification stays in chat: ${message}`, chatSkillForMessage(message) === null)
}

const tailored = editorAgentPrompt('Shorten the CV.', 'tailored', 0)
check('tailored agent cannot edit design', tailored.includes('do not edit the design block'))

let unsafeSessionRejected = false
try {
  await runEditorAgent({
    sessionId: '../escape',
    yaml: 'cv:\n  name: Test\n',
    mode: 'master',
    message: 'Hello',
  })
} catch {
  unsafeSessionRejected = true
}
check('unsafe session id rejected before CLI execution', unsafeSessionRejected)

console.log(failures ? `\n${failures} failure(s)` : '\nall editor chat checks pass')
process.exit(failures ? 1 : 0)
