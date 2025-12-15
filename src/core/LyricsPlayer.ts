"use client"

import { DEFAULT_SCROLL_SPEED, MAX_SCROLL_SPEED, MIN_SCROLL_SPEED } from "@/constants"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"

// --- Types ---

/**
 * A single line of lyrics with timing information
 */
export interface LyricLine {
  readonly id: string
  readonly text: string
  readonly startTime: number // in seconds
  readonly endTime: number // in seconds
  readonly words?: readonly LyricWord[]
}

/**
 * Word-level timing (optional, for karaoke mode)
 */
export interface LyricWord {
  readonly text: string
  readonly startTime: number
  readonly endTime: number
}

/**
 * Full lyrics data for a song
 */
export interface Lyrics {
  readonly songId: string
  readonly title: string
  readonly artist: string
  readonly lines: readonly LyricLine[]
  readonly duration: number // total duration in seconds
}

/**
 * Player state type using tagged union pattern (Effect.ts style)
 */
export type PlayerState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Ready"; readonly lyrics: Lyrics }
  | { readonly _tag: "Playing"; readonly lyrics: Lyrics; readonly currentTime: number }
  | { readonly _tag: "Paused"; readonly lyrics: Lyrics; readonly currentTime: number }
  | { readonly _tag: "Completed"; readonly lyrics: Lyrics }

/**
 * Player events for state transitions.
 *
 * Uses Effect.ts Data.TaggedClass for type-safe event discrimination.
 * Events are processed by dispatch() which returns Effect.Effect<void>.
 */
export class LoadLyrics extends Data.TaggedClass("LoadLyrics")<{
  readonly lyrics: Lyrics
}> {}

export class Play extends Data.TaggedClass("Play")<object> {}
export class Pause extends Data.TaggedClass("Pause")<object> {}
export class Seek extends Data.TaggedClass("Seek")<{ readonly time: number }> {}
export class Reset extends Data.TaggedClass("Reset")<object> {}
export class Tick extends Data.TaggedClass("Tick")<{ readonly time: number }> {}

export type PlayerEvent = LoadLyrics | Play | Pause | Seek | Reset | Tick

// --- LyricsPlayer Class ---

/**
 * LyricsPlayer - Manages lyrics scrolling state
 *
 * Uses Effect.ts patterns with useSyncExternalStore for React integration.
 * Reference: kitlangton/visual-effect VisualEffect.ts
 */
export class LyricsPlayer {
  private listeners = new Set<() => void>()
  private state: PlayerState = { _tag: "Idle" }
  private scrollSpeed = DEFAULT_SCROLL_SPEED
  private animationFrameId: number | null = null

  constructor(private now: () => number = () => performance.now() / 1000) {}

  // --- Observable pattern (for useSyncExternalStore) ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): PlayerState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  // --- State management ---

  private setState(newState: PlayerState): void {
    this.state = newState
    this.notify()
  }

  /**
   * Get current line index based on time
   */
  getCurrentLineIndex(): number {
    if (this.state._tag !== "Playing" && this.state._tag !== "Paused") {
      return 0
    }
    const { lyrics, currentTime } = this.state
    for (let i = lyrics.lines.length - 1; i >= 0; i--) {
      const line = lyrics.lines[i]
      if (line && currentTime >= line.startTime) {
        return i
      }
    }
    return 0
  }

  /**
   * Get current lyrics if loaded
   */
  getLyrics(): Lyrics | null {
    switch (this.state._tag) {
      case "Idle":
        return null
      case "Ready":
      case "Playing":
      case "Paused":
      case "Completed":
        return this.state.lyrics
    }
  }

  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    if (this.state._tag === "Playing" || this.state._tag === "Paused") {
      return this.state.currentTime
    }
    return 0
  }

  /**
   * Set scroll speed multiplier
   */
  setScrollSpeed(speed: number): void {
    this.scrollSpeed = Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, speed))
  }

  getScrollSpeed(): number {
    return this.scrollSpeed
  }

  // --- Event handlers ---

  /**
   * Process a player event using Effect-style command pattern.
   *
   * Returns Effect.Effect<void> for composability, though state updates are
   * synchronous. Convenience methods use Effect.runSync since there's no I/O.
   */
  readonly dispatch = (event: PlayerEvent): Effect.Effect<void> => {
    return Effect.sync(() => {
      switch (event._tag) {
        case "LoadLyrics":
          this.handleLoadLyrics(event.lyrics)
          break
        case "Play":
          this.handlePlay()
          break
        case "Pause":
          this.handlePause()
          break
        case "Seek":
          this.handleSeek(event.time)
          break
        case "Reset":
          this.handleReset()
          break
        case "Tick":
          this.handleTick(event.time)
          break
      }
    })
  }

  private handleLoadLyrics(lyrics: Lyrics): void {
    this.stopPlaybackLoop()
    this.setState({ _tag: "Ready", lyrics })
  }

  private handlePlay(): void {
    if (this.state._tag === "Ready") {
      this.setState({ _tag: "Playing", lyrics: this.state.lyrics, currentTime: 0 })
      this.startPlaybackLoop()
    } else if (this.state._tag === "Paused") {
      this.setState({
        _tag: "Playing",
        lyrics: this.state.lyrics,
        currentTime: this.state.currentTime,
      })
      this.startPlaybackLoop()
    } else if (this.state._tag === "Completed") {
      this.setState({ _tag: "Playing", lyrics: this.state.lyrics, currentTime: 0 })
      this.startPlaybackLoop()
    }
  }

  private handlePause(): void {
    if (this.state._tag === "Playing") {
      this.stopPlaybackLoop()
      this.setState({
        _tag: "Paused",
        lyrics: this.state.lyrics,
        currentTime: this.state.currentTime,
      })
    }
  }

  private handleSeek(time: number): void {
    if (this.state._tag === "Playing") {
      this.setState({ _tag: "Playing", lyrics: this.state.lyrics, currentTime: time })
    } else if (this.state._tag === "Paused") {
      this.setState({ _tag: "Paused", lyrics: this.state.lyrics, currentTime: time })
    } else if (this.state._tag === "Ready") {
      this.setState({ _tag: "Paused", lyrics: this.state.lyrics, currentTime: time })
    }
  }

  private handleReset(): void {
    this.stopPlaybackLoop()
    const lyrics = this.getLyrics()
    if (this.state._tag !== "Idle" && lyrics) {
      this.setState({ _tag: "Ready", lyrics })
    }
  }

  private handleTick(deltaTime: number): void {
    if (this.state._tag !== "Playing") return

    const oldLineIndex = this.getCurrentLineIndex()
    const newTime = this.state.currentTime + deltaTime * this.scrollSpeed

    if (newTime >= this.state.lyrics.duration) {
      this.stopPlaybackLoop()
      this.setState({ _tag: "Completed", lyrics: this.state.lyrics })
      return
    }

    this.state = { _tag: "Playing", lyrics: this.state.lyrics, currentTime: newTime }

    const newLineIndex = this.getCurrentLineIndex()
    if (newLineIndex !== oldLineIndex) {
      this.notify()
    }
  }

  // --- Playback loop ---

  private lastTickTime: number | null = null

  private startPlaybackLoop(): void {
    if (this.animationFrameId !== null) return

    this.lastTickTime = this.now()

    const tick = () => {
      const currentTime = this.now()
      const deltaTime = this.lastTickTime !== null ? currentTime - this.lastTickTime : 0
      this.lastTickTime = currentTime

      // Only tick if delta is reasonable (avoid huge jumps after tab switch)
      if (deltaTime > 0 && deltaTime < 0.5) {
        Effect.runSync(this.dispatch(new Tick({ time: deltaTime })))
      }

      if (this.state._tag === "Playing") {
        this.animationFrameId = requestAnimationFrame(tick)
      }
    }

    this.animationFrameId = requestAnimationFrame(tick)
  }

  private stopPlaybackLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    this.lastTickTime = null
  }

  // --- Convenience methods ---
  // These sync wrappers use Effect.runSync at the React boundary.
  // Safe because all state updates are synchronous (no I/O).

  /**
   * Load lyrics and optionally auto-play
   */
  load(lyrics: Lyrics, autoPlay = false): void {
    Effect.runSync(this.dispatch(new LoadLyrics({ lyrics })))
    if (autoPlay) {
      Effect.runSync(this.dispatch(new Play({})))
    }
  }

  play(): void {
    Effect.runSync(this.dispatch(new Play({})))
  }

  pause(): void {
    Effect.runSync(this.dispatch(new Pause({})))
  }

  seek(time: number): void {
    Effect.runSync(this.dispatch(new Seek({ time })))
  }

  reset(): void {
    Effect.runSync(this.dispatch(new Reset({})))
  }

  /**
   * Unload lyrics and return to Idle state
   */
  unload(): void {
    this.stopPlaybackLoop()
    this.setState({ _tag: "Idle" })
  }

  /**
   * Jump to a specific line
   */
  jumpToLine(lineIndex: number): void {
    const lyrics = this.getLyrics()
    if (lyrics && lineIndex >= 0 && lineIndex < lyrics.lines.length) {
      const line = lyrics.lines[lineIndex]
      if (line) {
        this.seek(line.startTime)
      }
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopPlaybackLoop()
    this.listeners.clear()
    this.setState({ _tag: "Idle" })
  }

  /**
   * Hard reset for tests and hot-reload
   * Unlike reset(), this clears all state including listeners
   */
  hardReset(): void {
    this.stopPlaybackLoop()
    this.listeners.clear()
    this.state = { _tag: "Idle" }
    this.scrollSpeed = DEFAULT_SCROLL_SPEED
    this.animationFrameId = null
    this.lastTickTime = null
  }
}

// --- Singleton instance ---

export const lyricsPlayer = new LyricsPlayer()

// --- React hooks ---

/**
 * Hook to subscribe to player state
 */
export function usePlayerState(): PlayerState {
  return useSyncExternalStore(
    lyricsPlayer.subscribe,
    lyricsPlayer.getSnapshot,
    lyricsPlayer.getSnapshot, // SSR fallback
  )
}

/**
 * Hook to get current line index
 */
export function useCurrentLineIndex(): number {
  usePlayerState()
  return lyricsPlayer.getCurrentLineIndex()
}

/**
 * Hook to get player controls
 */
export function usePlayerControls() {
  return {
    play: () => lyricsPlayer.play(),
    pause: () => lyricsPlayer.pause(),
    seek: (time: number) => lyricsPlayer.seek(time),
    reset: () => lyricsPlayer.reset(),
    unload: () => lyricsPlayer.unload(),
    jumpToLine: (index: number) => lyricsPlayer.jumpToLine(index),
    load: (lyrics: Lyrics, autoPlay?: boolean) => lyricsPlayer.load(lyrics, autoPlay),
    setScrollSpeed: (speed: number) => lyricsPlayer.setScrollSpeed(speed),
    getScrollSpeed: () => lyricsPlayer.getScrollSpeed(),
  }
}
