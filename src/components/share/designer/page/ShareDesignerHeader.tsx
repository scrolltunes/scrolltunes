"use client"

import {
  ArrowLeft,
  Check,
  CopySimple,
  DotsThree,
  DownloadSimple,
  ShareNetwork,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useState } from "react"

export interface ExportActions {
  readonly isGenerating: boolean
  readonly isSharing: boolean
  readonly isCopied: boolean
  readonly handleDownload: () => Promise<void>
  readonly handleCopy: () => Promise<void>
  readonly handleShare: () => Promise<void>
}

interface ShareDesignerHeaderProps {
  readonly step: "select" | "customize"
  readonly title: string
  readonly artist: string
  readonly onBack: () => void
  readonly exportActions?: ExportActions | undefined
}

export const ShareDesignerHeader = memo(function ShareDesignerHeader({
  step,
  title,
  artist,
  onBack,
  exportActions,
}: ShareDesignerHeaderProps) {
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  const showExportButtons = step === "customize" && exportActions

  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 h-14 backdrop-blur-lg"
      style={{
        background: "var(--color-header-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
        {/* Left: Back button + Title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:brightness-125"
            style={{ background: "var(--color-surface2)" }}
            aria-label="Go back to lyrics page"
          >
            <ArrowLeft size={20} style={{ color: "var(--color-text)" }} />
          </button>
          <div className="hidden sm:block">
            <h1 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
              Share Lyrics
            </h1>
            <p className="text-xs truncate max-w-[200px]" style={{ color: "var(--color-text3)" }}>
              {title} — {artist}
            </p>
          </div>
          <h1 className="text-base font-semibold sm:hidden" style={{ color: "var(--color-text)" }}>
            {step === "select" ? "Select Lyrics" : "Customize"}
          </h1>
        </div>

        {/* Right: Export actions (desktop) or overflow menu (mobile) */}
        {showExportButtons && (
          <>
            {/* Desktop export buttons */}
            <div className="hidden items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={exportActions.handleCopy}
                disabled={exportActions.isGenerating}
                className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors hover:brightness-110 disabled:opacity-50"
                style={{
                  background: exportActions.isCopied
                    ? "var(--color-success)"
                    : "var(--color-surface2)",
                  color: exportActions.isCopied ? "white" : "var(--color-text)",
                }}
              >
                {exportActions.isCopied ? (
                  <Check size={18} weight="bold" />
                ) : (
                  <CopySimple size={18} />
                )}
                {exportActions.isCopied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={exportActions.handleDownload}
                disabled={exportActions.isGenerating}
                className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors hover:brightness-110 disabled:opacity-50"
                style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
              >
                <DownloadSimple size={18} />
                Save
              </button>
              <button
                type="button"
                onClick={exportActions.handleShare}
                disabled={exportActions.isGenerating || exportActions.isSharing}
                className="flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors hover:brightness-110 disabled:opacity-50"
                style={{ background: "var(--color-accent)", color: "white" }}
              >
                <ShareNetwork size={18} weight="bold" />
                Share
              </button>
            </div>

            {/* Mobile overflow menu button */}
            <button
              type="button"
              onClick={() => setShowMobileMenu(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:brightness-125 lg:hidden"
              style={{ background: "var(--color-surface2)" }}
              aria-label="Export options"
            >
              <DotsThree size={24} weight="bold" style={{ color: "var(--color-text)" }} />
            </button>

            {/* Mobile overflow menu */}
            <AnimatePresence>
              {showMobileMenu && (
                <>
                  {/* Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-black/60"
                    onClick={() => setShowMobileMenu(false)}
                  />
                  {/* Menu */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-4 pb-8"
                    style={{ background: "var(--color-surface1)" }}
                  >
                    <div className="mb-4 flex justify-center">
                      <div
                        className="h-1 w-10 rounded-full"
                        style={{ background: "var(--color-surface3)" }}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          exportActions.handleCopy()
                          setShowMobileMenu(false)
                        }}
                        disabled={exportActions.isGenerating}
                        className="flex h-12 items-center gap-3 rounded-xl px-4 text-base font-medium transition-colors hover:brightness-110 disabled:opacity-50"
                        style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
                      >
                        <CopySimple size={22} />
                        Copy to clipboard
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          exportActions.handleDownload()
                          setShowMobileMenu(false)
                        }}
                        disabled={exportActions.isGenerating}
                        className="flex h-12 items-center gap-3 rounded-xl px-4 text-base font-medium transition-colors hover:brightness-110 disabled:opacity-50"
                        style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
                      >
                        <DownloadSimple size={22} />
                        Save to device
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          exportActions.handleShare()
                          setShowMobileMenu(false)
                        }}
                        disabled={exportActions.isGenerating || exportActions.isSharing}
                        className="flex h-12 items-center gap-3 rounded-xl px-4 text-base font-medium transition-colors hover:brightness-110 disabled:opacity-50"
                        style={{ background: "var(--color-accent)", color: "white" }}
                      >
                        <ShareNetwork size={22} weight="bold" />
                        Share
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </header>
  )
})
