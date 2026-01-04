"use client"

import { Check, EnvelopeSimple, XLogo } from "@phosphor-icons/react"
import { motion } from "motion/react"

import { BackButton } from "@/components/ui"

const nowFeatures: Array<string | { title: string; beta?: boolean }> = [
  "Voice-activated scrolling",
  "Song search",
  "Metronome",
  "User accounts",
  "Favorites and setlists",
  "Cross-device sync",
  "Voice search",
]

const nextFeatures = [
  { title: "Guitar chords", description: "Display chords with transpose support" },
  { title: "Auto tempo", description: "Match scroll speed to your playing" },
]

const laterFeatures = [
  { title: "Karaoke mode", description: "Large text, word-by-word highlight" },
  { title: "Spotify integration", description: "Search your library" },
  { title: "Jam sessions", description: "Play together in real-time" },
]

export default function RoadmapPage() {
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
          <BackButton fallbackHref="/about" ariaLabel="Back" />
          <h1 className="text-lg font-semibold">Roadmap</h1>
        </div>
      </header>

      <main className="pt-20 pb-8 px-4 max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-8"
        >
          {/* Now - Shipped features */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Now
            </h2>
            <div className="p-4 rounded-xl space-y-3" style={{ background: "var(--color-surface1)" }}>
              {nowFeatures.map(feature => {
                const title = typeof feature === "string" ? feature : feature.title
                const isBeta = typeof feature === "object" && feature.beta
                return (
                  <div key={title} className="flex items-center gap-3">
                    <Check
                      size={16}
                      weight="bold"
                      className="shrink-0"
                      style={{ color: "var(--color-success)" }}
                    />
                    <span style={{ color: "var(--color-text2)" }}>{title}</span>
                    {isBeta && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded"
                        style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
                      >
                        Beta
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Next - Active development */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Next
            </h2>
            <div className="space-y-3">
              {nextFeatures.map(feature => (
                <div
                  key={feature.title}
                  className="p-4 rounded-xl"
                  style={{ background: "var(--color-surface1)" }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-2 h-2 rounded-full mt-2 shrink-0"
                      style={{ background: "var(--color-accent)" }}
                    />
                    <div>
                      <div className="font-medium" style={{ color: "var(--color-text)" }}>
                        {feature.title}
                      </div>
                      <div className="text-sm mt-1" style={{ color: "var(--color-text3)" }}>
                        {feature.description}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Later */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Later
            </h2>
            <div className="space-y-3">
              {laterFeatures.map(feature => (
                <div
                  key={feature.title}
                  className="p-4 rounded-xl"
                  style={{ background: "var(--color-surface1)" }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-2 h-2 rounded-full mt-2 shrink-0"
                      style={{ background: "var(--color-text-muted)" }}
                    />
                    <div>
                      <div className="font-medium" style={{ color: "var(--color-text)" }}>
                        {feature.title}
                      </div>
                      <div className="text-sm mt-1" style={{ color: "var(--color-text3)" }}>
                        {feature.description}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Request a feature */}
          <section>
            <h2
              className="text-sm font-medium uppercase tracking-wider mb-3 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Request a feature
            </h2>
            <a
              href="https://x.com/ScrollTunes"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded-xl transition-colors hover:brightness-110"
              style={{ background: "var(--color-surface1)" }}
            >
              <div className="font-medium flex items-center gap-2" style={{ color: "var(--color-text)" }}>
                <XLogo size={18} />
                @ScrollTunes
              </div>
            </a>
            <a
              href="mailto:contact@scrolltunes.com"
              className="block p-4 rounded-xl transition-colors hover:brightness-110 mt-3"
              style={{ background: "var(--color-surface1)" }}
            >
              <div className="font-medium flex items-center gap-2" style={{ color: "var(--color-text)" }}>
                <EnvelopeSimple size={18} />
                contact@scrolltunes.com
              </div>
            </a>
          </section>
        </motion.div>
      </main>
    </div>
  )
}
