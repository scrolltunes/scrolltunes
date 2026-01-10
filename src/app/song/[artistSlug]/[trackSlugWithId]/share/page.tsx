"use client"

import { ShareDesignerPage } from "@/components/share/designer/ShareDesignerPage"
import { parseTrackSlugWithId } from "@/lib/slug"
import { SpinnerGap } from "@phosphor-icons/react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

interface SongData {
  readonly id: number
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly spotifyId: string | null
  readonly lines: readonly { readonly id: string; readonly text: string }[]
}

export default function SharePage() {
  const params = useParams<{ artistSlug: string; trackSlugWithId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [songData, setSongData] = useState<SongData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Parse initial selected lines from URL
  const initialLines = searchParams.get("lines")?.split(",").filter(Boolean) ?? []
  const initialStep = searchParams.get("step") as "select" | "customize" | null

  useEffect(() => {
    async function loadSongData() {
      try {
        const songId = parseTrackSlugWithId(params.trackSlugWithId)
        if (songId === null) {
          setError("Invalid song URL")
          setIsLoading(false)
          return
        }

        // Fetch song data from API
        const response = await fetch(`/api/lyrics/${songId}`)
        if (!response.ok) {
          setError("Could not load song data")
          setIsLoading(false)
          return
        }

        const data = await response.json()

        // Transform lyrics lines to the format we need
        const lines =
          data.lyrics?.lines?.map((line: { id?: string; text: string }, index: number) => ({
            id: line.id ?? `line-${index}`,
            text: line.text,
          })) ?? []

        setSongData({
          id: songId,
          title: data.lyrics?.title ?? "Unknown Title",
          artist: data.lyrics?.artist ?? "Unknown Artist",
          albumArt: data.albumArt ?? null,
          spotifyId: data.spotifyId ?? null,
          lines,
        })
      } catch (err) {
        console.error("Failed to load song data:", err)
        setError("Failed to load song data")
      } finally {
        setIsLoading(false)
      }
    }

    loadSongData()
  }, [params.trackSlugWithId])

  const handleBack = () => {
    router.push(`/song/${params.artistSlug}/${params.trackSlugWithId}`)
  }

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--color-bg)" }}
      >
        <SpinnerGap size={32} className="animate-spin" style={{ color: "var(--color-accent)" }} />
      </div>
    )
  }

  if (error || !songData) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4"
        style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <p style={{ color: "var(--color-text3)" }}>{error ?? "Something went wrong"}</p>
        <button
          type="button"
          onClick={handleBack}
          className="rounded-lg px-4 py-2 transition-colors hover:brightness-110"
          style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
        >
          Back to lyrics
        </button>
      </div>
    )
  }

  return (
    <ShareDesignerPage
      title={songData.title}
      artist={songData.artist}
      albumArt={songData.albumArt}
      spotifyId={songData.spotifyId}
      lines={songData.lines}
      initialSelectedIds={initialLines}
      initialStep={initialStep ?? (initialLines.length > 0 ? "customize" : "select")}
      onBack={handleBack}
    />
  )
}
