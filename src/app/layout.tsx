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
  title: "ScrollTunes",
  description: "Live lyrics teleprompter for musicians. Voice-triggered scrolling, hands-free control.",
  metadataBase: new URL("https://scrolltunes.vercel.app"),
  openGraph: {
    title: "ScrollTunes",
    description: "Live lyrics teleprompter for musicians. Voice-triggered scrolling, hands-free control.",
    siteName: "ScrollTunes",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ScrollTunes",
    description: "Live lyrics teleprompter for musicians. Voice-triggered scrolling, hands-free control.",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  )
}
