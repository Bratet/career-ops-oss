import type { Metadata } from 'next'
import { Nav } from '@/components/Nav'
import './globals.css'

export const metadata: Metadata = {
  title: 'career-ops',
  description: 'Job application pipeline: tailor, render, track.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { const theme = localStorage.getItem('career-ops-theme'); document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system' })()`,
          }}
        />
      </head>
      <body>
        <Nav />
        <main className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 sm:py-8">{children}</main>
      </body>
    </html>
  )
}
