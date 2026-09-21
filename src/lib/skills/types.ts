export const SKILL_RUNNERS = ['job-analysis', 'profile-fit', 'cv-operations', 'text-artifact'] as const
export type SkillRunner = typeof SKILL_RUNNERS[number]

export const SKILL_SCOPES = ['global', 'application'] as const
export type SkillScope = typeof SKILL_SCOPES[number]

export interface SkillMetadata {
  id: string
  name: string
  description: string
  runner: SkillRunner
  version: number
  scope: SkillScope
  capabilities: string[]
}

export interface SkillDocument {
  metadata: SkillMetadata
  /** Complete editable SKILL.md, including frontmatter. */
  markdown: string
  /** Model-facing Markdown below the frontmatter. */
  instructions: string
}

export interface SkillSummary extends SkillMetadata {
  updatedAt: string
}

export interface SkillRevision {
  file: string
  version: number
  createdAt: string
}
