import { readFile } from 'fs/promises'
import { PATHS } from '@/lib/paths'
import { parityDiff, profileStats } from '@/lib/profile'
import { ProfileShell } from './shell'
import { sourceById } from './sources'

export const dynamic = 'force-dynamic'

/** The profile exposes editable general and master resumes in both languages. */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const { src } = await searchParams
  const source = sourceById(src)

  const [yaml, error] = await read(PATHS[source.family][source.lang])
  // Parity is a property of the pair, so both masters are read whichever one is open.
  const [en, fr] = await Promise.all([read(PATHS.masters.en), read(PATHS.masters.fr)])

  return (
    <ProfileShell
      src={source.id}
      yaml={yaml}
      error={error}
      stats={profileStats(yaml)}
      parity={parityDiff(profileStats(en[0]), profileStats(fr[0]))}
    />
  )
}

async function read(file: string): Promise<[string, string | null]> {
  try {
    return [await readFile(file, 'utf-8'), null]
  } catch {
    return ['', `${file} not found`]
  }
}
