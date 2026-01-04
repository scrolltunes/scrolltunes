"use client"

import type { AttributionSource } from "@/lib/lyrics-api-types"
import { memo } from "react"

export type { AttributionSource }

export interface AttributionProps {
  readonly lyrics?: AttributionSource | null | undefined
  readonly bpm?: AttributionSource | null | undefined
  readonly className?: string | undefined
}

/**
 * Attribution footer for data sources
 *
 * Required by GetSongBPM API terms: must display visible backlink
 */
export const Attribution = memo(function Attribution({
  lyrics,
  bpm,
  className = "",
}: AttributionProps) {
  const sources = [lyrics, bpm].filter(Boolean) as AttributionSource[]

  if (sources.length === 0) return null

  return (
    <div
      className={`text-xs text-center ${className}`}
      style={{ color: "var(--color-text-muted)" }}
      aria-label="Data attribution"
    >
      <span>Powered by </span>
      {sources.map((source, index) => (
        <span key={source.name}>
          {index > 0 && " & "}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 transition-colors hover:brightness-125"
            style={{ color: "var(--color-text3)" }}
          >
            {source.name}
          </a>
        </span>
      ))}
    </div>
  )
})
