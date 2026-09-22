import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { PATHS } from './paths'
import { savedSearchesSchema } from './savedSearchSchema'

export function createSavedSearchStore(file: string) {
  let pending: Promise<unknown> = Promise.resolve()

  async function read() {
    let raw = '[]\n'
    try { raw = await readFile(file, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return {
      searches: savedSearchesSchema.parse(JSON.parse(raw)),
      revision: createHash('sha256').update(raw).digest('hex'),
    }
  }

  function save(input: unknown, revision: string) {
    const searches = savedSearchesSchema.parse(input)
    const operation = pending.then(async () => {
      if ((await read()).revision !== revision) throw new Error('CONFLICT')
      await mkdir(dirname(file), { recursive: true })
      const temp = `${file}.${randomUUID()}.tmp`
      try {
        await writeFile(temp, JSON.stringify(searches, null, 2) + '\n', 'utf8')
        await rename(temp, file)
      } finally { await rm(temp, { force: true }) }
      return read()
    })
    pending = operation.catch(() => {})
    return operation
  }

  return { read, save }
}

export const savedSearchStore = createSavedSearchStore(PATHS.savedSearches)
