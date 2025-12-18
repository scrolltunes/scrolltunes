"use client"

import Link from "next/link"

import { BackButton } from "@/components/ui"

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <BackButton fallbackHref="/" ariaLabel="Back to ScrollTunes" />
        </div>

        <h1 className="mb-2 text-4xl font-bold">Terms of Service</h1>
        <p className="mb-12 text-neutral-400">Last updated: December 2025</p>

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
              ScrollTunes operates with a two-tier privacy model:
            </p>
            <h3 className="mb-2 text-lg font-medium text-neutral-200">Anonymous Use</h3>
            <p className="mb-4 leading-relaxed text-neutral-300">
              You can use ScrollTunes without creating an account. When used anonymously:
            </p>
            <ul className="mb-6 list-disc space-y-2 pl-6 text-neutral-300">
              <li>
                <strong>No server-side data storage</strong> — We do not store any user data on our
                servers
              </li>
              <li>
                <strong>Local storage only</strong> — Preferences and cached lyrics are stored in
                your browser
              </li>
              <li>
                <strong>No tracking</strong> — We do not use analytics, tracking cookies, or collect
                personal information
              </li>
              <li>
                <strong>Microphone privacy</strong> — Voice detection runs locally; audio is never
                recorded, transmitted, or stored
              </li>
            </ul>
            <h3 className="mb-2 text-lg font-medium text-neutral-200">Account Holders</h3>
            <p className="mb-4 leading-relaxed text-neutral-300">
              If you choose to create an account, you consent to the collection and processing of
              your data as described in our{" "}
              <Link href="/privacy" className="text-blue-400 underline hover:text-blue-300">
                Privacy Policy
              </Link>
              , including server-side storage, analytics, and third-party processing.
            </p>
            <p className="leading-relaxed text-neutral-300">
              For complete details, see our{" "}
              <Link href="/privacy" className="text-blue-400 underline hover:text-blue-300">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Accounts</h2>
            <p className="mb-4 leading-relaxed text-neutral-300">
              You are not required to create an account to use ScrollTunes. The core functionality
              is available to all users without registration.
            </p>
            <h3 className="mb-2 text-lg font-medium text-neutral-200">Creating an Account</h3>
            <p className="mb-4 leading-relaxed text-neutral-300">
              By creating an account, you agree to:
            </p>
            <ul className="mb-6 list-disc space-y-2 pl-6 text-neutral-300">
              <li>The collection and processing of your data as described in our Privacy Policy</li>
              <li>The use of cookies for authentication and analytics</li>
              <li>Processing of your data by third-party services (analytics, AI features)</li>
            </ul>
            <p className="mb-6 leading-relaxed text-neutral-300">
              You are responsible for maintaining the confidentiality of your login credentials and
              for any activity that occurs under your account.
            </p>
            <h3 className="mb-2 text-lg font-medium text-neutral-200">Account Termination</h3>
            <p className="mb-4 leading-relaxed text-neutral-300">
              We may suspend or terminate your account if you:
            </p>
            <ul className="mb-6 list-disc space-y-2 pl-6 text-neutral-300">
              <li>Violate these Terms of Service</li>
              <li>Engage in abuse, fraud, or activities that harm other users</li>
              <li>Create security risks for ScrollTunes or its users</li>
            </ul>
            <p className="mb-4 leading-relaxed text-neutral-300">
              You may delete your account at any time from the app&apos;s settings. Deleting your
              account will remove your personal data from our systems, as described in our{" "}
              <Link href="/privacy" className="text-blue-400 underline hover:text-blue-300">
                Privacy Policy
              </Link>
              .
            </p>
            <h3 className="mb-2 text-lg font-medium text-neutral-200">Data and Privacy</h3>
            <p className="leading-relaxed text-neutral-300">
              Account creation requires explicit consent to our data collection practices. Anonymous
              use of ScrollTunes does not require any such consent and involves no server-side data
              storage or tracking.
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
            <p className="mb-4 leading-relaxed text-neutral-300">
              Song lyrics displayed through ScrollTunes are sourced from third-party providers and
              remain the intellectual property of their respective owners, including songwriters,
              publishers, and rights holders. ScrollTunes does not claim ownership of any lyrics
              content. The ScrollTunes application, including its design, code, and features, is the
              property of its creators.
            </p>
            <p className="mb-4 leading-relaxed text-neutral-300">
              ScrollTunes does not guarantee the right to display lyrics in all jurisdictions. You
              are responsible for ensuring your use of lyrics complies with applicable copyright and
              licensing laws in your location.
            </p>
            <p className="leading-relaxed text-neutral-300">
              <strong>Public performance:</strong> If you use ScrollTunes for live performances,
              public events, or commercial purposes, you may be required to obtain appropriate
              public performance licenses from the relevant rights holders or licensing
              organizations (such as ASCAP, BMI, SESAC, or equivalent in your country).
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Copyright Complaints</h2>
            <p className="mb-4 leading-relaxed text-neutral-300">
              ScrollTunes respects the intellectual property rights of others. If you are a
              copyright owner or authorized agent and believe that content accessible through
              ScrollTunes infringes your copyright, please contact us on X at{" "}
              <a
                href="https://x.com/ScrollTunes"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline hover:text-blue-300"
              >
                @ScrollTunes
              </a>
              .
            </p>
            <p className="leading-relaxed text-neutral-300">
              Please include a description of the copyrighted work, identification of the allegedly
              infringing content, and your contact information. We will review all valid complaints
              and, where feasible, remove or block access to infringing content.
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
            <p className="mt-4 leading-relaxed text-neutral-300">
              ScrollTunes is not affiliated with, endorsed by, or partnered with LRCLIB, GetSongBPM,
              or any other third-party service. We are not responsible for the availability,
              accuracy, or data practices of these external services. Your use of third-party
              services accessed through ScrollTunes is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Disclaimer of Warranties</h2>
            <p className="mb-4 leading-relaxed text-neutral-300">
              ScrollTunes is provided &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; without
              warranties of any kind, either express or implied. We do not guarantee that the
              service will be uninterrupted, error-free, or that lyrics will be accurate or
              complete. Voice detection performance may vary based on environmental conditions and
              device capabilities.
            </p>
            <p className="leading-relaxed text-neutral-300">
              <strong>User responsibility:</strong> You are responsible for maintaining backup
              copies of any lyrics you rely on for performances. We recommend verifying that lyrics
              content is accurate and suitable for your intended use before any performance or
              event.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Limitation of Liability</h2>
            <p className="mb-4 leading-relaxed text-neutral-300">
              To the fullest extent permitted by law, ScrollTunes and its creators shall not be
              liable for any indirect, incidental, special, consequential, or punitive damages
              arising from your use of the service. This includes, but is not limited to, damages
              for loss of profits, data, or other intangible losses.
            </p>
            <p className="mb-4 leading-relaxed text-neutral-300">
              In no event shall our total liability for any direct damages exceed the greater of (a)
              the amount you paid to use ScrollTunes in the twelve months preceding the claim, or
              (b) fifty US dollars ($50 USD).
            </p>
            <p className="leading-relaxed text-neutral-300">
              Some jurisdictions do not allow the exclusion or limitation of certain damages. If
              these laws apply to you, some or all of the above disclaimers, exclusions, or
              limitations may not apply, and you may have additional rights.
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
              For questions about these Terms of Service, reach out to us on X at{" "}
              <a
                href="https://x.com/ScrollTunes"
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
