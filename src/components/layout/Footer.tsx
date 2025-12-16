"use client"

import { EnvelopeSimple, Info, XLogo } from "@phosphor-icons/react"
import Link from "next/link"
import { useFooterSlot } from "./FooterContext"

export function Footer() {
  const sha = process.env.NEXT_PUBLIC_GIT_SHA ?? "dev"
  const shortSha = sha.slice(0, 7)
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV
  const { slot } = useFooterSlot()

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 h-7 bg-neutral-900 border-t border-neutral-800
                 text-xs text-neutral-500 flex items-center justify-between px-3 z-40"
    >
      {/* Left: Version + Terms/Privacy + Report bug */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono hidden sm:flex items-center gap-1.5">
          <span className="text-neutral-600">v</span>
          {shortSha}
          {env && env !== "production" && <span className="text-amber-500/80 ml-1">{env}</span>}
        </span>

        <span className="text-neutral-700 hidden sm:inline">·</span>

        <Link href="/terms" className="hidden sm:inline hover:text-neutral-300 transition-colors">
          Terms
        </Link>
        <Link href="/privacy" className="hidden sm:inline hover:text-neutral-300 transition-colors">
          Privacy
        </Link>

        <span className="text-neutral-700 hidden sm:inline">·</span>

        <a
          href="mailto:bugs@scrolltunes.com"
          className="flex items-center gap-1 hover:text-neutral-300 transition-colors"
          title="Report a bug"
        >
          <EnvelopeSimple size={14} weight="bold" />
          <span className="hidden sm:inline">Report bug</span>
        </a>
      </div>

      {/* Center: Optional slot for page-specific content */}
      <div className="flex-1 min-w-0 text-center truncate">{slot}</div>

      {/* Right: About + X link */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/about"
          className="flex items-center gap-1 hover:text-neutral-300 transition-colors"
          title="About"
        >
          <Info size={14} weight="bold" className="sm:hidden" />
          <span className="hidden sm:inline">About</span>
        </Link>
        <a
          href="https://x.com/scrolltunes"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-neutral-300 transition-colors"
          title="Follow on X"
        >
          <XLogo size={14} weight="bold" />
          <span className="hidden sm:inline">@scrolltunes</span>
        </a>
      </div>
    </footer>
  )
}
