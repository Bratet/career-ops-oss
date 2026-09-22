'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemePicker } from '@/components/ThemePicker'
import { useNewApplication } from '@/components/NewApplicationDialog'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/applications', label: 'Applications' },
  { href: '/plan', label: 'Apply plan' },
  { href: '/profile', label: 'Profile' },
  { href: '/skills', label: 'Skills' },
  { href: '/runs', label: 'Runs' },
]

export function Nav() {
  const pathname = usePathname()
  const { openNewApplication } = useNewApplication()

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-2">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-[var(--color-accent)] text-[11px] font-bold text-[var(--color-bg)]">co</span>
          career-ops
        </Link>
        <nav className="order-last flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {LINKS.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                  active
                    ? 'bg-[var(--color-surface-2)] text-[var(--color-text)]'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={openNewApplication}
            className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90"
          >
            <span aria-hidden="true" className="text-base leading-none">+</span>
            New application
          </button>
          <ThemePicker />
        </div>
      </div>
    </header>
  )
}
