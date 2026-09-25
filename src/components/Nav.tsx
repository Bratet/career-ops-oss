'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { BriefcaseBusiness, ChartNoAxesCombined, CircleHelp, FileUser, ListTodo, Plus, Settings2, Sparkles } from 'lucide-react'

const LINKS = [
  { href: '/', label: 'Overview', icon: ChartNoAxesCombined },
  { href: '/applications', label: 'Applications', icon: BriefcaseBusiness },
  { href: '/plan', label: 'Saved searches', icon: ListTodo },
  { href: '/profile', label: 'Profile', icon: FileUser },
  { href: '/skills', label: 'Skills', icon: Sparkles },
  { href: '/runs', label: 'AI runs', icon: CircleHelp },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95">
      <div className="mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-sm font-semibold tracking-tight" aria-label="Career Ops home">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--color-accent)] text-[12px] font-bold text-white">co</span>
          <span>career<span className="text-[var(--color-accent)]">/</span>ops</span>
        </Link>
        <nav aria-label="Primary navigation" className="order-last flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {LINKS.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                  active
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <link.icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
            className={cn('grid size-9 place-items-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]', pathname.startsWith('/settings') && 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]')}
          >
            <Settings2 aria-hidden="true" className="size-4" />
          </Link>
          <Link
            href="/new"
            className="flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-xs font-semibold text-white transition-colors hover:opacity-90"
          >
            <Plus aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">New application</span><span className="sm:hidden">New</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
