"use client"

import { BackButton } from "@/components/ui"
import { ArrowRight, EnvelopeSimple, XLogo } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Image from "next/image"
import Link from "next/link"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
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
          <div className="flex justify-center">
            <Image
              src="/scrolltunes-logo.png"
              alt="ScrollTunes logo"
              width={120}
              height={120}
              priority
            />
          </div>

          {/* What is ScrollTunes */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              What is ScrollTunes
            </h2>
            <div className="p-4 bg-neutral-900 rounded-xl">
              <p className="text-neutral-300 leading-relaxed">
                A live lyrics teleprompter for musicians. Place your phone on a music stand and
                perform hands-free with synced scrolling lyrics
              </p>
            </div>
          </section>

          {/* Roadmap */}
          <section>
            <Link
              href="/roadmap"
              className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">Roadmap</div>
                  <div className="text-sm text-neutral-400 mt-1">See what's coming next</div>
                </div>
                <ArrowRight
                  size={20}
                  className="text-neutral-500 group-hover:text-neutral-300 transition-colors"
                />
              </div>
            </Link>
          </section>

          {/* How it works */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              How it works
            </h2>
            <div className="p-4 bg-neutral-900 rounded-xl space-y-4">
              <div>
                <h3 className="text-sm font-medium text-neutral-400 mb-2">Voice Detection</h3>
                <p className="text-neutral-300 leading-relaxed">
                  Start singing and ScrollTunes begins scrolling automatically. Voice detection runs
                  entirely on your device — no audio is ever recorded or sent anywhere. Pause with a
                  tap, double-tap, or keyboard shortcut
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-neutral-400 mb-2">Voice Search</h3>
                <p className="text-neutral-300 leading-relaxed">
                  Find songs hands-free by speaking the title. This optional feature requires an
                  account and uses third-party speech recognition (Google Cloud or OpenAI Whisper)
                  to transcribe your voice
                </p>
              </div>
            </div>
          </section>

          {/* Features */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Features
            </h2>
            <div className="p-4 bg-neutral-900 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Voice-activated scrolling</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Song search and voice search</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Visual and audio metronome</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Favorites and setlists</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Cross-device sync with a free account</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0" />
                <p className="text-neutral-300">
                  Guitar chords with transpose
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-amber-500/20 text-amber-400 rounded">
                    Coming soon
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* Privacy First */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Privacy First
            </h2>
            <div className="space-y-4">
              {/* Without an account */}
              <div className="p-4 bg-neutral-900 rounded-xl space-y-3">
                <h3 className="text-sm font-medium text-neutral-400">Without an account</h3>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">
                    No analytics or tracking cookies for anonymous users
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">
                    No server-side storage - your preferences and recent songs stay in your browser
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">
                    Audio processed entirely on your device - never recorded, stored, or sent to our
                    servers
                  </p>
                </div>
              </div>

              {/* With an account */}
              <div className="p-4 bg-neutral-900 rounded-xl space-y-3">
                <h3 className="text-sm font-medium text-neutral-400">With an account</h3>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">
                    We store your songs, favorites, and setlists to sync across devices
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">
                    We enable analytics to improve ScrollTunes (you consent when signing up)
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">We use a session cookie to keep you logged in</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">
                    Voice detection runs locally; voice search sends audio to third-party providers
                    for transcription only
                  </p>
                </div>
              </div>

              {/* Always */}
              <div className="p-4 bg-neutral-900 rounded-xl space-y-3">
                <h3 className="text-sm font-medium text-neutral-400">Always</h3>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">No advertising or marketing trackers</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">No selling of your data</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">
                    You control your data - export or delete anytime
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Data Sources */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Data Sources
            </h2>
            <p className="text-neutral-400 text-sm mb-3 px-1">
              Lyrics and tempo data are fetched on-demand from third-party services
            </p>
            <div className="space-y-3">
              <a
                href="https://lrclib.net"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors"
              >
                <div className="font-medium text-white">LRCLIB</div>
                <div className="text-sm text-neutral-400 mt-1">
                  Synced lyrics database — lrclib.net
                </div>
              </a>
              <a
                href="https://getsongbpm.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors"
              >
                <div className="font-medium text-white">GetSongBPM</div>
                <div className="text-sm text-neutral-400 mt-1">
                  Tempo and BPM data — getsongbpm.com
                </div>
              </a>
              <a
                href="https://songsterr.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors"
              >
                <div className="font-medium text-white">Songsterr</div>
                <div className="text-sm text-neutral-400 mt-1">
                  Guitar chords and tabs — songsterr.com
                </div>
              </a>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Contact
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
              href="mailto:contact@scrolltunes.com"
              className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors mt-3"
            >
              <div className="font-medium text-white flex items-center gap-2">
                <EnvelopeSimple size={18} />
                contact@scrolltunes.com
              </div>
            </a>
          </section>

          {/* Legal */}
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
              Legal
            </h2>
            <div className="space-y-3">
              <Link
                href="/terms"
                className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors"
              >
                <div className="font-medium text-white">Terms of Service</div>
              </Link>
              <Link
                href="/privacy"
                className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors"
              >
                <div className="font-medium text-white">Privacy Policy</div>
              </Link>
            </div>
          </section>

          {/* Copyright */}
          <div className="text-center text-sm text-neutral-500 pt-4">
            © 2025–2026 ScrollTunes. All rights reserved.
          </div>
        </motion.div>
      </main>
    </div>
  )
}
