"use client"

import { ArrowLeft, GoogleLogo } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useState } from "react"

export default function LoginPage() {
  const [agreed, setAgreed] = useState(false)

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
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <div className="p-6 bg-neutral-900 rounded-xl space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-semibold">Sign in to ScrollTunes</h1>
            </div>

            <div className="space-y-3 text-sm text-neutral-300">
              <p className="text-neutral-400">By creating an account, you agree to:</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-neutral-500">•</span>
                  <span>Storage of your song history, favorites, and settings on our servers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-neutral-500">•</span>
                  <span>Use of cookies for authentication</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-neutral-500">•</span>
                  <span>Analytics to help improve ScrollTunes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-neutral-500">•</span>
                  <span>Processing by third-party services</span>
                </li>
              </ul>
              <p className="text-neutral-400">
                See our{" "}
                <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline">
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link href="/terms" className="text-indigo-400 hover:text-indigo-300 underline">
                  Terms of Service
                </Link>{" "}
                for full details.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 focus:ring-offset-neutral-900"
              />
              <span className="text-sm text-neutral-300">
                I agree to the{" "}
                <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline">
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link href="/terms" className="text-indigo-400 hover:text-indigo-300 underline">
                  Terms of Service
                </Link>
              </span>
            </label>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={!agreed}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-neutral-900 font-medium rounded-lg hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              <GoogleLogo size={20} weight="bold" />
              Continue with Google
            </button>

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
