"use client"

import type { LyricsApiResponse } from "@/lib/lyrics-api-types"
import { isLyricsApiSuccess } from "@/lib/lyrics-api-types"
import { ArrowLeft, Spinner } from "@phosphor-icons/react"
import Link from "next/link"
import { useEffect, useState } from "react"

interface MetadataPreview {
  title: string
  artist: string
  albumArt: string | null
  url: string
}

const DEMO_SONGS = [
  { id: 1, name: "Bohemian Rhapsody" },
  { id: 5, name: "Blinding Lights" },
  { id: 10, name: "Shape of You" },
]

export default function MetadataPreviewPage() {
  const [preview, setPreview] = useState<MetadataPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number>(1)

  useEffect(() => {
    async function fetchMetadata() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/lyrics/${selectedId}`)
        if (!response.ok) {
          setError("Failed to fetch song data")
          return
        }

        const data: LyricsApiResponse = await response.json()
        if (!isLyricsApiSuccess(data)) {
          setError("Invalid song data")
          return
        }

        const { title, artist } = data.lyrics
        const albumArt = data.albumArt

        setPreview({
          title,
          artist,
          albumArt,
          url: `https://scrolltunes.com/song/demo/${title.toLowerCase().replace(/\s+/g, "-")}-${selectedId}`,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    fetchMetadata()
  }, [selectedId])

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/test"
            className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Song Metadata Preview</h1>
            <p className="text-neutral-400">Test Open Graph unfurls for shared links</p>
          </div>
        </div>

        {/* Song selector */}
        <div className="space-y-3">
          <p className="block text-sm font-medium text-neutral-300">Select a song:</p>
          <div className="flex gap-2 flex-wrap">
            {DEMO_SONGS.map(song => (
              <button
                key={song.id}
                type="button"
                onClick={() => setSelectedId(song.id)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedId === song.id
                    ? "bg-indigo-600 text-white"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                {song.name}
              </button>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Spinner size={32} className="text-indigo-500 animate-spin" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-300">
            {error}
          </div>
        )}

        {/* Preview */}
        {preview && !loading && (
          <div className="space-y-6">
            {/* Metadata info */}
            <div className="bg-neutral-900 rounded-lg p-4 space-y-2 text-sm">
              <div>
                <span className="text-neutral-400">Title:</span>
                <span className="ml-2 text-white">{preview.title}</span>
              </div>
              <div>
                <span className="text-neutral-400">Artist:</span>
                <span className="ml-2 text-white">{preview.artist}</span>
              </div>
              <div>
                <span className="text-neutral-400">Album Art:</span>
                <span className="ml-2 text-white">{preview.albumArt ? "✓ Available" : "✗ None"}</span>
              </div>
              <div>
                <span className="text-neutral-400">URL:</span>
                <span className="ml-2 text-white break-all text-xs">{preview.url}</span>
              </div>
            </div>

            {/* OpenGraph Preview Card */}
            <div className="border-2 border-indigo-500/50 rounded-lg bg-neutral-900 p-4">
              <div className="flex gap-3">
                {preview.albumArt && (
                  <div className="w-20 h-20 flex-shrink-0 bg-neutral-800 rounded overflow-hidden">
                    <img
                      src={preview.albumArt}
                      alt={`${preview.title} album art`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-white truncate">{preview.title} — {preview.artist}</h2>
                  <p className="text-xs text-neutral-500 mt-1">scrolltunes.com</p>
                </div>
              </div>
            </div>

            {/* Twitter Card Preview */}
            <div className="border-2 border-blue-400/50 rounded-lg bg-neutral-900 p-4">
              <div className="flex gap-3">
                {preview.albumArt && (
                  <div className="w-20 h-20 flex-shrink-0 bg-neutral-800 rounded overflow-hidden">
                    <img
                      src={preview.albumArt}
                      alt={`${preview.title} album art`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{preview.title} — {preview.artist}</h3>
                  <p className="text-xs text-neutral-500 mt-1">scrolltunes.com</p>
                </div>
              </div>
            </div>

            {/* Copyable meta tags */}
            <details className="bg-neutral-900 rounded-lg p-4">
              <summary className="cursor-pointer font-semibold text-white hover:text-indigo-400">
                View meta tags
              </summary>
              <pre className="mt-4 text-xs text-neutral-400 overflow-x-auto bg-neutral-950 p-3 rounded border border-neutral-800">
{`<meta property="og:title" content="Sing ${preview.title} by ${preview.artist} on ScrollTunes" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${preview.url}" />
${preview.albumArt ? `<meta property="og:image" content="${preview.albumArt}" />
<meta property="og:image:width" content="300" />
<meta property="og:image:height" content="300" />` : ""}
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="Sing ${preview.title} by ${preview.artist} on ScrollTunes" />
${preview.albumArt ? `<meta name="twitter:image" content="${preview.albumArt}" />` : ""}`}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}
