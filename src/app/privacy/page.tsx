"use client"

import { ArrowLeft } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"

export default function PrivacyPage() {
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
          <h1 className="text-lg font-semibold">Privacy Policy</h1>
        </div>
      </header>

      <main className="pt-20 pb-8 px-4 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-8"
        >
          <p className="text-sm text-neutral-500">Last updated: December 2025</p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Overview</h2>
            <p className="text-neutral-300 leading-relaxed">
              ScrollTunes is built with privacy as a core principle. We collect no personal data,
              require no account, and store nothing on our servers.
            </p>
            <div className="p-4 bg-neutral-900 rounded-xl space-y-2 text-sm">
              <div className="flex items-center gap-2 text-green-400">
                <span>✓</span>
                <span>No account or registration required</span>
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <span>✓</span>
                <span>No server-side data retention</span>
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <span>✓</span>
                <span>No first-party tracking, analytics, or cookies</span>
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <span>✓</span>
                <span>Microphone audio is never recorded or transmitted</span>
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <span>✓</span>
                <span>All data stays in your browser</span>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Information We Collect</h2>
            <div className="space-y-4 text-neutral-300 leading-relaxed">
              <div>
                <h3 className="font-medium text-white mb-2">Local Storage</h3>
                <p>
                  We store your preferences, recent songs, and cached lyrics locally in your
                  browser. This data never leaves your device.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-white mb-2">Microphone Access</h3>
                <p>
                  ScrollTunes requests microphone access for voice activity detection to enable
                  hands-free scrolling. Audio is processed entirely on your device and is never
                  recorded, stored, or transmitted to any server.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-white mb-2">No Accounts or Server Data</h3>
                <p>
                  ScrollTunes does not require user accounts. We do not collect personal
                  information, and we do not store any user data on our servers.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Technical Logs</h2>
            <p className="text-neutral-300 leading-relaxed">
              Our hosting provider,{" "}
              <a
                href="https://vercel.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                Vercel
              </a>
              , may automatically collect technical information such as IP addresses, browser type,
              and request timestamps as part of standard web server operations. ScrollTunes does not
              use these logs to identify individual users.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">How We Use Information</h2>
            <p className="text-neutral-300 leading-relaxed">
              The data stored locally is used solely to improve your experience: remembering your
              preferences, displaying recently played songs, and caching lyrics for faster loading.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Third-Party Services</h2>
            <p className="text-neutral-300 leading-relaxed">
              ScrollTunes uses the following third-party services:
            </p>
            <ul className="list-disc list-inside text-neutral-300 space-y-2 ml-2">
              <li>
                <a
                  href="https://lrclib.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  LRCLIB
                </a>{" "}
                — for fetching song lyrics
              </li>
              <li>
                <a
                  href="https://getsongbpm.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  GetSongBPM
                </a>{" "}
                — for tempo and song metadata
              </li>
              <li>
                <a
                  href="https://vercel.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  Vercel
                </a>{" "}
                — for hosting the application
              </li>
            </ul>
            <p className="text-neutral-300 leading-relaxed">
              When you search for songs, the artist name, track title, and your IP address are sent
              to LRCLIB and GetSongBPM. These services may log this information according to their
              own privacy policies. Third-party services may use cookies or other tracking
              technologies for their own purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Data Storage</h2>
            <p className="text-neutral-300 leading-relaxed">
              All user data is stored in your browser&apos;s localStorage. Cached lyrics have a
              7-day TTL (time-to-live) and are automatically refreshed. No data is sent to or stored
              on ScrollTunes servers.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Your Rights</h2>
            <p className="text-neutral-300 leading-relaxed">
              You can clear all locally stored data at any time by clearing your browser&apos;s
              localStorage or using your browser&apos;s &quot;Clear site data&quot; feature. You can
              also revoke microphone permissions through your browser settings.
            </p>
            <p className="text-neutral-300 leading-relaxed">
              Depending on your location, you may have additional rights under laws like GDPR or
              CCPA. Since ScrollTunes does not maintain user accounts or persistent identifiers,
              most of your data exists only in your browser and is under your control. For any data
              that may be collected by our hosting provider or third-party services, please refer to
              their respective privacy policies. For privacy-related requests, contact us at{" "}
              <a
                href="https://twitter.com/ScrollTunes"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                @ScrollTunes
              </a>{" "}
              on Twitter.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Children&apos;s Privacy</h2>
            <p className="text-neutral-300 leading-relaxed">
              ScrollTunes is intended for users who are 13 years of age or older. If you are under
              13, please do not use this service. If we learn that a child under 13 has used
              ScrollTunes, we will take appropriate steps to remove any associated data from
              third-party services where possible. If you believe a child has used our service,
              please contact us at{" "}
              <a
                href="https://twitter.com/ScrollTunes"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                @ScrollTunes
              </a>{" "}
              on Twitter.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Changes to This Policy</h2>
            <p className="text-neutral-300 leading-relaxed">
              We may update this privacy policy from time to time. Any changes will be reflected on
              this page with an updated revision date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Contact</h2>
            <p className="text-neutral-300 leading-relaxed">
              If you have questions about this privacy policy, you can reach us at{" "}
              <a
                href="https://twitter.com/ScrollTunes"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                @ScrollTunes
              </a>{" "}
              on Twitter.
            </p>
          </section>
        </motion.div>
      </main>
    </div>
  )
}
