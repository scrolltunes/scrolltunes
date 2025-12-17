"use client"

import { ArrowRight, Flask } from "@phosphor-icons/react"
import Link from "next/link"

interface TestPageLink {
  readonly href: string
  readonly title: string
  readonly description: string
}

const testPages: TestPageLink[] = [
  {
    href: "/test/chords-states",
    title: "Chords Button States",
    description: "All possible states of the chords button in SongActionBar (idle, loading, ready, not-found, error)",
  },
  {
    href: "/test/report",
    title: "Report Issue Dialog",
    description: "Test error reporting scenarios: missing BPM and chords fetch errors",
  },
]

export default function TestLandingPage() {
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
          {testPages.map(page => (
            <Link
              key={page.href}
              href={page.href}
              className="group block bg-neutral-900 rounded-xl p-5 border border-neutral-800 hover:border-indigo-500/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">
                    {page.title}
                  </h2>
                  <p className="text-sm text-neutral-400 mt-1">{page.description}</p>
                </div>
                <ArrowRight
                  size={20}
                  className="text-neutral-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all"
                />
              </div>
              <code className="text-xs text-neutral-500 mt-3 block">{page.href}</code>
            </Link>
          ))}
        </div>

        <div className="text-center text-neutral-600 text-sm">
          These pages are for development purposes only
        </div>
      </div>
    </div>
  )
}
