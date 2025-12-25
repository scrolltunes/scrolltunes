"use client"

/**
 * Hook to fetch and apply word-level enhancements to lyrics.
 *
 * Fetches enhancement data from the API based on LRCLIB ID and LRC hash,
 * then applies it to the lyrics for word-level timing.
 */

import type { Lyrics } from "@/core"
import type { EnhancementPayload } from "@/lib/db/schema"
import { applyEnhancement } from "@/lib/enhancement"
import { computeLrcHashSync } from "@/lib/lrc-hash"
import { useEffect, useState } from "react"

interface EnhancementState {
  readonly isLoading: boolean
  readonly hasEnhancement: boolean
  readonly coverage: number | null
  readonly error: string | null
}

interface EnhancementResponse {
  found: boolean
  lrclibId?: number
  lrcHash?: string
  payload?: EnhancementPayload
  coverage?: number
}

/**
 * Fetch enhancement for a song and apply it to lyrics.
 *
 * @param lyrics - Parsed lyrics to enhance
 * @param lrclibId - LRCLIB ID of the song
 * @param rawLrc - Raw LRC content (for hash computation)
 * @returns Enhanced lyrics and state
 */
export function useEnhancement(
  lyrics: Lyrics | null,
  lrclibId: number | null,
  rawLrc: string | null,
): {
  enhancedLyrics: Lyrics | null
  state: EnhancementState
} {
  const [enhancement, setEnhancement] = useState<EnhancementPayload | null>(null)
  const [state, setState] = useState<EnhancementState>({
    isLoading: false,
    hasEnhancement: false,
    coverage: null,
    error: null,
  })

  // Fetch enhancement when lrclibId changes
  useEffect(() => {
    if (!lrclibId || !rawLrc) {
      setEnhancement(null)
      setState({ isLoading: false, hasEnhancement: false, coverage: null, error: null })
      return
    }

    let cancelled = false

    async function fetchEnhancement() {
      setState(s => ({ ...s, isLoading: true, error: null }))

      try {
        const lrcHash = computeLrcHashSync(rawLrc as string)
        const response = await fetch(`/api/lrc/enhancement?lrclibId=${lrclibId}&lrcHash=${lrcHash}`)

        if (cancelled) return

        if (!response.ok) {
          setState({ isLoading: false, hasEnhancement: false, coverage: null, error: null })
          setEnhancement(null)
          return
        }

        const data = (await response.json()) as EnhancementResponse

        if (cancelled) return

        if (data.found && data.payload) {
          setEnhancement(data.payload)
          setState({
            isLoading: false,
            hasEnhancement: true,
            coverage: data.coverage ?? null,
            error: null,
          })
        } else {
          setEnhancement(null)
          setState({ isLoading: false, hasEnhancement: false, coverage: null, error: null })
        }
      } catch (err) {
        if (cancelled) return
        console.error("Failed to fetch enhancement:", err)
        setState({
          isLoading: false,
          hasEnhancement: false,
          coverage: null,
          error: "Failed to fetch enhancement",
        })
        setEnhancement(null)
      }
    }

    fetchEnhancement()

    return () => {
      cancelled = true
    }
  }, [lrclibId, rawLrc])

  // Apply enhancement to lyrics
  const enhancedLyrics = lyrics && enhancement ? applyEnhancement(lyrics, enhancement) : lyrics

  return { enhancedLyrics, state }
}

/**
 * Simple check if lyrics have word-level enhancements applied.
 */
export function hasWordEnhancements(lyrics: Lyrics | null): boolean {
  if (!lyrics) return false
  return lyrics.lines.some(line => line.words && line.words.length > 0)
}
