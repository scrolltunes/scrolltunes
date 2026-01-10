import "@/services/validate-env"
import { auth } from "@/auth"
import { AuthProvider } from "@/components/auth"
import { DevTitle, Footer, FooterProvider, ThemeProvider } from "@/components/layout"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { headers } from "next/headers"
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
    default: "ScrollTunes | Live Lyrics Teleprompter for Musicians",
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
  metadataBase: new URL("https://www.scrolltunes.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "ScrollTunes | Live Lyrics Teleprompter",
    description:
      "Voice-activated scrolling syncs lyrics to your performance. Hands-free, distraction-free.",
    siteName: "ScrollTunes",
    type: "website",
    locale: "en_US",
    url: "https://www.scrolltunes.com",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ScrollTunes | Live Lyrics Teleprompter for Musicians",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ScrollTunes | Live Lyrics Teleprompter",
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
  // Log user agent for testing mobile detection
  const headersList = await headers()
  const userAgent = headersList.get("user-agent")
  console.log("[PAGE] User-Agent:", userAgent)

  const session = await auth()

  return (
    <html lang="en" suppressHydrationWarning style={{ background: "#070A12" }}>
      <head>
        {/* Color scheme hint for browser - processed very early */}
        <meta name="color-scheme" content="dark light" />
        {/* Critical CSS for theme - no media query to avoid flash before JS checks preferences */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              "html,body{background:#070A12!important}html.light,html.light body{background:#FAF7F2!important}",
          }}
        />
        {/* Inline blocking script to set theme class based on user preference */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){let d=true;try{const s=localStorage.getItem("scrolltunes-preferences");const p=s?JSON.parse(s):{};const m=p.themeMode||"system";d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)}catch(e){}document.documentElement.classList.add(d?"dark":"light");document.documentElement.style.background=d?"#070A12":"#FAF7F2"})()`,
          }}
        />
      </head>
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
