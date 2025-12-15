"use client"

import { lyricsPlayer, usePlayerState, useVoiceActivity, voiceActivityStore } from "@/core"
import { useEffect, useRef } from "react"

export interface UseVoiceTriggerOptions {
  /** Auto-start playback when voice is first detected */
  readonly autoPlay?: boolean
  /** Resume from pause when voice is detected */
  readonly resumeOnVoice?: boolean
  /** Pause after silence for this duration (ms). Set to 0 to disable. */
  readonly pauseOnSilenceMs?: number
}

const DEFAULT_OPTIONS: UseVoiceTriggerOptions = {
  autoPlay: true,
  resumeOnVoice: true,
  pauseOnSilenceMs: 0, // Disabled by default
}

/**
 * Hook that connects voice activity detection to lyrics playback
 *
 * When voice is detected:
 * - If player is Ready and autoPlay is true, starts playback
 * - If player is Paused and resumeOnVoice is true, resumes playback
 *
 * When silence is detected:
 * - If pauseOnSilenceMs > 0, pauses after that duration of silence
 */
export function useVoiceTrigger(options: UseVoiceTriggerOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const playerState = usePlayerState()
  const voiceState = useVoiceActivity()

  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wasPlayingBeforeSilence = useRef(false)

  // Handle voice start
  useEffect(() => {
    if (!voiceState.isSpeaking) return

    // Clear any pending silence timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }

    // Auto-play from Ready state
    if (playerState._tag === "Ready" && opts.autoPlay) {
      lyricsPlayer.play()
      return
    }

    // Resume from Paused state
    if (playerState._tag === "Paused" && opts.resumeOnVoice) {
      lyricsPlayer.play()
      return
    }
  }, [voiceState.isSpeaking, playerState._tag, opts.autoPlay, opts.resumeOnVoice])

  // Handle voice stop (silence)
  useEffect(() => {
    if (voiceState.isSpeaking) {
      // Track if we were playing when voice was active
      wasPlayingBeforeSilence.current = playerState._tag === "Playing"
      return
    }

    // Voice stopped - check if we should pause after silence
    if (opts.pauseOnSilenceMs && opts.pauseOnSilenceMs > 0 && playerState._tag === "Playing") {
      silenceTimeoutRef.current = setTimeout(() => {
        if (lyricsPlayer.getSnapshot()._tag === "Playing") {
          lyricsPlayer.pause()
        }
      }, opts.pauseOnSilenceMs)
    }

    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
    }
  }, [voiceState.isSpeaking, playerState._tag, opts.pauseOnSilenceMs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
    }
  }, [])

  return {
    isListening: voiceState.isListening,
    isSpeaking: voiceState.isSpeaking,
    level: voiceState.level,
    startListening: () => voiceActivityStore.startListening(),
    stopListening: () => voiceActivityStore.stopListening(),
  }
}
