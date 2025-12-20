"use client"

import { useIsAuthenticated, useIsQuotaAvailable, useVoiceSearchVADState } from "@/core"
import { useSpeechControls, useSpeechState } from "@/core/SpeechRecognitionStore"
import { useEffect, useRef } from "react"

export function useVoiceSearch() {
  const speechState = useSpeechState()
  const vadState = useVoiceSearchVADState()
  const { start, stop, checkQuota, clearTranscript } = useSpeechControls()
  const isAuthenticated = useIsAuthenticated()
  const isQuotaAvailable = useIsQuotaAvailable()
  const hasPrefetchedQuotaRef = useRef(false)

  // Prefetch quota asynchronously to avoid first-start latency
  useEffect(() => {
    if (!isAuthenticated) {
      hasPrefetchedQuotaRef.current = false
      return
    }
    if (hasPrefetchedQuotaRef.current) return
    hasPrefetchedQuotaRef.current = true
    void checkQuota()
  }, [checkQuota, isAuthenticated])

  return {
    // State
    isRecording: speechState.isRecording,
    isConnecting: speechState.isConnecting,
    partialTranscript: speechState.partialTranscript,
    finalTranscript: speechState.finalTranscript,
    detectedLanguageCode: speechState.detectedLanguageCode,
    error: speechState.errorMessage,
    errorCode: speechState.errorCode,
    isQuotaAvailable,
    voiceLevel: vadState.level,
    isSpeaking: vadState.isSpeaking,

    // Controls
    start,
    stop,
    checkQuota,
    clearTranscript,
  }
}
