"use client"

import { UserMenu } from "@/components/auth"
import { LogoMenu } from "@/components/layout"
import { HomeSetlists, RecentSongs, SongSearch } from "@/components/search"
import { AmbientBackground, Attribution, Logo } from "@/components/ui"
import { CaretDown, GearSix } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useState } from "react"

const linkStyle = { color: "var(--color-accent)" }

const faqItems: { question: string; answer: React.ReactNode }[] = [
  {
    question: "What is ScrollTunes?",
    answer:
      "A live lyrics teleprompter for musicians. There's nothing more annoying than reading lyrics off a phone balanced on your knee while playing guitar. So we built this. Now you just sing, and the lyrics follow along.",
  },
  {
    question: "Is it free?",
    answer: (
      <>
        Yes, ScrollTunes is free to use. We use third-party services to fetch lyrics, tempo, and
        other song data. Due to rate limiting and content availability from these sources, not every
        song may be available -{" "}
        <a href="mailto:contact@scrolltunes.com" className="hover:brightness-110" style={linkStyle}>
          let us know
        </a>{" "}
        if something is missing!
      </>
    ),
  },
  {
    question: "Is there a mobile app for iPhone or Android?",
    answer:
      "No, ScrollTunes runs entirely in your browser on desktop, tablet, or phone. The app may request microphone permission so it can listen to your singing, but audio is processed entirely on your device and is never recorded, stored, or sent to our servers.",
  },
  {
    question: "How is this different from karaoke apps?",
    answer:
      "Karaoke apps play the original track and sync lyrics to it. ScrollTunes doesn't need the track - just the song metadata and tempo, which we fetch from third-party services. You play the music - we scroll the lyrics.",
  },
  {
    question: "Why am I being asked to sign in with Google?",
    answer: (
      <>
        Some features require an account, including voice search, favorites, setlists, and syncing
        your data across devices. To create an account, you will be asked to accept our{" "}
        <Link href="/terms" className="hover:brightness-110" style={linkStyle}>
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="hover:brightness-110" style={linkStyle}>
          Privacy Policy
        </Link>
        , because we store your account data and enable analytics for signed-in users. You can use
        all core features without signing in.
      </>
    ),
  },
  {
    question: "Can I support you?",
    answer: (
      <>
        Thank you for asking! The best way to support us right now is to use ScrollTunes and let us
        know what you think. You can report issues or request features on X (Twitter){" "}
        <a
          href="https://x.com/ScrollTunes"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:brightness-110"
          style={linkStyle}
        >
          @ScrollTunes
        </a>{" "}
        or via the Report an issue link in the app.
      </>
    ),
  },
  {
    question: "How can I contact you?",
    answer: (
      <>
        Head over to the{" "}
        <Link href="/about" className="hover:brightness-110" style={linkStyle}>
          About page
        </Link>{" "}
        for contact details. You can reach us on X (Twitter){" "}
        <a
          href="https://x.com/ScrollTunes"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:brightness-110"
          style={linkStyle}
        >
          @ScrollTunes
        </a>{" "}
        or by email at{" "}
        <a
          href="mailto:contact@scrolltunes.com"
          className="hover:brightness-110"
          style={linkStyle}
        >
          contact@scrolltunes.com
        </a>
        .
      </>
    ),
  },
]

export default function Home() {
  return (
    <div
      className="min-h-screen pb-7"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <AmbientBackground variant="subtle" />
      <header
        className="fixed top-0 left-0 right-0 z-20 backdrop-blur-lg"
        style={{
          background: "rgba(7, 10, 18, 0.8)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <LogoMenu />

          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:brightness-110"
              style={{ background: "var(--color-surface2)" }}
              aria-label="Settings"
            >
              <GearSix size={20} />
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="pt-16 flex flex-col relative z-10">
        {/* Hero Section - Search First */}
        <section className="flex flex-col items-center px-6 pt-20 pb-12">
          <div
            className="mb-8 w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: "var(--color-surface1)" }}
          >
            <Logo size={56} style={{ color: "var(--color-accent)" }} />
          </div>
          <SongSearch className="w-full max-w-md" />
          <Attribution
            lyrics={{ name: "LRCLIB", url: "https://lrclib.net" }}
            bpm={{ name: "GetSongBPM", url: "https://getsongbpm.com" }}
            className="mt-4"
          />
        </section>

        {/* Secondary Content */}
        <div className="flex-1 px-6 pb-8 max-w-3xl mx-auto w-full space-y-10">
          <RecentSongs className="w-full" layout="horizontal" />

          <HomeSetlists className="w-full" />

          <FAQSection />
        </div>
      </main>
    </div>
  )
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="w-full max-w-md mx-auto">
      <h2
        className="text-sm font-medium uppercase tracking-wider mb-4 px-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        FAQ
      </h2>
      <div className="space-y-3">
        {faqItems.map((item, index) => (
          <div
            key={item.question}
            className="rounded-xl overflow-hidden"
            style={{
              background: "var(--color-surface1)",
              border: "1px solid var(--color-border)",
            }}
          >
            <button
              type="button"
              onClick={() => toggle(index)}
              className="w-full p-4 flex items-center justify-between text-left"
            >
              <h3 className="font-medium" style={{ color: "var(--color-text)" }}>
                {item.question}
              </h3>
              <motion.span
                animate={{ rotate: openIndex === index ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                style={{ color: "var(--color-text-muted)" }}
              >
                <CaretDown size={18} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {openIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <p
                    className="text-sm leading-relaxed px-4 pb-4"
                    style={{ color: "var(--color-text2)" }}
                  >
                    {item.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  )
}
