"use client"

import { springs } from "@/animations"
import { FloatingMetronome, SingingDebugIndicator, VoiceIndicator } from "@/components/audio"
import { ChordInfoPanel } from "@/components/chords"
import { LyricsDisplay, ScoreBookDisplay, SongActionBar, SongInfoModal } from "@/components/display"
import { EditModeProvider, EditToolbar, EditableLyricsDisplay } from "@/components/edit-mode"
import { ReportIssueModal } from "@/components/feedback"
import { useFooterSlot } from "@/components/layout/FooterContext"
import { AddToSetlistModal } from "@/components/setlists"
import { ShareExperience } from "@/components/share"
import { AmbientBackground, StatusLabel } from "@/components/ui"

import {
  type Lyrics,
  chordsStore,
  metronomeStore,
  recentSongsStore,
  songEditsStore,
  useChordsState,
  useDetailedActivityStatus,
  useEditPayload,
  useIsEditMode,
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
import { applyEnhancement } from "@/lib"
import { computeLrcHashSync } from "@/lib/lrc-hash"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import { applyEditPatches } from "@/lib/song-edits"
import { userApi } from "@/lib/user-api"
import type { SongDataSuccess } from "@/services/song-loader"
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
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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
      readonly lyrics: Lyrics
      readonly lrcHash: string
      readonly hasEnhancement: boolean
      readonly hasChordEnhancement: boolean
      readonly bpm: number | null
      readonly key: string | null
      readonly albumArt: string | null
      readonly albumArtLarge: string | null
      readonly spotifyId: string | null
      readonly bpmSource: AttributionSource | null
      readonly lyricsSource: AttributionSource | null
    }

interface EnhancementsState {
  readonly loading: boolean
  readonly enhancement: import("@/lib/db/schema").EnhancementPayload | null
  readonly chordEnhancement: import("@/lib/gp/chord-types").ChordEnhancementPayloadV1 | null
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

export interface SongPageClientProps {
  readonly lrclibId: number
  readonly artistSlug: string
  readonly trackSlugWithId: string
  readonly initialData: SongDataSuccess | null
  readonly initialError: ErrorType | null
}

function computeInitialLoadState(
  lrclibId: number,
  initialData: SongDataSuccess | null,
  initialError: ErrorType | null,
): LoadState {
  if (initialError) {
    return { _tag: "Error", errorType: initialError }
  }

  // Always prefer localStorage cache first (avoids network calls for cached songs)
  if (typeof window !== "undefined") {
    const cached = loadCachedLyrics(lrclibId)
    if (cached) {
      const lrcContent = cached.lyrics.lines.map(l => l.text).join("\n")
      const lrcHash = computeLrcHashSync(lrcContent)

      return {
        _tag: "Loaded",
        lyrics: cached.lyrics,
        lrcHash,
        hasEnhancement: cached.hasEnhancement ?? false,
        hasChordEnhancement: cached.hasChordEnhancement ?? false,
        bpm: cached.bpm,
        key: cached.key,
        albumArt: cached.albumArt ?? null,
        albumArtLarge: cached.albumArtLarge ?? null,
        spotifyId: cached.spotifyId ?? null,
        bpmSource: cached.bpmSource ?? null,
        lyricsSource: cached.lyricsSource ?? null,
      }
    }
  }

  // Fall back to server data
  if (initialData) {
    const lrcContent = initialData.lyrics.lines.map(l => l.text).join("\n")
    const lrcHash = computeLrcHashSync(lrcContent)

    return {
      _tag: "Loaded",
      lyrics: initialData.lyrics,
      lrcHash,
      hasEnhancement: initialData.hasEnhancement,
      hasChordEnhancement: initialData.hasChordEnhancement,
      bpm: initialData.bpm,
      key: initialData.key,
      albumArt: initialData.albumArt,
      albumArtLarge: initialData.albumArtLarge,
      spotifyId: initialData.spotifyId,
      bpmSource: initialData.bpmSource,
      lyricsSource: initialData.lyricsSource,
    }
  }

  return { _tag: "Loading" }
}

export default function SongPageClient({
  lrclibId,
  artistSlug,
  trackSlugWithId,
  initialData,
  initialError,
}: SongPageClientProps) {
  const searchParams = useSearchParams()
  const spotifyId = searchParams.get("spotifyId")
  const shouldEnterEditMode = searchParams.get("edit") === "1"

  const { initialLoadState, initialEnhancements, loadedFromCache } = useMemo(() => {
    // Check localStorage first (before computing load state)
    if (typeof window !== "undefined") {
      const cached = loadCachedLyrics(lrclibId)
      if (cached) {
        const loadState = computeInitialLoadState(lrclibId, initialData, initialError)
        return {
          initialLoadState: loadState,
          initialEnhancements: {
            loading: false,
            enhancement: cached.enhancement ?? null,
            chordEnhancement: cached.chordEnhancement ?? null,
          },
          loadedFromCache: true,
        }
      }
    }

    const loadState = computeInitialLoadState(lrclibId, initialData, initialError)
    return {
      initialLoadState: loadState,
      initialEnhancements: {
        loading: false,
        enhancement: null,
        chordEnhancement: null,
      },
      loadedFromCache: false,
    }
  }, [lrclibId, initialData, initialError])

  const [loadState] = useState<LoadState>(initialLoadState)
  const [enhancements, setEnhancements] = useState<EnhancementsState>(initialEnhancements)
  const wasLoadedFromCache = useRef(loadedFromCache)
  const [showInfo, setShowInfo] = useState(false)
  const [showAddToSetlist, setShowAddToSetlist] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showChordPanel, setShowChordPanel] = useState(false)
  const chordPanelWasOpen = useRef(showChordPanel)

  const [showShareModal, setShowShareModal] = useState(false)
  const [shareInitialIds, setShareInitialIds] = useState<readonly string[]>([])

  const playerState = usePlayerState()
  const { play, pause, reset, load } = usePlayerControls()
  const preferences = usePreferences()
  const { setSlot } = useFooterSlot()
  const chordsState = useChordsState()
  const showChords = useShowChords()
  const transpose = useTranspose()
  const isEditMode = useIsEditMode()
  const editPayload = useEditPayload()

  const { isListening, isSpeaking, level, startListening, stopListening } = useVoiceTrigger({
    autoPlay: true,
    resumeOnVoice: true,
  })
  const detailedStatus = useDetailedActivityStatus()

  const userEnabledMic = useRef(false)

  useKeyboardShortcuts({
    enabled: loadState._tag === "Loaded",
    displayMode: preferences.displayMode,
  })

  useTempoPreference({
    songId: `lrclib-${lrclibId}`,
    autoLoad: true,
    autoSave: true,
  })

  const isLoaded = loadState._tag === "Loaded"

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

  const hasEnhancedTiming = loadState._tag === "Loaded" && enhancements.enhancement !== null

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
      await soundSystem.initialize()
      play()
    }
  }, [playerState._tag, play, pause])

  const handleReset = useCallback(async () => {
    reset()
    if (userEnabledMic.current) {
      await startListening()
    }
  }, [reset, startListening])

  const handleCreateCard = useCallback((selectedIds: readonly string[]) => {
    setShareInitialIds(selectedIds)
    setShowShareModal(true)
  }, [])

  const handleEnterEditMode = useCallback(() => {
    if (loadState._tag !== "Loaded") return
    songEditsStore.loadEdits(lrclibId, loadState.lrcHash)
    songEditsStore.enterEditMode()
  }, [loadState, lrclibId])

  const handleExitEditMode = useCallback(() => {
    songEditsStore.exitEditMode()
  }, [])

  const doubleTapRef = useDoubleTap<HTMLDivElement>({
    onDoubleTap: handleTogglePlayPause,
    enabled: isLoaded && preferences.doubleTapEnabled,
  })

  useShakeDetection({
    onShake: handleReset,
    enabled: isLoaded && preferences.shakeToRestartEnabled,
  })

  // Cache data and update recents when loaded from server
  const hasCachedInitialData = useRef(false)
  useEffect(() => {
    if (loadState._tag !== "Loaded" || hasCachedInitialData.current) return
    hasCachedInitialData.current = true

    // Skip caching and API calls if loaded from localStorage cache
    if (wasLoadedFromCache.current) return

    // Cache lyrics for future visits
    saveCachedLyrics(lrclibId, {
      lyrics: loadState.lyrics,
      bpm: loadState.bpm,
      key: loadState.key,
      albumArt: loadState.albumArt ?? undefined,
      albumArtLarge: loadState.albumArtLarge ?? undefined,
      spotifyId: loadState.spotifyId ?? undefined,
      bpmSource: loadState.bpmSource ?? undefined,
      lyricsSource: loadState.lyricsSource ?? undefined,
      hasEnhancement: enhancements.enhancement !== null,
      enhancement: enhancements.enhancement,
      hasChordEnhancement: enhancements.chordEnhancement !== null,
      chordEnhancement: enhancements.chordEnhancement,
    })

    // Update recents
    recentSongsStore.updateMetadata({
      id: lrclibId,
      title: loadState.lyrics.title,
      artist: loadState.lyrics.artist,
      album: loadState.lyrics.album ?? "",
      durationSeconds: loadState.lyrics.duration,
      albumArt: loadState.albumArt ?? undefined,
    })

    // Upsert to song catalog (fire-and-forget)
    userApi.post("/api/songs/upsert", {
      title: loadState.lyrics.title,
      artist: loadState.lyrics.artist,
      album: loadState.lyrics.album,
      durationMs: loadState.lyrics.duration ? loadState.lyrics.duration * 1000 : undefined,
      spotifyId: loadState.spotifyId ?? spotifyId,
      lrclibId,
      hasSyncedLyrics: true,
      bpmAttribution:
        loadState.bpm && loadState.bpmSource
          ? {
              bpm: loadState.bpm,
              musicalKey: loadState.key,
              source: loadState.bpmSource.name,
              sourceUrl: loadState.bpmSource.url,
            }
          : null,
    })
  }, [loadState, lrclibId, spotifyId])

  // Update cache when enhancements are loaded (so next visit has them immediately)
  const hasUpdatedCacheWithEnhancements = useRef(false)
  useEffect(() => {
    if (loadState._tag !== "Loaded" || hasUpdatedCacheWithEnhancements.current) return
    if (!enhancements.enhancement && !enhancements.chordEnhancement) return
    // Skip if loaded from cache (enhancements already cached)
    if (wasLoadedFromCache.current) return

    hasUpdatedCacheWithEnhancements.current = true

    saveCachedLyrics(lrclibId, {
      lyrics: loadState.lyrics,
      bpm: loadState.bpm,
      key: loadState.key,
      albumArt: loadState.albumArt ?? undefined,
      albumArtLarge: loadState.albumArtLarge ?? undefined,
      spotifyId: loadState.spotifyId ?? undefined,
      bpmSource: loadState.bpmSource ?? undefined,
      lyricsSource: loadState.lyricsSource ?? undefined,
      hasEnhancement: enhancements.enhancement !== null,
      enhancement: enhancements.enhancement,
      hasChordEnhancement: enhancements.chordEnhancement !== null,
      chordEnhancement: enhancements.chordEnhancement,
    })
  }, [loadState, lrclibId, enhancements])

  // Load lyrics into player when loadState or enhancements change
  useEffect(() => {
    if (loadState._tag !== "Loaded") return

    let lyricsToLoad = enhancements.enhancement
      ? applyEnhancement(loadState.lyrics, enhancements.enhancement)
      : loadState.lyrics

    if (!isEditMode && editPayload) {
      lyricsToLoad = applyEditPatches(lyricsToLoad, editPayload)
    }

    load(lyricsToLoad)
  }, [loadState, enhancements.enhancement, load, isEditMode, editPayload])

  // Mark song as played when playback starts
  const hasMarkedAsPlayed = useRef(false)
  useEffect(() => {
    if (hasMarkedAsPlayed.current) return
    if (playerState._tag === "Playing") {
      recentSongsStore.markAsPlayed(lrclibId)
      hasMarkedAsPlayed.current = true
    }
  }, [lrclibId, playerState._tag])

  // Preload audio components when song loads
  const hasPreloaded = useRef(false)
  useEffect(() => {
    if (loadState._tag !== "Loaded" || hasPreloaded.current) return
    hasPreloaded.current = true
    voiceActivityStore.checkPermission()
    soundSystem.initialize()
  }, [loadState._tag])

  // Fetch enhancements lazily (deferred from initial load)
  const hasFetchedEnhancements = useRef(false)
  useEffect(() => {
    if (loadState._tag !== "Loaded" || hasFetchedEnhancements.current) return
    if (!loadState.hasEnhancement && !loadState.hasChordEnhancement) return

    // Skip fetching if enhancements already loaded from cache
    if (enhancements.enhancement !== null || enhancements.chordEnhancement !== null) {
      hasFetchedEnhancements.current = true
      return
    }

    hasFetchedEnhancements.current = true
    setEnhancements(prev => ({ ...prev, loading: true }))

    // Use actual lrclib ID from lyrics (may differ from URL if redirected)
    const actualLrclibId = loadState.lyrics.songId.startsWith("lrclib-")
      ? Number.parseInt(loadState.lyrics.songId.slice(7), 10)
      : lrclibId

    fetch(`/api/lyrics/${actualLrclibId}/enhancements`)
      .then(res => res.json())
      .then(data => {
        setEnhancements({
          loading: false,
          enhancement: data.enhancement ?? null,
          chordEnhancement: data.chordEnhancement ?? null,
        })
      })
      .catch(() => {
        setEnhancements(prev => ({ ...prev, loading: false }))
      })
  }, [loadState, lrclibId])

  // Load song edits on page load
  const hasLoadedEdits = useRef(false)
  useEffect(() => {
    if (loadState._tag !== "Loaded" || hasLoadedEdits.current) return
    hasLoadedEdits.current = true
    songEditsStore.loadEdits(lrclibId, loadState.lrcHash)
  }, [loadState, lrclibId])

  // Auto-enter edit mode if ?edit=1 query param is present
  const hasAutoEnteredEditMode = useRef(false)
  useEffect(() => {
    if (
      !shouldEnterEditMode ||
      loadState._tag !== "Loaded" ||
      hasAutoEnteredEditMode.current ||
      isEditMode
    ) {
      return
    }
    hasAutoEnteredEditMode.current = true
    const timer = setTimeout(() => {
      songEditsStore.enterEditMode()
    }, 100)
    return () => clearTimeout(timer)
  }, [shouldEnterEditMode, loadState, isEditMode])

  useEffect(() => {
    if (!showChords) {
      chordPanelWasOpen.current = showChordPanel
      setShowChordPanel(false)
    } else {
      setShowChordPanel(chordPanelWasOpen.current)
    }
  }, [showChords, showChordPanel])

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

  if (loadState._tag === "Loading") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <AmbientBackground variant="subtle" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
        >
          <SpinnerGap size={48} style={{ color: "var(--color-accent)" }} />
        </motion.div>
        <p style={{ color: "var(--color-text3)" }}>Loading lyrics...</p>
      </div>
    )
  }

  if (loadState._tag === "Error") {
    const { title, description } = errorMessages[loadState.errorType]
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-4"
        style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <AmbientBackground variant="subtle" />
        <h1 className="text-2xl font-bold">{title}</h1>
        <p style={{ color: "var(--color-text3)" }}>{description}</p>
        <Link
          href="/"
          className="px-6 py-3 rounded-full font-medium transition-colors"
          style={{ background: "var(--color-accent)", color: "white" }}
        >
          Back to Search
        </Link>
        {(loadState.errorType === "not-found" || loadState.errorType === "invalid-lyrics") && (
          <>
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className="px-6 py-3 rounded-full font-medium transition-colors flex items-center justify-center gap-2"
              style={{
                background: "var(--color-warning-soft)",
                color: "var(--color-warning)",
              }}
            >
              <Bug size={20} />
              Report this issue
            </button>
            <ReportIssueModal
              isOpen={showReportModal}
              onClose={() => setShowReportModal(false)}
              songContext={{
                title: trackSlugWithId?.split("-").slice(0, -1).join(" ") ?? "Unknown",
                artist: artistSlug?.replace(/-/g, " ") ?? "Unknown",
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
    <div
      ref={doubleTapRef}
      className="h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <AmbientBackground variant="subtle" />
      <header
        className="fixed top-0 left-0 right-0 z-20 backdrop-blur-lg"
        style={{
          background: "var(--color-header-bg)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link
            href="/"
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors hover:brightness-110"
            style={{ background: "var(--color-surface2)" }}
            aria-label="Back to search"
          >
            <ArrowLeft size={20} />
          </Link>
          {loadState.albumArt ? (
            <img
              src={loadState.albumArt}
              alt=""
              className="w-10 h-10 shrink-0 object-cover"
              style={{ borderRadius: "8px" }}
            />
          ) : (
            <div
              className="w-10 h-10 shrink-0 flex items-center justify-center"
              style={{ background: "var(--color-surface2)", borderRadius: "8px" }}
            >
              <MusicNote size={20} weight="fill" style={{ color: "var(--color-text-muted)" }} />
            </div>
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{songTitle}</span>
            <span className="text-xs truncate" style={{ color: "var(--color-text3)" }}>
              {songArtist}
            </span>
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
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:brightness-110"
                  style={{ background: "var(--color-accent)", color: "white" }}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:brightness-110"
                  style={{ background: "var(--color-surface2)" }}
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
        <AnimatePresence initial={false}>
          {(!isLoaded || isHeaderVisible) && (
            <motion.div
              className="sticky top-16 z-30 backdrop-blur"
              style={{ background: "var(--color-header-bg)" }}
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
                onInfoClick={() => setShowInfo(true)}
                onEditClick={handleEnterEditMode}
                hasIssue={loadState.bpm === null || chordsState.status === "error"}
                onWarningClick={() => setShowReportModal(true)}
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

        {isEditMode && loadState._tag === "Loaded" ? (
          <EditModeProvider>
            <div className="flex-1 flex flex-col overflow-hidden">
              <EditToolbar
                allLineIds={loadState.lyrics.lines.map(l => l.id)}
                onExitEditMode={handleExitEditMode}
              />
              <div className="flex-1 overflow-y-auto">
                <EditableLyricsDisplay lines={loadState.lyrics.lines} className="pb-12 px-4" />
              </div>
            </div>
          </EditModeProvider>
        ) : preferences.displayMode === "scorebook" ? (
          <ScoreBookDisplay
            className="flex-1 pb-12"
            chordEnhancement={loadState._tag === "Loaded" ? enhancements.chordEnhancement : null}
          />
        ) : (
          <LyricsDisplay
            className="flex-1 pb-12"
            chordEnhancement={loadState._tag === "Loaded" ? enhancements.chordEnhancement : null}
            onCreateCard={handleCreateCard}
          />
        )}

        {!isEditMode && <FloatingMetronome bpm={currentBpm} position="bottom-right" />}
        {!isEditMode && <SingingDebugIndicator />}
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
          hasEnhancedTiming={enhancements.enhancement !== null}
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
            hasEnhancedTiming: enhancements.enhancement !== null,
          }}
        />
      )}

      {loadState._tag === "Loaded" && (
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
        <ShareExperience
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false)
            setShareInitialIds([])
          }}
          title={loadState.lyrics.title}
          artist={loadState.lyrics.artist}
          albumArt={loadState.albumArt}
          albumArtLarge={loadState.albumArtLarge}
          spotifyId={loadState.spotifyId}
          lines={loadState.lyrics.lines}
          initialSelectedIds={shareInitialIds}
        />
      )}
    </div>
  )
}
