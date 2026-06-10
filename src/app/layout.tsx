import type { Metadata } from 'next';

import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { ThemeProvider, themeNoFlashScript } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: {
    default: 'PostUp',
    template: '%s · PostUp',
  },
  description:
    'PostUp — a modern community platform. Join Hubs, share Drops, Boost what you love.',
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
        <ThemeProvider>
          <SiteHeader />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
