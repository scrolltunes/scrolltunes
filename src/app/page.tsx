"use client"

import { SongSearch } from "@/components/search"
import { GearSix, MusicNote } from "@phosphor-icons/react"
import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold flex items-center gap-2">
              <MusicNote size={24} weight="fill" className="text-indigo-500" />
              ScrollTunes
            </span>
          </div>

          <Link
            href="/settings"
            className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
            aria-label="Settings"
          >
            <GearSix size={20} />
          </Link>
        </div>
      </header>

      <main className="pt-16 h-screen flex flex-col">
        <div className="flex-1 flex flex-col items-center p-6 pt-24">
          <div className="w-full max-w-md text-center mb-8">
            <h2 className="text-2xl font-medium mb-2">Find a song</h2>
            <p className="text-neutral-500">Search for any song to get synced lyrics</p>
          </div>
          <SongSearch className="w-full max-w-md" />
        </div>

        {/* Static footer - required for GetSongBPM API key verification */}
        <footer className="fixed bottom-2 left-0 right-0 text-center text-xs text-neutral-600">
          Powered by{" "}
          <a
            href="https://lrclib.net"
            target="_blank"
            rel="noreferrer noopener"
            className="text-neutral-500 hover:text-neutral-400 underline underline-offset-2"
          >
            LRCLIB
          </a>
          {" & "}
          <a
            href="https://getsongbpm.com"
            target="_blank"
            rel="noreferrer noopener"
            className="text-neutral-500 hover:text-neutral-400 underline underline-offset-2"
          >
            GetSongBPM
          </a>
        </footer>
      </main>
    </div>
  )
}
