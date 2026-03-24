// src/app/layout.tsx
// Public-Reports — Root Layout

import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';

// Body font — clean, readable
const inter = Inter({
  subsets:   ['latin'],
  variable:  '--font-body',
  display:   'swap',
});

// Display font — editorial feel for titles
const playfair = Playfair_Display({
  subsets:   ['latin'],
  variable:  '--font-display',
  display:   'swap',
});

export const metadata: Metadata = {
  title: {
    default:  'DeepDive AI — Research Report',
    template: '%s | DeepDive AI',
  },
  description:
    'AI-powered research reports. Explore insights, findings, and analysis — powered by DeepDive AI.',
  keywords: ['research', 'AI', 'report', 'analysis', 'DeepDive'],
  authors: [{ name: 'DeepDive AI' }],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://deepdive-reports.vercel.app'
  ),
  openGraph: {
    type:      'website',
    siteName:  'DeepDive AI',
    locale:    'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index:  true,
    follow: true,
    googleBot: {
      index:               true,
      follow:              true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet':       -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}