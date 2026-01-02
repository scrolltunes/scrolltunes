"use client"

import { springs } from "@/animations"
import { FloatingMetronome, VoiceIndicator } from "@/components/audio"
import { ChordInfoPanel } from "@/components/chords"
import { FloatingActions, LyricsDisplay, SongActionBar, SongInfoModal } from "@/components/display"
import { ReportIssueModal } from "@/components/feedback"
import { useFooterSlot } from "@/components/layout/FooterContext"
import { AddToSetlistModal } from "@/components/setlists"
import { LyricsShareModal } from "@/components/share"
import { FavoriteButton, StatusLabel } from "@/components/ui"

import {
  type Lyrics,
  chordsStore,
  metronomeStore,
  recentSongsStore,
  useChordsState,
  useDetailedActivityStatus,
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
import { type LyricsApiResponse, applyEnhancement, isLyricsApiSuccess } from "@/lib"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import { parseTrackSlugWithId } from "@/lib/slug"
import { soundSystem } from "@/sounds"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  Bug,
  MusicNote,
  Pause,
  Play,
  SpinnerGap,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

type ErrorType = "invalid-url" | "not-found" | "network" | "invalid-lyrics"

interface AttributionSource {
  readonly name: string
  readonly url: string
}

type LoadState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Error"; readonly errorType: ErrorType }
  | {
      readonly _tag: "Loaded"
      readonly lyrics: Lyrics // Original lyrics (without enhancement applied)
      readonly enhancement: import("@/lib/db/schema").EnhancementPayload | null
      readonly chordEnhancement: import("@/lib/gp/chord-types").ChordEnhancementPayloadV1 | null
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
  "invalid-lyrics": {
    title: "Lyrics data is invalid",
    description: "The synced lyrics for this song are not available",
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

  // Share lyrics modal state
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareInitialIds, setShareInitialIds] = useState<readonly string[]>([])

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
  const detailedStatus = useDetailedActivityStatus()

  const lrclibId = parseTrackSlugWithId(params.trackSlugWithId)

  // Track if user manually enabled the microphone
  const userEnabledMic = useRef(false)

  useKeyboardShortcuts({ enabled: loadState._tag === "Loaded" })

  useTempoPreference({
    songId: lrclibId !== null ? `lrclib-${lrclibId}` : null,
    autoLoad: true,
    autoSave: true,
  })

  const isLoaded = loadState._tag === "Loaded"

  // Stop playback, voice detection, and metronome when navigating away (unmount only)
  const resetRef = useRef(reset)
  const stopListeningRef = useRef(stopListening)
  resetRef.current = reset
  stopListeningRef.current = stopListening
  useEffect(() => {
    return () => {
      resetRef.current()
      stopListeningRef.current()
      metronomeStore.stop()
      chordsStore.clear()
    }
  }, [])

  const hasEnhancedTiming = loadState._tag === "Loaded" && loadState.enhancement !== null

  // Status label for footer
  useEffect(() => {
    setSlot(
      <StatusLabel
        playerState={playerState}
        detailedStatus={detailedStatus}
        hasEnhancedTiming={hasEnhancedTiming}
      />,
    )
    return () => setSlot(null)
  }, [playerState, detailedStatus, setSlot, hasEnhancedTiming])

  useWakeLock({ enabled: isLoaded && preferences.wakeLockEnabled })

  const { isVisible: isHeaderVisible } = useAutoHide({
    timeoutMs: preferences.autoHideControlsMs,
    enabled: isLoaded && preferences.autoHideControlsMs > 0 && playerState._tag === "Playing",
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
    // Restart voice detection only if user had manually enabled it
    if (userEnabledMic.current) {
      await startListening()
    }
  }, [reset, startListening])

  const handleCreateCard = useCallback((selectedIds: readonly string[]) => {
    setShareInitialIds(selectedIds)
    setShowShareModal(true)
  }, [])

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
        setLoadState({
          _tag: "Loaded",
          lyrics: cached.lyrics,
          enhancement: cached.enhancement ?? null,
          chordEnhancement: cached.chordEnhancement ?? null,
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
          album: cached.lyrics.album ?? "",
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
          const errorType: ErrorType =
            response.status === 404
              ? "not-found"
              : response.status === 422
                ? "invalid-lyrics"
                : "network"
          setLoadState({ _tag: "Error", errorType })
          return
        }

        setLoadState({
          _tag: "Loaded",
          lyrics: data.lyrics,
          enhancement: data.enhancement ?? null,
          chordEnhancement: data.chordEnhancement ?? null,
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
          hasEnhancement: data.hasEnhancement ?? false,
          enhancement: data.enhancement,
          hasChordEnhancement: data.hasChordEnhancement ?? false,
          chordEnhancement: data.chordEnhancement,
        })

        // Add to recents (without changing order)
        recentSongsStore.updateMetadata({
          id,
          title: data.lyrics.title,
          artist: data.lyrics.artist,
          album: data.lyrics.album ?? "",
          durationSeconds: data.lyrics.duration,
          albumArt: data.albumArt ?? undefined,
        })

        // Upsert to song catalog with BPM (fire-and-forget, only for authenticated users)
        fetch("/api/songs/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.lyrics.title,
            artist: data.lyrics.artist,
            album: data.lyrics.album,
            durationMs: data.lyrics.duration ? data.lyrics.duration * 1000 : undefined,
            spotifyId: data.spotifyId ?? spotifyId,
            lrclibId: id,
            hasSyncedLyrics: true,
            bpmAttribution:
              data.bpm && data.attribution?.bpm
                ? {
                    bpm: data.bpm,
                    musicalKey: data.key,
                    source: data.attribution.bpm.name,
                    sourceUrl: data.attribution.bpm.url,
                  }
                : null,
          }),
        }).catch(() => {
          // Silently ignore errors (user may not be authenticated)
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

  // Load lyrics into player when loadState changes
  // Apply enhancement if available (provides better timing data for word-by-word mode)
  useEffect(() => {
    if (loadState._tag !== "Loaded") return

    const lyricsToLoad = loadState.enhancement
      ? applyEnhancement(loadState.lyrics, loadState.enhancement)
      : loadState.lyrics

    load(lyricsToLoad)
  }, [loadState, load])

  // Mark song as played when playback starts (moves to top of recents)
  const hasMarkedAsPlayed = useRef(false)
  useEffect(() => {
    if (lrclibId === null || hasMarkedAsPlayed.current) return
    if (playerState._tag === "Playing") {
      recentSongsStore.markAsPlayed(lrclibId)
      hasMarkedAsPlayed.current = true
    }
  }, [lrclibId, playerState._tag])

  // Preload audio components when song loads for low latency mic activation
  const hasPreloaded = useRef(false)
  useEffect(() => {
    if (loadState._tag !== "Loaded" || hasPreloaded.current) return
    hasPreloaded.current = true

    // Pre-check permission status (doesn't prompt user)
    voiceActivityStore.checkPermission()
    // Preload sound system in background (requires user gesture, but sets up deferred init)
    soundSystem.initialize()
  }, [loadState._tag])

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
      userEnabledMic.current = false
    } else {
      await startListening()
      userEnabledMic.current = true
    }
  }, [isListening, startListening, stopListening])

  const isPlaying = playerState._tag === "Playing"
  const isReady = playerState._tag !== "Idle"

  const currentBpm = loadState._tag === "Loaded" ? loadState.bpm : null
  const songTitle = loadState._tag === "Loaded" ? normalizeTrackName(loadState.lyrics.title) : null
  const songArtist =
    loadState._tag === "Loaded" ? normalizeArtistName(loadState.lyrics.artist) : null

  // Prevent overscroll chaining but allow pull-to-refresh
  useEffect(() => {
    const originalOverscroll = document.documentElement.style.overscrollBehaviorY
    document.documentElement.style.overscrollBehaviorY = "contain"
    return () => {
      document.documentElement.style.overscrollBehaviorY = originalOverscroll
    }
  }, [])

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
    const canReport =
      loadState.errorType === "not-found" || loadState.errorType === "invalid-lyrics"

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
        {canReport && (
          <>
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className="px-6 py-3 bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 rounded-full font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Bug size={20} />
              Report this issue
            </button>
            <ReportIssueModal
              isOpen={showReportModal}
              onClose={() => setShowReportModal(false)}
              songContext={{
                title: params.trackSlugWithId?.split("-").slice(0, -1).join(" ") ?? "Unknown",
                artist: params.artistSlug?.replace(/-/g, " ") ?? "Unknown",
                duration: 0,
                bpm: null,
                key: null,
                spotifyId: spotifyId,
                bpmSource: null,
                lrclibId: lrclibId,
                lyricsError:
                  loadState.errorType === "invalid-lyrics"
                    ? `Invalid lyrics data (ID: ${lrclibId})`
                    : `Lyrics not found (ID: ${lrclibId})`,
              }}
            />
          </>
        )}
      </div>
    )
  }

  return (
    <div ref={doubleTapRef} className="h-screen bg-neutral-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
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
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium truncate">{songTitle}</span>
              <span className="text-xs text-neutral-500 truncate">{songArtist}</span>
            </div>
            {lrclibId !== null && (
              <FavoriteButton
                songId={lrclibId}
                title={loadState._tag === "Loaded" ? loadState.lyrics.title : ""}
                artist={loadState._tag === "Loaded" ? loadState.lyrics.artist : ""}
                {...(loadState._tag === "Loaded" &&
                  loadState.albumArt !== null && { albumArt: loadState.albumArt })}
                size="sm"
                className="shrink-0"
              />
            )}
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
                  {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
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
      </header>

      <main className="pt-16 h-[calc(100vh-4rem)] flex flex-col min-h-0">
        {lrclibId !== null && (
          <AnimatePresence initial={false}>
            {(!isLoaded || isHeaderVisible) && (
              <motion.div
                className="sticky top-16 z-30 bg-neutral-950/80 backdrop-blur"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springs.default}
                layout
              >
                <SongActionBar
                  songId={lrclibId}
                  title={loadState.lyrics.title}
                  artist={loadState.lyrics.artist}
                  {...(loadState.albumArt !== null && { albumArt: loadState.albumArt })}
                  onAddToSetlist={() => setShowAddToSetlist(true)}
                  onShareClick={() => setShowShareModal(true)}
                />
                <ChordInfoPanel
                  isOpen={showChordPanel}
                  {...(chordsState.data?.tuning !== undefined && {
                    tuning: chordsState.data.tuning,
                  })}
                  {...(loadState._tag === "Loaded" &&
                    loadState.key !== null && { musicalKey: loadState.key })}
                  {...(chordsState.data?.capo !== undefined && { capo: chordsState.data.capo })}
                  transpose={transpose}
                  onTransposeChange={v => chordsStore.setTranspose(v)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
        <LyricsDisplay
          className="flex-1 pb-12"
          chordEnhancement={loadState._tag === "Loaded" ? loadState.chordEnhancement : null}
          onCreateCard={handleCreateCard}
        />

        <FloatingActions
          songId={lrclibId ?? 0}
          title={loadState._tag === "Loaded" ? loadState.lyrics.title : ""}
          artist={loadState._tag === "Loaded" ? loadState.lyrics.artist : ""}
          {...(loadState._tag === "Loaded" &&
            loadState.albumArt !== null && { albumArt: loadState.albumArt })}
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
          hasEnhancedTiming={loadState.enhancement !== null}
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
            hasEnhancedTiming: loadState.enhancement !== null,
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
            ...(loadState.lyrics.album !== undefined && { album: loadState.lyrics.album }),
          }}
        />
      )}

      {loadState._tag === "Loaded" && (
        <LyricsShareModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false)
            setShareInitialIds([])
          }}
          title={loadState.lyrics.title}
          artist={loadState.lyrics.artist}
          albumArt={loadState.albumArt}
          spotifyId={loadState.spotifyId}
          lines={loadState.lyrics.lines}
          initialSelectedIds={shareInitialIds}
        />
      )}
    </div>
  )
}
