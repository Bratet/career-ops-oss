import Link from 'next/link'
import { Badge, Card, Empty } from '@/components/ui/primitives'
import { listSkills } from '@/lib/skills/registry'

export const dynamic = 'force-dynamic'

export default async function SkillsPage() {
  const skills = await listSkills()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Skills</h1>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-[var(--color-faint)]">
          Every AI feature loads one versioned Markdown skill. Instructions are editable here;
          trusted runners continue to control data access, output shape, and allowed actions.
        </p>
      </div>

      {skills.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => (
            <Link key={skill.id} href={`/skills/${skill.id}`} className="group">
              <Card className="h-full p-5 transition-colors group-hover:border-[var(--color-border-strong)] group-hover:bg-[var(--color-surface-2)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-medium">{skill.name}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{skill.description}</p>
                  </div>
                  <Badge tone="accent">v{skill.version}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge>{skill.runner}</Badge>
                  <Badge>{skill.scope}</Badge>
                  <span className="ml-auto font-mono text-[10px] text-[var(--color-faint)]">{skill.id}</span>
                </div>
                <p className="mt-3 text-[10px] text-[var(--color-faint)]">
                  {skill.capabilities.length} permitted capabilit{skill.capabilities.length === 1 ? 'y' : 'ies'}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card><Empty title="No valid skills found" hint="Add a data/skills/<id>/SKILL.md file." /></Card>
      )}
    </div>
  )
}
