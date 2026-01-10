"use client"

import { BackButton, Logo } from "@/components/ui"
import { ArrowRight, EnvelopeSimple, XLogo } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"

export default function AboutPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <header
        className="fixed top-0 left-0 right-0 z-20 backdrop-blur-lg"
        style={{
          background: "var(--color-header-bg)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <BackButton fallbackHref="/" ariaLabel="Back" />
          <h1 className="text-lg font-semibold">About</h1>
        </div>
      </header>

      <main className="pt-20 pb-8 px-4 max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-8"
        >
          {/* Logo */}
          <div className="flex items-center justify-center gap-3">
            <Logo size={48} colorful aria-label="ScrollTunes logo" />
            <span className="text-3xl font-semibold" style={{ color: "var(--color-text)" }}>
              ScrollTunes
            </span>
          </div>

          {/* What is ScrollTunes */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              What is ScrollTunes
            </h2>
            <div className="p-4 rounded-xl" style={{ background: "var(--color-surface1)" }}>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                A hands-free lyrics teleprompter for musicians. The lyrics start scrolling when you
                start singing, so you can focus on your performance instead of fumbling with your
                phone.
              </p>
            </div>
          </section>

          {/* Roadmap */}
          <section>
            <Link
              href="/roadmap"
              className="block p-4 rounded-xl transition-colors hover:brightness-110 group"
              style={{ background: "var(--color-surface1)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: "var(--color-text)" }}>
                    Roadmap
                  </div>
                  <div className="text-sm mt-1" style={{ color: "var(--color-text3)" }}>
                    See what's coming next
                  </div>
                </div>
                <ArrowRight size={20} style={{ color: "var(--color-text-muted)" }} />
              </div>
            </Link>
          </section>

          {/* How it works */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              How it works
            </h2>
            <div
              className="p-4 rounded-xl space-y-4"
              style={{ background: "var(--color-surface1)" }}
            >
              <div>
                <h3 className="text-sm font-medium mb-2" style={{ color: "var(--color-text3)" }}>
                  Voice Detection
                </h3>
                <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                  Start singing and ScrollTunes begins scrolling automatically. Voice detection runs
                  entirely on your device — no audio is ever recorded or sent anywhere. Pause with a
                  tap, double-tap, or keyboard shortcut
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2" style={{ color: "var(--color-text3)" }}>
                  Voice Search
                </h3>
                <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                  Find songs hands-free by speaking the title. This optional feature requires an
                  account and uses third-party speech recognition (Google Cloud or OpenAI Whisper)
                  to transcribe your voice
                </p>
              </div>
            </div>
          </section>

          {/* Features */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Features
            </h2>
            <div
              className="p-4 rounded-xl space-y-3"
              style={{ background: "var(--color-surface1)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-2 h-2 rounded-full mt-2 shrink-0"
                  style={{ background: "var(--color-accent)" }}
                />
                <p style={{ color: "var(--color-text2)" }}>Voice-activated scrolling</p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className="w-2 h-2 rounded-full mt-2 shrink-0"
                  style={{ background: "var(--color-accent)" }}
                />
                <p style={{ color: "var(--color-text2)" }}>Song search and voice search</p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className="w-2 h-2 rounded-full mt-2 shrink-0"
                  style={{ background: "var(--color-accent)" }}
                />
                <p style={{ color: "var(--color-text2)" }}>Visual and audio metronome</p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className="w-2 h-2 rounded-full mt-2 shrink-0"
                  style={{ background: "var(--color-accent)" }}
                />
                <p style={{ color: "var(--color-text2)" }}>Favorites and setlists</p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className="w-2 h-2 rounded-full mt-2 shrink-0"
                  style={{ background: "var(--color-accent)" }}
                />
                <p style={{ color: "var(--color-text2)" }}>Cross-device sync with a free account</p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className="w-2 h-2 rounded-full mt-2 shrink-0"
                  style={{ background: "var(--color-warning)" }}
                />
                <p style={{ color: "var(--color-text2)" }}>
                  Guitar chords with transpose
                  <span
                    className="ml-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded"
                    style={{
                      background: "var(--color-warning-soft)",
                      color: "var(--color-warning)",
                    }}
                  >
                    Coming soon
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* Privacy First */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Privacy First
            </h2>
            <div className="space-y-4">
              {/* Without an account */}
              <div
                className="p-4 rounded-xl space-y-3"
                style={{ background: "var(--color-surface1)" }}
              >
                <h3 className="text-sm font-medium" style={{ color: "var(--color-text3)" }}>
                  Without an account
                </h3>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-success)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>
                    No analytics or tracking cookies for anonymous users
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-success)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>
                    No server-side storage - your preferences and recent songs stay in your browser
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-success)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>
                    Audio processed entirely on your device - never recorded, stored, or sent to our
                    servers
                  </p>
                </div>
              </div>

              {/* With an account */}
              <div
                className="p-4 rounded-xl space-y-3"
                style={{ background: "var(--color-surface1)" }}
              >
                <h3 className="text-sm font-medium" style={{ color: "var(--color-text3)" }}>
                  With an account
                </h3>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-accent)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>
                    We store your songs, favorites, and setlists to sync across devices
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-accent)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>
                    We enable analytics to improve ScrollTunes (you consent when signing up)
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-accent)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>
                    We use a session cookie to keep you logged in
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-accent)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>
                    Voice detection runs locally; voice search sends audio to third-party providers
                    for transcription only
                  </p>
                </div>
              </div>

              {/* Always */}
              <div
                className="p-4 rounded-xl space-y-3"
                style={{ background: "var(--color-surface1)" }}
              >
                <h3 className="text-sm font-medium" style={{ color: "var(--color-text3)" }}>
                  Always
                </h3>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-success)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>
                    No advertising or marketing trackers
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-success)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>No selling of your data</p>
                </div>
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ background: "var(--color-success)" }}
                  />
                  <p style={{ color: "var(--color-text2)" }}>
                    You control your data - export or delete anytime
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Data Sources */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Data Sources
            </h2>
            <p className="text-sm mb-3 px-1" style={{ color: "var(--color-text3)" }}>
              Lyrics and tempo data are fetched on-demand from third-party services
            </p>
            <div className="space-y-3">
              <a
                href="https://lrclib.net"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 rounded-xl transition-colors hover:brightness-110"
                style={{ background: "var(--color-surface1)" }}
              >
                <div className="font-medium" style={{ color: "var(--color-text)" }}>
                  LRCLIB
                </div>
                <div className="text-sm mt-1" style={{ color: "var(--color-text3)" }}>
                  Synced lyrics database — lrclib.net
                </div>
              </a>
              <a
                href="https://getsongbpm.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 rounded-xl transition-colors hover:brightness-110"
                style={{ background: "var(--color-surface1)" }}
              >
                <div className="font-medium" style={{ color: "var(--color-text)" }}>
                  GetSongBPM
                </div>
                <div className="text-sm mt-1" style={{ color: "var(--color-text3)" }}>
                  Tempo and BPM data — getsongbpm.com
                </div>
              </a>
              <a
                href="https://songsterr.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 rounded-xl transition-colors hover:brightness-110"
                style={{ background: "var(--color-surface1)" }}
              >
                <div className="font-medium" style={{ color: "var(--color-text)" }}>
                  Songsterr
                </div>
                <div className="text-sm mt-1" style={{ color: "var(--color-text3)" }}>
                  Guitar chords and tabs — songsterr.com
                </div>
              </a>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Contact
            </h2>
            <a
              href="https://x.com/ScrollTunes"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded-xl transition-colors hover:brightness-110"
              style={{ background: "var(--color-surface1)" }}
            >
              <div
                className="font-medium flex items-center gap-2"
                style={{ color: "var(--color-text)" }}
              >
                <XLogo size={18} />
                @ScrollTunes
              </div>
            </a>
            <a
              href="mailto:contact@scrolltunes.com"
              className="block p-4 rounded-xl transition-colors hover:brightness-110 mt-3"
              style={{ background: "var(--color-surface1)" }}
            >
              <div
                className="font-medium flex items-center gap-2"
                style={{ color: "var(--color-text)" }}
              >
                <EnvelopeSimple size={18} />
                contact@scrolltunes.com
              </div>
            </a>
          </section>

          {/* Legal */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Legal
            </h2>
            <div className="space-y-3">
              <Link
                href="/terms"
                className="block p-4 rounded-xl transition-colors hover:brightness-110"
                style={{ background: "var(--color-surface1)" }}
              >
                <div className="font-medium" style={{ color: "var(--color-text)" }}>
                  Terms of Service
                </div>
              </Link>
              <Link
                href="/privacy"
                className="block p-4 rounded-xl transition-colors hover:brightness-110"
                style={{ background: "var(--color-surface1)" }}
              >
                <div className="font-medium" style={{ color: "var(--color-text)" }}>
                  Privacy Policy
                </div>
              </Link>
            </div>
          </section>

          {/* Copyright */}
          <div className="text-center text-sm pt-4" style={{ color: "var(--color-text-muted)" }}>
            © 2025–2026 ScrollTunes. All rights reserved.
          </div>
        </motion.div>
      </main>
    </div>
  )
}
