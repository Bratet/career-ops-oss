import { randomUUID } from 'crypto'
import { mkdir, rename } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'
import { getApplication } from './applications'
import { linkFolder, readIndex, unlinkFolder } from './appIndex'
import { PATHS } from './paths'
import { deleteRow } from './tracker'

export class ApplicationNotFoundError extends Error {
  constructor(key: string) {
    super(`application '${key}' was not found`)
    this.name = 'ApplicationNotFoundError'
  }
}

export interface DeleteApplicationResult {
  rowId: number | null
  folder: string | null
  trashedAs: string | null
}

function directChild(root: string, name: string): string {
  const rootPath = resolve(root)
  const childPath = resolve(rootPath, name)
  if (!name || basename(childPath) !== name || dirname(childPath) !== rootPath) {
    throw new Error(`refusing to delete an invalid application folder: '${name}'`)
  }
  return childPath
}

function trashName(folder: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${folder}--deleted-${timestamp}-${randomUUID().slice(0, 8)}`
}

/**
 * Remove an application from the tracker and index, retaining its documents in
 * data/.trash/applications. The tracker write happens last; earlier filesystem
 * changes are rolled back if it fails.
 */
export async function deleteApplication(key: string): Promise<DeleteApplicationResult> {
  const app = await getApplication(key)
  if (!app) throw new ApplicationNotFoundError(key)

  const index = await readIndex()
  const rowId = app.row?.id ?? null
  const linkedFolder = rowId === null ? undefined : index[String(rowId)]
  const folder = app.folder?.folder ?? null
  let sourcePath: string | null = null
  let trashPath: string | null = null
  let unlinked = false

  try {
    if (folder) {
      sourcePath = directChild(PATHS.applications, folder)
      await mkdir(PATHS.applicationTrash, { recursive: true })
      trashPath = directChild(PATHS.applicationTrash, trashName(folder))
      await rename(sourcePath, trashPath)
    }

    if (rowId !== null && linkedFolder !== undefined) {
      await unlinkFolder(rowId)
      unlinked = true
    }

    if (rowId !== null) await deleteRow(rowId)
  } catch (error) {
    const rollbackErrors: string[] = []

    if (unlinked && rowId !== null && linkedFolder !== undefined) {
      try {
        await linkFolder(rowId, linkedFolder)
      } catch (rollbackError) {
        rollbackErrors.push((rollbackError as Error).message)
      }
    }

    if (sourcePath && trashPath) {
      try {
        await rename(trashPath, sourcePath)
      } catch (rollbackError) {
        rollbackErrors.push((rollbackError as Error).message)
      }
    }

    if (rollbackErrors.length) {
      throw new Error(`${(error as Error).message}; rollback failed: ${rollbackErrors.join('; ')}`)
    }
    throw error
  }

  return {
    rowId,
    folder,
    trashedAs: trashPath ? basename(trashPath) : null,
  }
}
