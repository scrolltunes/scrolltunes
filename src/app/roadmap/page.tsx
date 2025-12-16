"use client"

import { ArrowLeft, Check, EnvelopeSimple, XLogo } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"

const nowFeatures = [
  "Voice-activated scrolling",
  "Adjustable tempo",
  "Click any line to jump",
  "Keyboard shortcuts",
  "Screen wake lock",
  "Double-tap pause",
  "Shake to restart",
  "Recent songs",
  "Song search",
  "Shareable links",
  "Metronome",
]

const nextFeatures = [{ title: "Auto tempo", description: "Scroll speed based on song BPM" }]

const laterFeatures = [
  { title: "Chord charts", description: "See chords alongside lyrics" },
  { title: "Karaoke mode", description: "Large text, word-by-word highlight" },
  { title: "Voice search", description: "Find songs by speaking" },
]

const futureFeatures = [
  { title: "Spotify integration", description: "Search your library" },
  { title: "User accounts", description: "Sync across devices" },
  { title: "Jam sessions", description: "Play together in real-time" },
]

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/"
            className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </Link>
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
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Now
            </h2>
            <div className="flex flex-wrap gap-2">
              {nowFeatures.map(feature => (
                <span
                  key={feature}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 rounded-full text-sm"
                >
                  <Check size={14} weight="bold" className="text-green-500" />
                  {feature}
                </span>
              ))}
            </div>
          </section>

          {/* Next - Active development */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Next
            </h2>
            <div className="space-y-3">
              {nextFeatures.map(feature => (
                <div key={feature.title} className="p-4 bg-neutral-900 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                    <div>
                      <div className="font-medium text-white">{feature.title}</div>
                      <div className="text-sm text-neutral-400 mt-1">{feature.description}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Later - V2 features */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Later
            </h2>
            <div className="space-y-3">
              {laterFeatures.map(feature => (
                <div key={feature.title} className="p-4 bg-neutral-900 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-neutral-600 mt-2 shrink-0" />
                    <div>
                      <div className="font-medium text-white">{feature.title}</div>
                      <div className="text-sm text-neutral-400 mt-1">{feature.description}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Future - V3 features */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Future
            </h2>
            <div className="space-y-3">
              {futureFeatures.map(feature => (
                <div key={feature.title} className="p-4 bg-neutral-900 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-neutral-600 mt-2 shrink-0" />
                    <div>
                      <div className="font-medium text-white">{feature.title}</div>
                      <div className="text-sm text-neutral-400 mt-1">{feature.description}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Request a feature */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Request a feature
            </h2>
            <a
              href="https://x.com/ScrollTunes"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors"
            >
              <div className="font-medium text-white flex items-center gap-2">
                <XLogo size={18} />
                @ScrollTunes
              </div>
            </a>
            <a
              href="mailto:hello@scrolltunes.com"
              className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors mt-3"
            >
              <div className="font-medium text-white flex items-center gap-2">
                <EnvelopeSimple size={18} />
                hello@scrolltunes.com
              </div>
            </a>
          </section>
        </motion.div>
      </main>
    </div>
  )
}
