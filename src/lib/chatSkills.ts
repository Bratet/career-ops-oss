export type ChatSkillId = 'tailor-cv'

/**
 * Commands that should leave the generic YAML editor and enter the guarded,
 * measured tailoring workflow. Keep this deliberately narrow: questions about
 * tailoring should still be answered by the conversational editor.
 */
export function chatSkillForMessage(message: string): ChatSkillId | null {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim()

  if (/^\/tailor(?:\s|$)/.test(normalized)) return 'tailor-cv'

  const document = /\b(?:cv|resume)\b/.test(normalized)
  const action = /\b(?:tailor|tailored|customize|customise|adapt|adapte|adapter|align|optimize|optimise|optimiser|personnalise|personnaliser)\b/.test(normalized)
  const request = /\b(?:please|can you|could you|would you|i want|je veux|peux tu|pour ce poste|for this (?:job|role|position))\b/.test(normalized)
  const negated = /\b(?:do not|don t|dont|never|not)\b/.test(normalized) || /\bne\b.*\bpas\b/.test(normalized)
  const deferred = /\b(?:before|first|later|after|if|whether|should|ready|avant|apres|d abord)\b/.test(normalized)
  const informational = /\b(?:how|why|explain|advice|tips|suggestions?|comment|pourquoi|expliquer|conseils?)\b/.test(normalized)

  return document && action && !negated && !informational && !deferred && (request || normalized.split(' ').length <= 8) ? 'tailor-cv' : null
}
