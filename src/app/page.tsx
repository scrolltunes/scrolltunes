"use client"

import { UserMenu } from "@/components/auth"
import { LogoMenu } from "@/components/layout"
import { RecentSongs, SongSearch } from "@/components/search"
import { Attribution } from "@/components/ui"
import { GearSix } from "@phosphor-icons/react"
import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-7">
      <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <LogoMenu />

          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
              aria-label="Settings"
            >
              <GearSix size={20} />
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="pt-16 flex flex-col">
        <div className="flex-1 flex flex-col items-center p-6 pt-24">
          <h2 className="text-2xl font-medium mb-8">Find a song</h2>
          <SongSearch className="w-full max-w-md" />
          <Attribution
            lyrics={{ name: "LRCLIB", url: "https://lrclib.net" }}
            bpm={{ name: "GetSongBPM", url: "https://getsongbpm.com" }}
            className="mt-3"
          />
          <RecentSongs className="w-full max-w-md mt-8" />
        </div>
      </main>
    </div>
  )
}
