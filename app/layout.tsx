import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'MyNorth - AI-Powered Planning Platform',
  description: 'Eliminate the paralysis between your goals and daily action with Morgan, your personal AI companion.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-alabaster text-obsidian">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
