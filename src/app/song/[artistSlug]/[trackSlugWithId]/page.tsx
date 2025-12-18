"use client"

import { springs } from "@/animations"
import { FloatingMetronome, VoiceIndicator } from "@/components/audio"
import { ChordInfoPanel } from "@/components/chords"
import {
  FloatingActions,
  LyricsDisplay,
  SongActionBar,
  SongInfoModal,
} from "@/components/display"
import { ReportIssueModal } from "@/components/feedback"
import { useFooterSlot } from "@/components/layout/FooterContext"
import { AddToSetlistModal } from "@/components/setlists"

import {
  type Lyrics,
  chordsStore,
  recentSongsStore,
  useChordsState,
  usePlayerControls,
  usePlayerState,
  usePreferences,
  useShowChords,
  useTranspose,
  voiceActivityStore,
} from "@/core"
import {
  useAutoHide,
  useDoubleTap,
  useKeyboardShortcuts,
  useShakeDetection,
  useTempoPreference,
  useVoiceTrigger,
  useWakeLock,
} from "@/hooks"
import { type LyricsApiResponse, isLyricsApiSuccess } from "@/lib"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import { parseTrackSlugWithId } from "@/lib/slug"
import { soundSystem } from "@/sounds"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  MusicNote,
  Pause,
  Play,
  SpinnerGap,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type ErrorType = "invalid-url" | "not-found" | "network"

interface AttributionSource {
  readonly name: string
  readonly url: string
}

type LoadState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Error"; readonly errorType: ErrorType }
  | {
      readonly _tag: "Loaded"
      readonly lyrics: Lyrics
      readonly bpm: number | null
      readonly key: string | null
      readonly albumArt: string | null
      readonly spotifyId: string | null
      readonly bpmSource: AttributionSource | null
      readonly lyricsSource: AttributionSource | null
    }

const errorMessages: Record<ErrorType, { title: string; description: string }> = {
  "invalid-url": {
    title: "Invalid song URL",
    description: "Please search for the song again",
  },
  "not-found": {
    title: "Lyrics not available",
    description: "Try a different version of this song",
  },
  network: {
    title: "Could not load lyrics",
    description: "Check your internet connection and try again",
  },
}

export default function SongPage() {
  const params = useParams<{ artistSlug: string; trackSlugWithId: string }>()
  const searchParams = useSearchParams()
  const spotifyId = searchParams.get("spotifyId")
  const [loadState, setLoadState] = useState<LoadState>({ _tag: "Loading" })
  const [showInfo, setShowInfo] = useState(false)
  const [showAddToSetlist, setShowAddToSetlist] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showChordPanel, setShowChordPanel] = useState(false)
  const chordPanelWasOpen = useRef(showChordPanel)

  const playerState = usePlayerState()
  const { play, pause, reset, load } = usePlayerControls()
  const preferences = usePreferences()
  const { setSlot } = useFooterSlot()
  const chordsState = useChordsState()
  const showChords = useShowChords()
  const transpose = useTranspose()

  const { isListening, isSpeaking, level, startListening, stopListening } = useVoiceTrigger({
    autoPlay: true,
    resumeOnVoice: true,
  })

  const lrclibId = parseTrackSlugWithId(params.trackSlugWithId)

  useKeyboardShortcuts({ enabled: loadState._tag === "Loaded" })

  useTempoPreference({
    songId: lrclibId !== null ? `lrclib-${lrclibId}` : null,
    autoLoad: true,
    autoSave: true,
  })

  const isLoaded = loadState._tag === "Loaded"

  // Stop playback and voice detection when navigating away (unmount only)
  const resetRef = useRef(reset)
  const stopListeningRef = useRef(stopListening)
  resetRef.current = reset
  stopListeningRef.current = stopListening
  useEffect(() => {
    return () => {
      resetRef.current()
      stopListeningRef.current()
      chordsStore.clear()
    }
  }, [])

  // Status text for footer
  const statusText = useMemo(() => {
    const parts: string[] = []

    if (playerState._tag === "Playing") {
      parts.push("Playing")
    } else if (playerState._tag === "Paused") {
      parts.push("Paused")
    } else if (playerState._tag === "Ready") {
      parts.push("Ready")
    }

    if (isListening && !isSpeaking && playerState._tag !== "Playing") {
      parts.push("Listening for voice")
    }

    return parts.length > 0 ? parts.join(" • ") : null
  }, [playerState._tag, isListening, isSpeaking])

  useEffect(() => {
    if (statusText) {
      setSlot(<span className="text-neutral-400">{statusText}</span>)
    } else {
      setSlot(null)
    }
    return () => setSlot(null)
  }, [statusText, setSlot])

  useWakeLock({ enabled: isLoaded && preferences.wakeLockEnabled })

  const { isVisible: isHeaderVisible } = useAutoHide({
    timeoutMs: preferences.autoHideControlsMs,
    enabled: isLoaded && preferences.autoHideControlsMs > 0,
  })

  const handleTogglePlayPause = useCallback(async () => {
    if (playerState._tag === "Playing") {
      pause()
    } else {
      // Initialize sound system on user gesture (required for metronome)
      await soundSystem.initialize()
      play()
    }
  }, [playerState._tag, play, pause])

  const handleReset = useCallback(async () => {
    reset()
    // Restart voice detection if permission was granted
    const status = await voiceActivityStore.checkPermission()
    if (status === "granted") {
      await startListening()
    }
  }, [reset, startListening])

  const doubleTapRef = useDoubleTap<HTMLDivElement>({
    onDoubleTap: handleTogglePlayPause,
    enabled: isLoaded && preferences.doubleTapEnabled,
  })

  useShakeDetection({
    onShake: handleReset,
    enabled: isLoaded && preferences.shakeToRestartEnabled,
  })

  useEffect(() => {
    if (lrclibId === null) {
      setLoadState({ _tag: "Error", errorType: "invalid-url" })
      return
    }

    const id = lrclibId
    const controller = new AbortController()

    async function fetchChordsForSong(artist: string, title: string) {
      const normalizedArtist = normalizeArtistName(artist)
      const normalizedTitle = normalizeTrackName(title)
      try {
        const searchRes = await fetch(
          `/api/chords/search?artist=${encodeURIComponent(normalizedArtist)}&title=${encodeURIComponent(normalizedTitle)}`,
          { signal: controller.signal },
        )
        const searchData = await searchRes.json()

        if (searchData.results && searchData.results.length > 0) {
          const match = searchData.results[0]
          await chordsStore.fetchChords(match.songId, match.artist, match.title)
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Failed to fetch chords:", error)
        }
      }
    }

    async function fetchLyrics() {
      // Try cache first
      const cached = loadCachedLyrics(id)

      // Use cache if it has BPM data, otherwise refetch to get BPM
      if (cached && cached.bpm !== null) {
        load(cached.lyrics)
        setLoadState({
          _tag: "Loaded",
          lyrics: cached.lyrics,
          bpm: cached.bpm,
          key: cached.key ?? null,
          albumArt: cached.albumArt ?? null,
          spotifyId: cached.spotifyId ?? null,
          bpmSource: cached.bpmSource ?? null,
          lyricsSource: cached.lyricsSource ?? null,
        })

        recentSongsStore.updateMetadata({
          id,
          title: cached.lyrics.title,
          artist: cached.lyrics.artist,
          album: "",
          durationSeconds: cached.lyrics.duration,
          albumArt: cached.albumArt,
        })

        fetchChordsForSong(cached.lyrics.artist, cached.lyrics.title)
        return
      }

      // Prefer spotifyId from: URL param > cached > none
      const resolvedSpotifyId = spotifyId ?? cached?.spotifyId

      // Fetch from API
      setLoadState({ _tag: "Loading" })
      try {
        const url = resolvedSpotifyId
          ? `/api/lyrics/${id}?spotifyId=${resolvedSpotifyId}`
          : `/api/lyrics/${id}`
        const response = await fetch(url, {
          signal: controller.signal,
        })
        const data: LyricsApiResponse = await response.json()

        if (!response.ok || !isLyricsApiSuccess(data)) {
          const errorType: ErrorType = response.status === 404 ? "not-found" : "network"
          setLoadState({ _tag: "Error", errorType })
          return
        }

        load(data.lyrics)
        setLoadState({
          _tag: "Loaded",
          lyrics: data.lyrics,
          bpm: data.bpm,
          key: data.key,
          albumArt: data.albumArt ?? null,
          spotifyId: data.spotifyId ?? spotifyId ?? null,
          bpmSource: data.attribution?.bpm ?? null,
          lyricsSource: data.attribution?.lyrics ?? null,
        })

        // Cache lyrics with spotifyId from API response (or URL param as fallback)
        saveCachedLyrics(id, {
          lyrics: data.lyrics,
          bpm: data.bpm,
          key: data.key,
          albumArt: data.albumArt ?? undefined,
          spotifyId: data.spotifyId ?? spotifyId ?? undefined,
          bpmSource: data.attribution?.bpm ?? undefined,
          lyricsSource: data.attribution?.lyrics ?? undefined,
        })

        // Add to recents (without changing order)
        recentSongsStore.updateMetadata({
          id,
          title: data.lyrics.title,
          artist: data.lyrics.artist,
          album: "",
          durationSeconds: data.lyrics.duration,
          albumArt: data.albumArt ?? undefined,
        })

        fetchChordsForSong(data.lyrics.artist, data.lyrics.title)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        setLoadState({ _tag: "Error", errorType: "network" })
      }
    }

    fetchLyrics()

    return () => {
      controller.abort()
    }
  }, [lrclibId, spotifyId])

  // Mark song as played when playback starts (moves to top of recents)
  const hasMarkedAsPlayed = useRef(false)
  useEffect(() => {
    if (lrclibId === null || hasMarkedAsPlayed.current) return
    if (playerState._tag === "Playing") {
      recentSongsStore.markAsPlayed(lrclibId)
      hasMarkedAsPlayed.current = true
    }
  }, [lrclibId, playerState._tag])

  // Request mic permission on first song load, auto-start listening if already granted
  const hasRequestedPermission = useRef(false)
  useEffect(() => {
    if (loadState._tag !== "Loaded" || hasRequestedPermission.current) return
    hasRequestedPermission.current = true

    async function handleMicPermission() {
      const status = await voiceActivityStore.checkPermission()

      if (status === "granted") {
        // Permission already granted - auto-start listening
        await startListening()
      } else if (status === "prompt") {
        // First time - request permission
        const granted = await voiceActivityStore.requestPermission()
        if (granted) {
          await startListening()
        }
      }
      // If denied, do nothing - user can manually enable via button
    }

    handleMicPermission()
  }, [loadState._tag, startListening])

  useEffect(() => {
    if (!showChords) {
      chordPanelWasOpen.current = showChordPanel
      setShowChordPanel(false)
    } else {
      setShowChordPanel(chordPanelWasOpen.current)
    }
  }, [showChords])

  const handleToggleListening = useCallback(async () => {
    if (isListening) {
      stopListening()
    } else {
      await startListening()
    }
  }, [isListening, startListening, stopListening])

  const isPlaying = playerState._tag === "Playing"
  const isReady = playerState._tag !== "Idle"

  const shouldShowHeader = !isLoaded || isHeaderVisible
  const currentBpm = loadState._tag === "Loaded" ? loadState.bpm : null
  const songTitle = loadState._tag === "Loaded" ? normalizeTrackName(loadState.lyrics.title) : null
  const songArtist =
    loadState._tag === "Loaded" ? normalizeArtistName(loadState.lyrics.artist) : null

  if (loadState._tag === "Loading") {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
        >
          <SpinnerGap size={48} className="text-indigo-500" />
        </motion.div>
        <p className="text-neutral-400">Loading lyrics...</p>
      </div>
    )
  }

  if (loadState._tag === "Error") {
    const { title, description } = errorMessages[loadState.errorType]
    const canRetry = loadState.errorType === "network" || loadState.errorType === "not-found"

    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-6 p-6">
        <MusicNote size={64} weight="fill" className="text-neutral-700" />
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">{title}</h1>
          <p className="text-neutral-400">{description}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {canRetry && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full font-medium transition-colors flex items-center justify-center gap-2"
            >
              <ArrowCounterClockwise size={20} />
              Try again
            </button>
          )}
          <Link
            href="/"
            className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-full font-medium transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft size={20} />
            Back to search
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div ref={doubleTapRef} className="min-h-screen bg-neutral-950 text-white">
      <AnimatePresence>
        {shouldShowHeader && (
          <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={springs.default}
            className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800"
          >
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
              <Link
                href="/"
                className="w-10 h-10 shrink-0 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
                aria-label="Back to search"
              >
                <ArrowLeft size={20} />
              </Link>
              {loadState.albumArt ? (
                <img
                  src={loadState.albumArt}
                  alt=""
                  className="w-10 h-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="w-10 h-10 shrink-0 rounded-lg bg-neutral-800 flex items-center justify-center">
                  <MusicNote size={20} weight="fill" className="text-neutral-600" />
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium truncate">{songTitle}</span>
                <span className="text-xs text-neutral-500 truncate">{songArtist}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <VoiceIndicator
                  isListening={isListening}
                  isSpeaking={isSpeaking}
                  level={level}
                  onToggle={handleToggleListening}
                  size="sm"
                />

                {isReady && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTogglePlayPause}
                      className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-colors"
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause size={20} weight="fill" />
                      ) : (
                        <Play size={20} weight="fill" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
                      aria-label="Reset"
                    >
                      <ArrowCounterClockwise size={20} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <main className="pt-16 h-screen flex flex-col">
        {lrclibId !== null && (
          <div className="relative">
            <SongActionBar
              songId={lrclibId}
              title={loadState.lyrics.title}
              artist={loadState.lyrics.artist}
              {...(loadState.albumArt !== null && { albumArt: loadState.albumArt })}
              onAddToSetlist={() => setShowAddToSetlist(true)}
              onChordSettingsClick={() => setShowChordPanel(prev => !prev)}
              isChordPanelOpen={showChordPanel}
            />
            <ChordInfoPanel
              isOpen={showChordPanel}
              {...(chordsState.data?.tuning !== undefined && { tuning: chordsState.data.tuning })}
              {...(loadState._tag === "Loaded" &&
                loadState.key !== null && { musicalKey: loadState.key })}
              {...(chordsState.data?.capo !== undefined && { capo: chordsState.data.capo })}
              transpose={transpose}
              onTransposeChange={v => chordsStore.setTranspose(v)}
            />
          </div>
        )}
        <LyricsDisplay className="flex-1 pb-12" />

        <FloatingActions
          songId={lrclibId ?? 0}
          title={loadState._tag === "Loaded" ? loadState.lyrics.title : ""}
          artist={loadState._tag === "Loaded" ? loadState.lyrics.artist : ""}
          {...(loadState._tag === "Loaded" && loadState.albumArt !== null && { albumArt: loadState.albumArt })}
          hasIssue={loadState.bpm === null || chordsState.status === "error"}
          onInfoPress={() => setShowInfo(true)}
          onWarningPress={() => setShowReportModal(true)}
          position="bottom-left"
        />
        <FloatingMetronome bpm={currentBpm} position="bottom-right" />
      </main>

      {loadState._tag === "Loaded" && (
        <SongInfoModal
          isOpen={showInfo}
          onClose={() => setShowInfo(false)}
          title={loadState.lyrics.title}
          artist={loadState.lyrics.artist}
          duration={loadState.lyrics.duration}
          bpm={loadState.bpm}
          musicalKey={loadState.key}
          spotifyId={loadState.spotifyId}
          bpmSource={loadState.bpmSource}
          lyricsSource={loadState.lyricsSource}
          albumArt={loadState.albumArt}
        />
      )}

      {loadState._tag === "Loaded" && (
        <ReportIssueModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          songContext={{
            title: loadState.lyrics.title,
            artist: loadState.lyrics.artist,
            duration: loadState.lyrics.duration,
            bpm: loadState.bpm,
            key: loadState.key,
            spotifyId: loadState.spotifyId,
            bpmSource: loadState.bpmSource?.name ?? null,
            lrclibId,
            chordsError: chordsState.status === "error" ? chordsState.error : null,
            chordsErrorUrl: chordsState.status === "error" ? chordsState.errorUrl : null,
          }}
        />
      )}

      {loadState._tag === "Loaded" && lrclibId !== null && (
        <AddToSetlistModal
          isOpen={showAddToSetlist}
          onClose={() => setShowAddToSetlist(false)}
          song={{
            songId: lrclibId,
            title: loadState.lyrics.title,
            artist: loadState.lyrics.artist,
          }}
        />
      )}
    </div>
  )
}
