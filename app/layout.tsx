import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Geist, Geist_Mono } from 'next/font/google'
import { siteConfig } from '@/config/site'
import { DevNavPanel } from '@/components/dev/dev-nav-panel'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' })

// Métadonnées SEO globales, alimentées par la configuration centrale.
export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.seo.url),
  title: {
    default: siteConfig.seo.defaultTitle,
    template: siteConfig.seo.titleTemplate,
  },
  description: siteConfig.seo.description,
  keywords: [...siteConfig.seo.keywords],
  applicationName: siteConfig.brand.name,
  authors: [{ name: siteConfig.brand.name }],
  creator: siteConfig.brand.name,
  alternates: { canonical: '/' },
  // PWA : lien vers le manifest + icônes installables (Android/iOS).
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // iOS/Safari : "Ajouter à l'écran d'accueil" en mode app plein écran.
  appleWebApp: {
    capable: true,
    title: 'DetailFlow',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    locale: siteConfig.seo.locale,
    url: siteConfig.seo.url,
    siteName: siteConfig.brand.name,
    title: siteConfig.seo.defaultTitle,
    description: siteConfig.seo.description,
    images: [{ url: siteConfig.seo.ogImage, width: 1200, height: 630, alt: siteConfig.brand.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.seo.defaultTitle,
    description: siteConfig.seo.description,
    images: [siteConfig.seo.ogImage],
    ...(siteConfig.seo.twitterHandle ? { creator: siteConfig.seo.twitterHandle } : {}),
  },
  robots: { index: true, follow: true },
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#0a0a12',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fr"
      data-scroll-behavior="smooth"
      className={`dark ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-background font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
        {process.env.NODE_ENV !== 'production' && <DevNavPanel />}
      </body>
    </html>
  )
}
