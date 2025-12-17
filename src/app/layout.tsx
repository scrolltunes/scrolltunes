import { auth } from "@/auth"
import { AuthProvider } from "@/components/auth"
import { DevTitle, Footer, FooterProvider, ThemeProvider } from "@/components/layout"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "ScrollTunes — Live Lyrics Teleprompter for Musicians",
    template: "%s | ScrollTunes",
  },
  description:
    "Live lyrics teleprompter for musicians. Voice-activated scrolling syncs lyrics to your performance. Hands-free, distraction-free.",
  keywords: [
    "lyrics teleprompter",
    "live lyrics",
    "singing teleprompter",
    "musician tools",
    "karaoke",
    "song lyrics",
    "hands-free lyrics",
    "voice activated",
  ],
  authors: [{ name: "ScrollTunes" }],
  creator: "ScrollTunes",
  metadataBase: new URL("https://scrolltunes.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "ScrollTunes — Live Lyrics Teleprompter",
    description:
      "Voice-activated scrolling syncs lyrics to your performance. Hands-free, distraction-free.",
    siteName: "ScrollTunes",
    type: "website",
    locale: "en_US",
    url: "https://scrolltunes.com",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ScrollTunes — Live Lyrics Teleprompter for Musicians",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ScrollTunes — Live Lyrics Teleprompter",
    description:
      "Voice-activated scrolling syncs lyrics to your performance. Hands-free, distraction-free.",
    site: "@ScrollTunes",
    creator: "@ScrollTunes",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.json",
  other: {
    "msapplication-TileColor": "#0a0a0a",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth()

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider session={session}>
          <ThemeProvider>
            <FooterProvider>
              <DevTitle />
              {children}
              <Footer />
            </FooterProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
