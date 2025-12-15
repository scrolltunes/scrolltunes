"use client"

import { ArrowLeft } from "@phosphor-icons/react"
import Link from "next/link"

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft size={20} />
          Back to ScrollTunes
        </Link>

        <h1 className="mb-2 text-4xl font-bold">Terms of Service</h1>
        <p className="mb-12 text-neutral-400">Last updated: December 2024</p>

        <div className="space-y-10">
          <section>
            <h2 className="mb-4 text-2xl font-semibold">Acceptance of Terms</h2>
            <p className="leading-relaxed text-neutral-300">
              By accessing or using ScrollTunes, you agree to be bound by these Terms of Service. If
              you do not agree to these terms, please do not use the service.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Description of Service</h2>
            <p className="leading-relaxed text-neutral-300">
              ScrollTunes is a live lyrics teleprompter designed for musicians. The service provides
              real-time lyrics display with automatic scrolling synchronized to your voice through
              voice activity detection. ScrollTunes helps performers focus on their music without
              manual scrolling or page turns.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Privacy and Data</h2>
            <p className="mb-4 leading-relaxed text-neutral-300">
              ScrollTunes is designed with privacy in mind:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-neutral-300">
              <li>
                <strong>No account required</strong> — Use the service immediately without
                registration
              </li>
              <li>
                <strong>No server-side data retention</strong> — We do not store any user data on
                our servers
              </li>
              <li>
                <strong>Local storage only</strong> — Preferences and cached lyrics are stored in
                your browser
              </li>
              <li>
                <strong>Microphone privacy</strong> — Voice detection runs locally; audio is never
                recorded, transmitted, or stored
              </li>
              <li>
                <strong>No tracking</strong> — We do not use analytics, tracking cookies, or collect
                personal information
              </li>
            </ul>
            <p className="mt-4 leading-relaxed text-neutral-300">
              For complete details, see our{" "}
              <Link href="/privacy" className="text-blue-400 underline hover:text-blue-300">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">User Responsibilities</h2>
            <p className="mb-4 leading-relaxed text-neutral-300">
              When using ScrollTunes, you agree to:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-neutral-300">
              <li>Use the service only for its intended purpose</li>
              <li>Not attempt to reverse engineer, hack, or disrupt the service</li>
              <li>Respect copyright laws when using lyrics content</li>
              <li>Not use the service for any unlawful or prohibited activities</li>
              <li>Not redistribute or commercialize lyrics obtained through the service</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Intellectual Property</h2>
            <p className="leading-relaxed text-neutral-300">
              Song lyrics displayed through ScrollTunes are sourced from third-party providers and
              remain the intellectual property of their respective owners, including songwriters,
              publishers, and rights holders. ScrollTunes does not claim ownership of any lyrics
              content. The ScrollTunes application, including its design, code, and features, is the
              property of its creators.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Third-Party Services</h2>
            <p className="mb-4 leading-relaxed text-neutral-300">
              ScrollTunes integrates with third-party services to provide lyrics and song
              information. Your use of these services is subject to their respective terms:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-neutral-300">
              <li>
                <a
                  href="https://lrclib.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  LRCLIB
                </a>{" "}
                — Synchronized lyrics database
              </li>
              <li>
                <a
                  href="https://getsongbpm.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  GetSongBPM
                </a>{" "}
                — Song tempo and metadata
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Disclaimer of Warranties</h2>
            <p className="leading-relaxed text-neutral-300">
              ScrollTunes is provided &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; without
              warranties of any kind, either express or implied. We do not guarantee that the
              service will be uninterrupted, error-free, or that lyrics will be accurate or
              complete. Voice detection performance may vary based on environmental conditions and
              device capabilities.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Limitation of Liability</h2>
            <p className="leading-relaxed text-neutral-300">
              To the fullest extent permitted by law, ScrollTunes and its creators shall not be
              liable for any indirect, incidental, special, consequential, or punitive damages
              arising from your use of the service. This includes, but is not limited to, damages
              for loss of profits, data, or other intangible losses.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Changes to Terms</h2>
            <p className="leading-relaxed text-neutral-300">
              We reserve the right to modify these Terms of Service at any time. Changes will be
              effective immediately upon posting. Your continued use of ScrollTunes after changes
              constitutes acceptance of the updated terms. We encourage you to review these terms
              periodically.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Contact</h2>
            <p className="leading-relaxed text-neutral-300">
              For questions about these Terms of Service, reach out to us on Twitter at{" "}
              <a
                href="https://twitter.com/ScrollTunes"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline hover:text-blue-300"
              >
                @ScrollTunes
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
