"use client"

import { springs } from "@/animations"
import { ArrowLeft, Check } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { signIn } from "next-auth/react"
import Link from "next/link"

const benefits = [
  "Sync favorites and history across devices",
  "Create and manage setlists",
  "Keep your preferences everywhere",
]

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9.003 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.26c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9.003 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.712A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z"
      />
    </svg>
  )
}

function SpotifyLogo() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
      />
    </svg>
  )
}

export default function LoginPage() {
  const handleGoogleSignIn = () => {
    signIn("google", { callbackUrl: "/" })
  }

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
        </div>
      </header>

      <main className="pt-20 pb-8 px-4 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="w-full max-w-sm"
        >
          <div className="p-6 bg-neutral-900 rounded-xl space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-semibold">Sign in to ScrollTunes</h1>
            </div>

            <ul className="space-y-3">
              {benefits.map(benefit => (
                <li key={benefit} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5">
                    <Check size={12} weight="bold" className="text-emerald-400" />
                  </span>
                  <span className="text-neutral-300 text-sm">{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-neutral-800 font-medium rounded-lg hover:bg-neutral-100 transition-colors"
                style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
              >
                <GoogleLogo />
                Continue with Google
              </button>

              <button
                type="button"
                disabled
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#1DB954] text-white font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Coming soon"
              >
                <SpotifyLogo />
                Continue with Spotify
              </button>
            </div>

            <p className="text-xs text-neutral-500 text-center">
              By signing in, you agree to our{" "}
              <Link href="/terms" className="text-neutral-400 hover:text-neutral-300 underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-neutral-400 hover:text-neutral-300 underline">
                Privacy Policy
              </Link>
            </p>

            <div className="text-center">
              <Link
                href="/"
                className="text-sm text-neutral-400 hover:text-neutral-300 transition-colors"
              >
                Continue without account
              </Link>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
