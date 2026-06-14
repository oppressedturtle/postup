import type { Metadata } from 'next';

import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { ThemeProvider, themeNoFlashScript } from '@/components/theme-provider';
import { SessionProvider } from '@/components/session-provider';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXTAUTH_URL),
  title: {
    default: 'PostUp',
    template: '%s · PostUp',
  },
  description:
    'PostUp — a modern community platform. Join Hubs, share Drops, Boost what you love.',
  openGraph: {
    siteName: 'PostUp',
    title: 'PostUp',
    description:
      'PostUp — a modern community platform. Join Hubs, share Drops, Boost what you love.',
    images: [
      {
        url: '/api/og?title=PostUp&description=A+modern+community+platform&type=default',
        width: 1200,
        height: 630,
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'PostUp',
    description:
      'PostUp — a modern community platform. Join Hubs, share Drops, Boost what you love.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body className="min-h-screen">
        <SessionProvider>
          <ThemeProvider>
            <a href="#main-content" className="skip-link">
              Skip to content
            </a>
            <SiteHeader />
            <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
              {children}
            </main>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
