import { parse, stringify } from 'yaml'
import { SKILL_RUNNERS, SKILL_SCOPES, type SkillDocument, type SkillMetadata, type SkillRunner } from './types'

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const RUNNER_PLACEHOLDERS: Record<SkillRunner, string[]> = {
  'job-analysis': ['{{JOB_POSTING}}'],
  'profile-fit': ['{{JD_ANALYSIS}}', '{{MASTER_RESUME}}'],
  'cv-operations': ['{{RENDER_FEEDBACK}}', '{{POSTING_ANALYSIS}}', '{{CV_YAML}}'],
  'text-artifact': [],
}

export const RUNNER_CAPABILITIES: Record<SkillRunner, string[]> = {
  'job-analysis': ['read-job-posting', 'propose-job-analysis'],
  'profile-fit': ['read-profile', 'read-job-analysis'],
  'cv-operations': ['read-job-analysis', 'read-master-resume', 'propose-cv-operations'],
  'text-artifact': [],
}

export function parseSkill(markdown: string): SkillDocument {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
  if (!match) throw new Error('SKILL.md must begin with YAML frontmatter between --- lines')

  let raw: unknown
  try {
    raw = parse(match[1])
  } catch (error) {
    throw new Error(`invalid skill frontmatter: ${(error as Error).message}`)
  }
  const value = raw as Record<string, unknown> | null
  if (!value || typeof value !== 'object') throw new Error('skill frontmatter must be an object')

  const metadata: SkillMetadata = {
    id: stringField(value, 'id'),
    name: stringField(value, 'name'),
    description: stringField(value, 'description'),
    runner: stringField(value, 'runner') as SkillRunner,
    version: numberField(value, 'version'),
    scope: stringField(value, 'scope') as SkillMetadata['scope'],
    capabilities: stringArrayField(value, 'capabilities'),
  }

  if (!ID.test(metadata.id)) throw new Error('id must use lowercase letters, numbers, and single hyphens')
  if (!SKILL_RUNNERS.includes(metadata.runner)) throw new Error(`unknown runner: ${metadata.runner}`)
  if (!SKILL_SCOPES.includes(metadata.scope)) throw new Error(`unknown scope: ${metadata.scope}`)
  if (!Number.isInteger(metadata.version) || metadata.version < 1) throw new Error('version must be a positive integer')
  const allowedCapabilities = RUNNER_CAPABILITIES[metadata.runner]
  const unsupported = metadata.capabilities.filter((capability) => !allowedCapabilities.includes(capability))
  if (unsupported.length) throw new Error(`runner ${metadata.runner} does not permit: ${unsupported.join(', ')}`)
  const missingCapabilities = allowedCapabilities.filter((capability) => !metadata.capabilities.includes(capability))
  if (missingCapabilities.length) throw new Error(`runner ${metadata.runner} requires: ${missingCapabilities.join(', ')}`)
  const instructions = match[2].trim()
  if (!instructions) throw new Error('skill instructions cannot be empty')
  const missing = RUNNER_PLACEHOLDERS[metadata.runner].filter((token) => !instructions.includes(token))
  if (missing.length) throw new Error(`missing required placeholder${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`)

  return { metadata, markdown, instructions }
}

export function withSkillMetadata(markdown: string, patch: Partial<SkillMetadata>): string {
  const skill = parseSkill(markdown)
  const metadata = { ...skill.metadata, ...patch }
  const frontmatter = stringify(metadata, { lineWidth: 0 }).trimEnd()
  return `---\n${frontmatter}\n---\n\n${skill.instructions.trimEnd()}\n`
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  if (typeof field !== 'string' || !field.trim()) throw new Error(`${key} must be a non-empty string`)
  return field.trim()
}

function numberField(value: Record<string, unknown>, key: string): number {
  const field = value[key]
  if (typeof field !== 'number') throw new Error(`${key} must be a number`)
  return field
}

function stringArrayField(value: Record<string, unknown>, key: string): string[] {
  const field = value[key]
  if (!Array.isArray(field) || field.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${key} must be a list of strings`)
  }
  return field.map((item) => (item as string).trim())
}
