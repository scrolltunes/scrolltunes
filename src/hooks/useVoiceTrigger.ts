"use client"

import { activationController, useActivationState } from "@/audio/activation"
import {
  lyricsPlayer,
  usePlayerState,
  usePreference,
  useVoiceActivity,
  voiceActivityStore,
} from "@/core"
import { useCallback, useEffect, useRef } from "react"

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
 * Hook that connects voice/singing detection to lyrics playback
 *
 * Supports two activation modes (configured in Settings):
 * - VAD + Energy: Uses Silero VAD with energy gating (existing behavior)
 * - Singing Detection: Uses MediaPipe YAMNet to detect singing specifically
 *
 * When voice/singing is detected:
 * - If player is Ready and autoPlay is true, starts playback
 * - If player is Paused and resumeOnVoice is true, resumes playback
 *
 * When silence is detected:
 * - If pauseOnSilenceMs > 0, pauses after that duration of silence
 */
export function useVoiceTrigger(options: UseVoiceTriggerOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const playerState = usePlayerState()
  const activationMode = usePreference("activationMode")

  // Use the appropriate detection system based on activation mode
  const voiceState = useVoiceActivity() // VAD + Energy
  const activationState = useActivationState() // Singing Detection

  // Determine which state to use based on mode
  const isListening =
    activationMode === "singing" ? activationState.isListening : voiceState.isListening
  const isSpeaking =
    activationMode === "singing" ? activationState.isSinging : voiceState.isSpeaking
  const level = activationMode === "singing" ? activationState.level : voiceState.level

  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wasPlayingBeforeSilence = useRef(false)

  // Start listening with the appropriate system
  const startListening = useCallback(async () => {
    if (activationMode === "singing") {
      await activationController.startListening()
    } else {
      await voiceActivityStore.startListening()
    }
  }, [activationMode])

  // Stop listening with the appropriate system
  const stopListening = useCallback(() => {
    if (activationMode === "singing") {
      activationController.stopListening()
    } else {
      voiceActivityStore.stopListening()
    }
  }, [activationMode])

  // Stop listening when entering Playing state
  useEffect(() => {
    if (playerState._tag === "Playing" && isListening) {
      stopListening()
    }
  }, [playerState._tag, isListening, stopListening])

  // Handle voice start
  useEffect(() => {
    if (!isSpeaking) return

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
  }, [isSpeaking, playerState._tag, opts.autoPlay, opts.resumeOnVoice])

  // Handle voice stop (silence)
  useEffect(() => {
    if (isSpeaking) {
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
  }, [isSpeaking, playerState._tag, opts.pauseOnSilenceMs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
    }
  }, [])

  return {
    isListening,
    isSpeaking,
    level,
    startListening,
    stopListening,
  }
}
