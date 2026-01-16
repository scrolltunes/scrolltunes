"use client"

import { ReportIssueModal } from "@/components/feedback"
import { loadPublicConfig } from "@/services/public-config"
import { Bug, Info, XLogo } from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"
import { useFooterSlot } from "./FooterContext"

const publicConfig = loadPublicConfig()

export function Footer() {
  const [showReportModal, setShowReportModal] = useState(false)
  const sha = publicConfig.gitSha
  const shortSha = sha.slice(0, 7)
  const env = publicConfig.vercelEnv
  const { slot } = useFooterSlot()

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 h-7 text-xs flex items-center justify-between px-3 z-40 backdrop-blur-lg rounded-sm"
      style={{
        background: "rgba(26, 27, 38, 0.85)",
        borderTop: "1px solid var(--border-default)",
        color: "var(--fg-muted)",
      }}
    >
      {/* Left: Version + Terms/Privacy + Report an issue */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono hidden sm:flex items-center gap-1.5">
          <span style={{ color: "var(--fg-muted)" }}>v</span>
          {shortSha}
          {env && env !== "production" && (
            <span className="ml-1" style={{ color: "var(--status-warning)" }}>
              {env}
            </span>
          )}
        </span>

        <span className="hidden sm:inline" style={{ color: "var(--border-default)" }}>
          ·
        </span>

        <Link href="/terms" className="hidden sm:inline transition-colors hover:brightness-125">
          Terms
        </Link>
        <Link href="/privacy" className="hidden sm:inline transition-colors hover:brightness-125">
          Privacy
        </Link>

        <span className="hidden sm:inline" style={{ color: "var(--border-default)" }}>
          ·
        </span>

        <button
          type="button"
          onClick={() => setShowReportModal(true)}
          className="flex items-center gap-1 transition-colors hover:brightness-125"
          title="Report an issue"
        >
          <Bug size={14} weight="bold" />
          <span className="hidden sm:inline">Report an issue</span>
        </button>
      </div>

      {/* Center: Optional slot for page-specific content */}
      <div className="flex-1 min-w-0 text-center truncate">{slot}</div>

      {/* Right: About + X link */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/about"
          className="flex items-center gap-1 transition-colors hover:brightness-125"
          title="About"
        >
          <Info size={14} weight="bold" className="sm:hidden" />
          <span className="hidden sm:inline">About</span>
        </Link>
        <a
          href="https://x.com/scrolltunes"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 transition-colors hover:brightness-125"
          title="Follow on X"
        >
          <XLogo size={14} weight="bold" />
          <span className="hidden sm:inline">@scrolltunes</span>
        </a>
      </div>

      <ReportIssueModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} />
    </footer>
  )
}
