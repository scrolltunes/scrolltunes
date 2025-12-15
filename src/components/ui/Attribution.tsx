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
      className={`text-xs text-neutral-500 text-center ${className}`}
      aria-label="Data attribution"
    >
      <span>Data from </span>
      {sources.map((source, index) => (
        <span key={source.name}>
          {index > 0 && " & "}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-white underline underline-offset-2 transition-colors"
          >
            {source.name}
          </a>
        </span>
      ))}
    </div>
  )
})
