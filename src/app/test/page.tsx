"use client"

import { useAccount } from "@/core"
import { ArrowRight, Flask, Lock, Microphone } from "@phosphor-icons/react"
import Link from "next/link"

interface TestPageLink {
  readonly href: string
  readonly title: string
  readonly description: string
  readonly requiresAuth?: boolean
  readonly icon?: React.ReactNode
}

const testPages: TestPageLink[] = [
  {
    href: "/test/chords-states",
    title: "Chords Button States",
    description:
      "All possible states of the chords button in SongActionBar (idle, loading, ready, not-found, error)",
  },
  {
    href: "/test/report",
    title: "Report Issue Dialog",
    description: "Test error reporting scenarios: missing BPM and chords fetch errors",
  },
  {
    href: "/test/metadata-preview",
    title: "Song Metadata Preview",
    description: "Preview Open Graph and Twitter Card unfurls for shared song links with album art",
  },
  {
    href: "/test/voice-search",
    title: "Voice Search",
    description:
      "Test tiered voice search: Google Cloud STT (primary) and Web Speech API (fallback)",
    requiresAuth: true,
    icon: <Microphone size={16} weight="bold" />,
  },
]

function TestPageCard({ page, isAuthenticated }: { page: TestPageLink; isAuthenticated: boolean }) {
  const needsAuth = page.requiresAuth && !isAuthenticated

  if (needsAuth) {
    return (
      <div className="group block bg-neutral-900 rounded-xl p-5 border border-neutral-800 opacity-75">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-neutral-400">{page.title}</h2>
              {page.icon}
              <span className="flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                <Lock size={12} weight="bold" />
                Sign in required
              </span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">{page.description}</p>
          </div>
        </div>
        <code className="text-xs text-neutral-600 mt-3 block">{page.href}</code>
      </div>
    )
  }

  return (
    <Link
      href={page.href}
      className="group block bg-neutral-900 rounded-xl p-5 border border-neutral-800 hover:border-indigo-500/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">
              {page.title}
            </h2>
            {page.icon && (
              <span className="text-indigo-400 group-hover:text-indigo-300">{page.icon}</span>
            )}
          </div>
          <p className="text-sm text-neutral-400 mt-1">{page.description}</p>
        </div>
        <ArrowRight
          size={20}
          className="text-neutral-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all"
        />
      </div>
      <code className="text-xs text-neutral-500 mt-3 block">{page.href}</code>
    </Link>
  )
}

export default function TestLandingPage() {
  const { isAuthenticated, isLoading } = useAccount()

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Flask size={32} className="text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Test Pages</h1>
            <p className="text-neutral-400">Development and QA test pages for ScrollTunes</p>
          </div>
        </div>

        <div className="grid gap-4">
          {testPages.map((page) => (
            <TestPageCard
              key={page.href}
              page={page}
              isAuthenticated={isLoading ? false : isAuthenticated}
            />
          ))}
        </div>

        <div className="text-center text-neutral-600 text-sm">
          These pages are for development purposes only
        </div>
      </div>
    </div>
  )
}
