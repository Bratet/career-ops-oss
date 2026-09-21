import { mkdir, readFile, readdir, rename, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { PATHS } from '../paths'
import { parseSkill, withSkillMetadata } from './parser'
import type { SkillDocument, SkillRevision, SkillRunner, SkillSummary } from './types'

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const skillWrites = new Map<string, Promise<void>>()

function assertId(id: string): void {
  if (!ID.test(id)) throw new Error('invalid skill id')
}

function skillPath(id: string): string {
  assertId(id)
  return join(PATHS.skills, id, 'SKILL.md')
}

export async function listSkills(): Promise<SkillSummary[]> {
  let entries
  try {
    entries = await readdir(PATHS.skills, { withFileTypes: true })
  } catch {
    return []
  }

  const skills: SkillSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !ID.test(entry.name)) continue
    try {
      const path = skillPath(entry.name)
      const [document, info] = await Promise.all([readFile(path, 'utf-8'), stat(path)])
      const skill = parseSkill(document)
      if (skill.metadata.id !== entry.name) continue
      skills.push({ ...skill.metadata, updatedAt: info.mtime.toISOString() })
    } catch {
      // A malformed folder is omitted from the runnable registry. Its error is
      // still visible when opened by exact id through getSkill.
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getSkill(id: string): Promise<SkillDocument> {
  const markdown = await readFile(skillPath(id), 'utf-8')
  const skill = parseSkill(markdown)
  if (skill.metadata.id !== id) throw new Error(`skill id ${skill.metadata.id} does not match folder ${id}`)
  return skill
}

/** Bind a feature entrypoint to the runner contract it was implemented for. */
export async function getSkillForRunner(id: string, runner: SkillRunner): Promise<SkillDocument> {
  const skill = await getSkill(id)
  if (skill.metadata.runner !== runner) {
    throw new Error(`skill ${id} uses ${skill.metadata.runner}; this feature requires ${runner}`)
  }
  return skill
}

export class SkillVersionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`skill changed since preview: expected version ${expected}, found version ${actual}`)
    this.name = 'SkillVersionConflict'
  }
}

export async function saveSkill(id: string, markdown: string, expectedVersion?: number): Promise<SkillDocument> {
  return withSkillWrite(id, async () => {
    assertId(id)
    const proposed = parseSkill(markdown)
    if (proposed.metadata.id !== id) throw new Error('the id in frontmatter must match the skill URL')

    const current = await getSkill(id)
    if (expectedVersion !== undefined && current.metadata.version !== expectedVersion) {
      throw new SkillVersionConflict(expectedVersion, current.metadata.version)
    }
    if (proposed.metadata.runner !== current.metadata.runner) {
      throw new Error('runner cannot be changed after a skill is created; duplicate a skill of the intended runner instead')
    }
    await archiveRevision(current)
    const next = withSkillMetadata(markdown, { version: current.metadata.version + 1 })
    await atomicWrite(skillPath(id), next)
    return parseSkill(next)
  })
}

export async function duplicateSkill(sourceId: string, requestedId: string, requestedName?: string): Promise<SkillDocument> {
  assertId(requestedId)
  const source = await getSkill(sourceId)
  try {
    await stat(skillPath(requestedId))
    throw new Error(`skill ${requestedId} already exists`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const markdown = withSkillMetadata(source.markdown, {
    id: requestedId,
    name: requestedName?.trim() || `${source.metadata.name} copy`,
    version: 1,
  })
  await mkdir(join(PATHS.skills, requestedId), { recursive: true })
  await atomicWrite(skillPath(requestedId), markdown)
  return parseSkill(markdown)
}

export async function listSkillRevisions(id: string): Promise<SkillRevision[]> {
  assertId(id)
  const dir = join(PATHS.skillRevisions, id)
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const valid = files.filter((file) => /^\d{4}-\d{2}-\d{2}T[\d-]+Z-v\d+\.md$/.test(file))
  const revisions = await Promise.all(valid.map(async (file) => {
    const info = await stat(join(dir, file))
    return {
      file,
      version: Number(file.match(/-v(\d+)\.md$/)?.[1] ?? 0),
      createdAt: info.mtime.toISOString(),
    }
  }))
  return revisions
    .sort((a, b) => b.file.localeCompare(a.file))
}

export async function restoreSkillRevision(id: string, file: string): Promise<SkillDocument> {
  assertId(id)
  if (!/^\d{4}-\d{2}-\d{2}T[\d-]+Z-v\d+\.md$/.test(file)) throw new Error('invalid revision file')
  const markdown = await readFile(join(PATHS.skillRevisions, id, file), 'utf-8')
  return saveSkill(id, markdown)
}

async function archiveRevision(skill: SkillDocument): Promise<void> {
  const dir = join(PATHS.skillRevisions, skill.metadata.id)
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await writeFile(join(dir, `${stamp}-v${skill.metadata.version}.md`), skill.markdown, 'utf-8')
}

async function atomicWrite(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, `${text.trimEnd()}\n`, 'utf-8')
  await rename(temp, path)
}

/** Serialize writes per skill so two approved previews cannot both claim the same next version. */
async function withSkillWrite<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const prior = skillWrites.get(id) ?? Promise.resolve()
  let unlock = () => {}
  const gate = new Promise<void>((resolve) => { unlock = resolve })
  const queued = prior.catch(() => {}).then(() => gate)
  skillWrites.set(id, queued)
  await prior.catch(() => {})
  try {
    return await operation()
  } finally {
    unlock()
    if (skillWrites.get(id) === queued) skillWrites.delete(id)
  }
}
