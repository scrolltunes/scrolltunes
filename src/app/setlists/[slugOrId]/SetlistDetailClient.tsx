"use client"

import { springs } from "@/animations"
import { AlbumArtSkeleton, Logo } from "@/components/ui"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { makeCanonicalPath, uuidToBase64Url } from "@/lib/slug"
import {
  ArrowLeft,
  Check,
  Copy,
  MusicNote,
  MusicNotesSimple,
  Queue,
  Share,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { memo, useCallback, useEffect, useState } from "react"

interface SetlistSong {
  readonly songId: string
  readonly songProvider: string
  readonly songTitle: string
  readonly songArtist: string
  readonly sortOrder: number
}

interface Setlist {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly color: string | null
  readonly icon: string | null
}

interface SetlistDetailClientProps {
  readonly setlist: Setlist
  readonly songs: readonly SetlistSong[]
}

export function SetlistDetailClient({ setlist, songs }: SetlistDetailClientProps) {
  const shortCode = uuidToBase64Url(setlist.id)
  const shortUrl =
    typeof window !== "undefined" ? `${window.location.origin}/sl/${shortCode}` : `/sl/${shortCode}`

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header setlistName={setlist.name} shortUrl={shortUrl} />

      <main className="pt-20 pb-8 px-4">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
          >
            <div className="flex items-start gap-4 mb-6">
              <div
                className="flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: setlist.color ?? "#262626" }}
              >
                <Queue size={32} weight="fill" className="text-white/80" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-semibold truncate">{setlist.name}</h1>
                {setlist.description && (
                  <p className="text-neutral-400 mt-1">{setlist.description}</p>
                )}
                <p className="text-sm text-neutral-500 mt-2">
                  {songs.length} {songs.length === 1 ? "song" : "songs"}
                </p>
              </div>
            </div>

            {songs.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-900 flex items-center justify-center">
                  <MusicNotesSimple size={32} className="text-neutral-500" />
                </div>
                <p className="text-neutral-400">This setlist is empty</p>
              </div>
            ) : (
              <ul className="space-y-2" aria-label="Songs in setlist">
                {songs.map((song, index) => (
                  <SetlistSongItem
                    key={`${song.songProvider}:${song.songId}`}
                    song={song}
                    index={index}
                  />
                ))}
              </ul>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  )
}

interface SetlistSongItemProps {
  readonly song: SetlistSong
  readonly index: number
}

const SetlistSongItem = memo(function SetlistSongItem({ song, index }: SetlistSongItemProps) {
  const [albumArt, setAlbumArt] = useState<string | null | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (song.songProvider !== "lrclib") {
      setIsLoading(false)
      return
    }

    const songId = Number(song.songId)
    if (Number.isNaN(songId)) {
      setIsLoading(false)
      return
    }

    const cached = loadCachedLyrics(songId)
    if (cached?.albumArt) {
      setAlbumArt(cached.albumArt)
      setIsLoading(false)
      return
    }

    let cancelled = false

    fetch(`/api/lyrics/${songId}`)
      .then(async response => {
        if (!response.ok || cancelled) {
          if (!cancelled) setIsLoading(false)
          return
        }

        const data = await response.json()
        if (cancelled) return

        const art = data.albumArt as string | null | undefined

        if (data.lyrics) {
          saveCachedLyrics(songId, {
            lyrics: data.lyrics,
            bpm: data.bpm ?? null,
            key: data.key ?? null,
            albumArt: art ?? undefined,
            spotifyId: data.spotifyId ?? undefined,
            bpmSource: data.attribution?.bpm ?? undefined,
            lyricsSource: data.attribution?.lyrics ?? undefined,
          })
        }

        setAlbumArt(art ?? null)
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setAlbumArt(null)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [song.songId, song.songProvider])

  const songPath =
    song.songProvider === "lrclib"
      ? makeCanonicalPath({
          id: Number(song.songId),
          title: song.songTitle,
          artist: song.songArtist,
        })
      : null

  const content = (
    <>
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden">
        {isLoading ? (
          <AlbumArtSkeleton />
        ) : albumArt ? (
          <img src={albumArt} alt="" className="w-full h-full object-cover" />
        ) : (
          <MusicNote size={20} weight="fill" className="text-neutral-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{song.songTitle}</p>
        <p className="text-sm text-neutral-400 truncate">{song.songArtist}</p>
      </div>
    </>
  )

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.default, delay: index * 0.03 }}
    >
      {songPath ? (
        <Link
          href={songPath}
          className="flex items-center gap-3 p-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors"
        >
          {content}
        </Link>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-neutral-900">{content}</div>
      )}
    </motion.li>
  )
})

function Header({ setlistName, shortUrl }: { setlistName: string; shortUrl: string }) {
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(() => {
    setShowShareMenu(prev => !prev)
  }, [])

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(shortUrl)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setShowShareMenu(false)
    }, 1500)
  }, [shortUrl])

  return (
    <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link
          href="/setlists"
          className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
          aria-label="Back to setlists"
        >
          <ArrowLeft size={20} />
        </Link>

        <span className="flex-1 text-lg font-semibold flex items-center gap-2 truncate">
          <Logo size={24} className="text-indigo-500 flex-shrink-0" />
          <span className="truncate">{setlistName}</span>
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={handleShare}
            className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
            aria-label="Share setlist"
          >
            <Share size={20} />
          </button>

          {showShareMenu && (
            <div className="absolute right-0 top-12 w-72 p-3 rounded-xl bg-neutral-900 border border-neutral-800 shadow-xl">
              <p className="text-xs text-neutral-500 mb-2">Share link</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-300 truncate flex-1 font-mono bg-neutral-800 px-2 py-1.5 rounded">
                  {shortUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm transition-colors"
                >
                  {copied ? <Check size={16} className="text-white" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
