"use client"

import { Check, CopySimple, DownloadSimple, ShareNetwork } from "@phosphor-icons/react"
import { memo } from "react"

interface ExportActionBarProps {
  readonly onCopy: () => void
  readonly onSave: () => void
  readonly onShare: () => void
  readonly isGenerating: boolean
  readonly isCopied: boolean
}

export const ExportActionBar = memo(function ExportActionBar({
  onCopy,
  onSave,
  onShare,
  isGenerating,
  isCopied,
}: ExportActionBarProps) {
  return (
    <div
      className="flex shrink-0 gap-2 p-3 pb-safe"
      style={{
        background: "var(--color-surface1)",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <button
        type="button"
        onClick={onCopy}
        disabled={isGenerating}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors hover:brightness-110 disabled:opacity-50"
        style={{
          background: isCopied ? "var(--color-success)" : "var(--color-surface2)",
          color: isCopied ? "white" : "var(--color-text)",
        }}
      >
        {isCopied ? <Check size={20} weight="bold" /> : <CopySimple size={20} />}
        {isCopied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={isGenerating}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors hover:brightness-110 disabled:opacity-50"
        style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
      >
        <DownloadSimple size={20} />
        Save
      </button>
      <button
        type="button"
        onClick={onShare}
        disabled={isGenerating}
        className="flex flex-[2] items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors hover:brightness-110 disabled:opacity-50"
        style={{ background: "var(--color-accent)", color: "white" }}
      >
        <ShareNetwork size={20} weight="bold" />
        Share
      </button>
    </div>
  )
})
