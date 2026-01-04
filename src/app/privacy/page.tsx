"use client"

import { BackButton } from "@/components/ui"
import { motion } from "motion/react"

export default function PrivacyPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <header
        className="fixed top-0 left-0 right-0 z-20 backdrop-blur-lg"
        style={{
          background: "rgba(7, 10, 18, 0.8)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <BackButton fallbackHref="/" ariaLabel="Back" />
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
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Last updated: January 2026
          </p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Overview</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              ScrollTunes is built with privacy as a core principle.
            </p>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              <strong style={{ color: "var(--color-text)" }}>Anonymous users</strong> can use ScrollTunes without
              creating an account. We do not store any user data on our servers, do not use
              cookies, and do not track your activity. Everything stays in your browser.
            </p>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              <strong style={{ color: "var(--color-text)" }}>Account holders</strong> who choose to sign in consent
              to data collection as described in &quot;Accounts and Synced Data&quot; below,
              including server-side storage, analytics, and third-party processing.
            </p>
            <div className="p-4 rounded-xl space-y-2 text-sm" style={{ background: "var(--color-surface1)" }}>
              <p className="mb-2 font-medium" style={{ color: "var(--color-text3)" }}>For anonymous users:</p>
              <div className="flex items-center gap-2" style={{ color: "var(--color-success)" }}>
                <span>✓</span>
                <span>No account or registration required</span>
              </div>
              <div className="flex items-center gap-2" style={{ color: "var(--color-success)" }}>
                <span>✓</span>
                <span>No server-side user data retention</span>
              </div>
              <div className="flex items-center gap-2" style={{ color: "var(--color-success)" }}>
                <span>✓</span>
                <span>No tracking, analytics, or cookies</span>
              </div>
              <div className="flex items-center gap-2" style={{ color: "var(--color-success)" }}>
                <span>✓</span>
                <span>Voice detection runs locally — audio never leaves your device</span>
              </div>
              <div className="flex items-center gap-2" style={{ color: "var(--color-success)" }}>
                <span>✓</span>
                <span>All your data stays in your browser</span>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Accounts and Synced Data</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              ScrollTunes can be used without creating an account. When you use ScrollTunes
              anonymously, we do not store any of your data on our servers, do not use cookies, and
              do not track your activity. Your settings, history, and favorites stay entirely in your
              browser&apos;s local storage.
            </p>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>
                What Changes When You Create an Account
              </h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                If you choose to create an account, you consent to the following data collection and
                processing:
              </p>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Data We Store</h3>
              <ul className="list-disc list-inside space-y-2 ml-2" style={{ color: "var(--color-text2)" }}>
                <li>
                  <strong style={{ color: "var(--color-text)" }}>Account information:</strong> Your name, email
                  address, and profile image, as provided by your login provider (Google or Spotify)
                </li>
                <li>
                  <strong style={{ color: "var(--color-text)" }}>Song activity:</strong> A list of songs you have
                  played, including title, artist, and basic metadata. We store timestamps, play
                  counts, and setlist organization
                </li>
                <li>
                  <strong style={{ color: "var(--color-text)" }}>Favorites and settings:</strong> Which songs you
                  have marked as favorites and any per-song settings (tempo, transpose, capo
                  position, notes)
                </li>
                <li>
                  <strong style={{ color: "var(--color-text)" }}>Setlists:</strong> Custom song groupings you create
                  for performances
                </li>
                <li>
                  <strong style={{ color: "var(--color-text)" }}>Integration data:</strong> If you connect your
                  Spotify account, we store encrypted tokens to communicate with Spotify on your
                  behalf
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Analytics and Tracking</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                When you create an account, we collect anonymized usage analytics to improve
                ScrollTunes, including features you use and how often, performance metrics and error
                reports, and general usage patterns.
              </p>
              <p className="leading-relaxed mt-2" style={{ color: "var(--color-text2)" }}>
                We use third-party analytics services (such as Google Analytics) that may set
                cookies and collect data about your use of ScrollTunes. This tracking is{" "}
                <strong style={{ color: "var(--color-text)" }}>only enabled for account holders</strong> who have
                consented by creating an account.
              </p>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Voice Features</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                ScrollTunes offers two distinct voice features:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2 mt-2" style={{ color: "var(--color-text2)" }}>
                <li>
                  <strong style={{ color: "var(--color-text)" }}>Voice detection:</strong> Used to start and sync
                  lyrics scrolling. This runs entirely on your device — no audio is ever recorded or
                  sent anywhere
                </li>
                <li>
                  <strong style={{ color: "var(--color-text)" }}>Voice search:</strong> An optional, account-only
                  feature that lets you search for songs by speaking. This requires sending audio to
                  third-party speech recognition services (Google Cloud Speech-to-Text or OpenAI
                  Whisper) for transcription
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>AI and LLM Processing</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                We may use third-party AI services (such as Google Cloud AI or OpenAI) for features
                like voice search transcription, smart search suggestions, lyrics correction or
                enhancement, and personalized recommendations.
              </p>
              <p className="leading-relaxed mt-2" style={{ color: "var(--color-text2)" }}>
                When you use these features, relevant data (such as search queries, song metadata,
                or voice search audio) may be sent to these services for processing. We do not send
                your personal information to AI services.
              </p>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>What We Never Do</h3>
              <ul className="list-disc list-inside space-y-2 ml-2" style={{ color: "var(--color-text2)" }}>
                <li>
                  We do <strong style={{ color: "var(--color-text)" }}>not</strong> store voice recordings. Voice
                  detection audio never leaves your device; voice search audio is processed by
                  third-party providers and immediately discarded after transcription
                </li>
                <li>
                  We do <strong style={{ color: "var(--color-text)" }}>not</strong> sell your personal data to third
                  parties
                </li>
                <li>
                  We do <strong style={{ color: "var(--color-text)" }}>not</strong> use your data for advertising or
                  marketing purposes
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Legal Basis</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                When you create an account, our legal basis for processing your personal data is
                your <strong style={{ color: "var(--color-text)" }}>consent</strong> (GDPR Article 6(1)(a)). By
                creating an account, you explicitly agree to storage of your account and activity
                data on our servers, use of analytics cookies and tracking, and processing by
                third-party services as described above.
              </p>
              <p className="leading-relaxed mt-2" style={{ color: "var(--color-text2)" }}>
                You may withdraw consent at any time by deleting your account.
              </p>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Data Retention</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                We retain your account data for as long as your account is active. When you delete
                your account, we delete your personal data from our active systems without undue
                delay, typically within 30 days.
              </p>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Your Rights</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                If you are in the EU, UK, or similar jurisdiction, you have the right to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2 mt-2" style={{ color: "var(--color-text2)" }}>
                <li>Access the personal data we hold about you</li>
                <li>Request a copy of your data in a portable format (JSON export)</li>
                <li>Request correction or deletion of your data</li>
                <li>Withdraw your consent for future processing</li>
                <li>Object to processing based on legitimate interests</li>
              </ul>
              <p className="leading-relaxed mt-2" style={{ color: "var(--color-text2)" }}>
                You can export your data and delete your account from the app&apos;s settings, or by
                contacting us at{" "}
                <a
                  href="mailto:contact@scrolltunes.com"
                  className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
                >
                  contact@scrolltunes.com
                </a>
                .
              </p>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Data Processors</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                We use third-party services to host and operate ScrollTunes:
              </p>
              <p className="mt-3 mb-2 text-sm font-medium" style={{ color: "var(--color-text3)" }}>
                For all users (anonymous and account holders):
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2" style={{ color: "var(--color-text2)" }}>
                <li>
                  <a
                    href="https://vercel.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
                  >
                    Vercel
                  </a>{" "}
                  (hosting)
                </li>
                <li>
                  <a
                    href="https://lrclib.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
                  >
                    LRCLIB
                  </a>{" "}
                  (lyrics)
                </li>
                <li>
                  <a
                    href="https://getsongbpm.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
                  >
                    GetSongBPM
                  </a>{" "}
                  (tempo data)
                </li>
                <li>
                  <a
                    href="https://www.songsterr.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
                  >
                    Songsterr
                  </a>{" "}
                  (guitar chords)
                </li>
              </ul>
              <p className="mt-3 mb-2 text-sm font-medium" style={{ color: "var(--color-text3)" }}>
                For account holders only:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2" style={{ color: "var(--color-text2)" }}>
                <li>Vercel Postgres (database)</li>
                <li>Upstash Redis (rate limiting)</li>
                <li>Google and Spotify (authentication)</li>
                <li>Google Analytics (usage analytics)</li>
                <li>
                  Google Cloud Speech-to-Text and/or OpenAI Whisper (voice search transcription)
                </li>
              </ul>
              <p className="leading-relaxed mt-3" style={{ color: "var(--color-text2)" }}>
                These providers act as data processors on our behalf. We only share the minimum
                information necessary to operate ScrollTunes.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Cookies</h2>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Anonymous Users</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                If you use ScrollTunes without an account, we do not set any cookies. Your data is
                stored only in your browser&apos;s localStorage.
              </p>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Account Holders</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                If you sign in to ScrollTunes, we use the following cookies:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2 mt-2" style={{ color: "var(--color-text2)" }}>
                <li>
                  <strong style={{ color: "var(--color-text)" }}>Authentication cookie:</strong> A secure, HTTP-only
                  session cookie that keeps you logged in. This cookie is essential for the service
                  to function and does not track you across other sites
                </li>
                <li>
                  <strong style={{ color: "var(--color-text)" }}>Analytics cookies:</strong> We use Google Analytics
                  to understand how account holders use ScrollTunes. These cookies collect
                  anonymized usage data. You can opt out of Google Analytics by installing the{" "}
                  <a
                    href="https://tools.google.com/dlpage/gaoptout"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
                  >
                    Google Analytics Opt-out Browser Add-on
                  </a>
                </li>
              </ul>
              <p className="leading-relaxed mt-2" style={{ color: "var(--color-text2)" }}>
                We do not use cookies for advertising or cross-site tracking.
              </p>
            </div>

            <div>
              <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Managing Cookies</h3>
              <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
                You can disable cookies in your browser settings. If you disable cookies:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2" style={{ color: "var(--color-text2)" }}>
                <li>You will not be able to sign in to ScrollTunes</li>
                <li>You can still use ScrollTunes anonymously with full functionality</li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Information We Collect</h2>
            <div className="space-y-4 leading-relaxed" style={{ color: "var(--color-text2)" }}>
              <div>
                <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Local Storage</h3>
                <p>
                  We store your preferences, recent songs, and cached lyrics locally in your
                  browser. This data never leaves your device.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2" style={{ color: "var(--color-text)" }}>Microphone Access</h3>
                <p>ScrollTunes requests microphone access for two features:</p>
                <ul className="list-disc list-inside space-y-2 ml-2 mt-2">
                  <li>
                    <strong style={{ color: "var(--color-text)" }}>Voice detection:</strong> Enables hands-free
                    scrolling by detecting when you sing. Audio is processed entirely on your device
                    and is never recorded, stored, or transmitted
                  </li>
                  <li>
                    <strong style={{ color: "var(--color-text)" }}>Voice search (account-only):</strong> Lets you
                    search for songs by speaking. Audio is sent to third-party speech recognition
                    services (Google Cloud or OpenAI Whisper) for transcription
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Technical Logs</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              Our hosting provider,{" "}
              <a
                href="https://vercel.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
              >
                Vercel
              </a>
              , may automatically collect technical information such as IP addresses, browser type,
              and request timestamps as part of standard web server operations. ScrollTunes does not
              use these logs to identify individual users.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>How We Use Information</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              The data stored locally is used solely to improve your experience: remembering your
              preferences, displaying recently played songs, and caching lyrics for faster loading.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Third-Party Services</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              ScrollTunes uses third-party services as described in the &quot;Data Processors&quot;
              section above.
            </p>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              When you search for songs, the artist name, track title, and your IP address are sent
              to LRCLIB and GetSongBPM. These services may log this information according to their
              own privacy policies. Third-party services may use cookies or other tracking
              technologies for their own purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Data Storage</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              For anonymous users, all data is stored in your browser&apos;s localStorage. Cached
              lyrics have a 7-day TTL (time-to-live) and are automatically refreshed. No data is
              sent to or stored on ScrollTunes servers.
            </p>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              For account holders, your data is stored securely on Vercel Postgres. See
              &quot;Accounts and Synced Data&quot; above for details.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Your Rights</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              You can clear all locally stored data at any time by clearing your browser&apos;s
              localStorage or using your browser&apos;s &quot;Clear site data&quot; feature. You can
              also revoke microphone permissions through your browser settings.
            </p>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              Depending on your location, you may have additional rights under laws like GDPR or
              CCPA. For account holders, see the &quot;Your Rights&quot; section under
              &quot;Accounts and Synced Data&quot; above. For privacy-related requests, contact us
              at{" "}
              <a
                href="mailto:contact@scrolltunes.com"
                className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
              >
                contact@scrolltunes.com
              </a>{" "}
              or{" "}
              <a
                href="https://x.com/ScrollTunes"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
              >
                @ScrollTunes
              </a>{" "}
              on X.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Children&apos;s Privacy</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              ScrollTunes is intended for users who are 13 years of age or older. If you are under
              13, please do not use this service. If we learn that a child under 13 has used
              ScrollTunes, we will take appropriate steps to remove any associated data from
              third-party services where possible. If you believe a child has used our service,
              please contact us at{" "}
              <a
                href="mailto:contact@scrolltunes.com"
                className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
              >
                contact@scrolltunes.com
              </a>
              .
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Changes to This Policy</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              We may update this privacy policy from time to time. Any changes will be reflected on
              this page with an updated revision date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>Contact</h2>
            <p className="leading-relaxed" style={{ color: "var(--color-text2)" }}>
              If you have questions about this privacy policy, you can reach us at{" "}
              <a
                href="mailto:contact@scrolltunes.com"
                className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
              >
                contact@scrolltunes.com
              </a>{" "}
              or{" "}
              <a
                href="https://x.com/ScrollTunes"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:brightness-110" style={{ color: "var(--color-accent)" }}
              >
                @ScrollTunes
              </a>{" "}
              on X.
            </p>
          </section>
        </motion.div>
      </main>
    </div>
  )
}
