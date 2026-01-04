"use client"

import { springs } from "@/animations"
import { AmbientBackground } from "@/components/ui"
import { ArrowLeft, Check } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { signIn } from "next-auth/react"
import Link from "next/link"

const benefits = [
  "Sync favorites and history across devices",
  "Create and manage setlists",
  "Search with your voice hands-free",
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

export default function LoginPage() {
  const handleGoogleSignIn = () => {
    signIn("google", { callbackUrl: "/" })
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <AmbientBackground variant="subtle" />
      <header
        className="fixed top-0 left-0 right-0 z-20 backdrop-blur-lg"
        style={{
          background: "var(--color-header-bg)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/"
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:brightness-110"
            style={{ background: "var(--color-surface2)" }}
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </Link>
        </div>
      </header>

      <main className="pt-20 pb-8 px-4 flex items-center justify-center min-h-screen relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="w-full max-w-sm"
        >
          <div
            className="p-6 rounded-xl space-y-6"
            style={{ background: "var(--color-surface1)" }}
          >
            <div className="text-center">
              <h1 className="text-2xl font-semibold">Sign in to ScrollTunes</h1>
            </div>

            <ul className="space-y-3">
              {benefits.map(benefit => (
                <li key={benefit} className="flex items-start gap-3">
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                    style={{ background: "var(--color-success-soft)" }}
                  >
                    <Check size={12} weight="bold" style={{ color: "var(--color-success)" }} />
                  </span>
                  <span className="text-sm" style={{ color: "var(--color-text2)" }}>
                    {benefit}
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 font-medium rounded-lg transition-colors cursor-pointer hover:brightness-95"
                style={{
                  fontFamily: "Roboto, system-ui, sans-serif",
                  background: "#ffffff",
                  color: "#1f1f1f",
                  border: "1px solid var(--color-border-strong)",
                }}
              >
                <GoogleLogo />
                Continue with Google
              </button>
            </div>

            <p className="text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
              By signing in, you agree to our{" "}
              <Link
                href="/terms"
                className="underline transition-colors hover:brightness-125"
                style={{ color: "var(--color-text3)" }}
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="underline transition-colors hover:brightness-125"
                style={{ color: "var(--color-text3)" }}
              >
                Privacy Policy
              </Link>
            </p>

            <div className="text-center">
              <Link
                href="/"
                className="text-sm transition-colors hover:brightness-125"
                style={{ color: "var(--color-text3)" }}
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
