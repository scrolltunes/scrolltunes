"use client"

import { useIsAuthenticated, useIsQuotaAvailable } from "@/core"
import { useSpeechControls, useSpeechState } from "@/core/SpeechRecognitionStore"
import { useEffect, useRef, useState } from "react"

export function useVoiceSearch() {
  const speechState = useSpeechState()
  const { start, stop, checkQuota, clearTranscript } = useSpeechControls()
  const isAuthenticated = useIsAuthenticated()
  const isQuotaAvailable = useIsQuotaAvailable()
  const hasPrefetchedQuotaRef = useRef(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const wasRecordingRef = useRef(false)

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

  // Track processing state: after recording stops, before final transcript arrives
  useEffect(() => {
    if (speechState.isRecording) {
      wasRecordingRef.current = true
      setIsProcessing(false)
    } else if (wasRecordingRef.current && !speechState.finalTranscript) {
      // Recording just stopped, waiting for results
      setIsProcessing(true)
    }

    if (speechState.finalTranscript || speechState.errorMessage) {
      // Got results or error, done processing
      setIsProcessing(false)
      wasRecordingRef.current = false
    }
  }, [speechState.isRecording, speechState.finalTranscript, speechState.errorMessage])

  // Determine if speech is being detected (has partial transcript)
  const isSpeechDetected = speechState.isRecording && speechState.partialTranscript.length > 0

  return {
    // State
    isRecording: speechState.isRecording,
    isConnecting: speechState.isConnecting,
    isProcessing,
    isSpeechDetected,
    partialTranscript: speechState.partialTranscript,
    finalTranscript: speechState.finalTranscript,
    detectedLanguageCode: speechState.detectedLanguageCode,
    error: speechState.errorMessage,
    errorCode: speechState.errorCode,
    isQuotaAvailable,

    // Controls
    start,
    stop,
    checkQuota,
    clearTranscript,
  }
}
