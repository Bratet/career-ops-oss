import type { Metadata } from 'next'
import { Nav } from '@/components/Nav'
import { NewApplicationProvider } from '@/components/NewApplicationDialog'
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
        <NewApplicationProvider>
          <Nav />
          <main className="mx-auto max-w-[1600px] px-6 py-6">{children}</main>
        </NewApplicationProvider>
      </body>
    </html>
  )
}
