"use client"

import { ArrowLeft, ArrowRight, EnvelopeSimple, XLogo } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"

export default function AboutPage() {
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
            <div className="p-4 bg-neutral-900 rounded-xl">
              <p className="text-neutral-300 leading-relaxed">
                Voice detection syncs lyrics to your performance. Start singing and ScrollTunes
                begins scrolling automatically. Pause with a tap, double-tap, or keyboard shortcut
              </p>
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
                <p className="text-neutral-300">
                  Detect voice activity to start scrolling automatically
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">
                  Adjust scroll speed with tempo controls or keyboard
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Tap any line to jump to that position</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Double-tap anywhere to pause or resume</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Visual and audio metronome synced to song tempo</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Keep screen awake during performance</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">Quickly reopen recently played songs</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <p className="text-neutral-300">
                  Voice search to find songs hands-free (sign in required)
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
                    No server-side data storage — everything stays in your browser
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">No cookies, no tracking, no analytics</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">
                    Microphone used for voice detection only — never recorded
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
                    We use analytics to improve ScrollTunes (you consent when signing up)
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">We use a session cookie to keep you logged in</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <p className="text-neutral-300">
                    Microphone is still never recorded — voice detection runs locally
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
                    You control your data — export or delete anytime
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
              href="mailto:hello@scrolltunes.com"
              className="block p-4 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition-colors mt-3"
            >
              <div className="font-medium text-white flex items-center gap-2">
                <EnvelopeSimple size={18} />
                hello@scrolltunes.com
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
        </motion.div>
      </main>
    </div>
  )
}
