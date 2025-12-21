"use client"

import { useIsAuthenticated, useIsQuotaAvailable } from "@/core"
import { useSpeechControls, useSpeechState } from "@/core/SpeechRecognitionStore"
import { useEffect, useRef, useState } from "react"

export function useVoiceSearch() {
  const speechState = useSpeechState()
  const { start, stop, checkQuota, clearTranscript, clearError } = useSpeechControls()
  const isAuthenticated = useIsAuthenticated()
  const isQuotaAvailable = useIsQuotaAvailable()
  const hasPrefetchedQuotaRef = useRef(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const wasRecordingRef = useRef(false)
  const receivedFinalTranscriptRef = useRef(false)

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
    // Only reset receivedFinalTranscriptRef when recording STARTS (not on every render while recording)
    if (speechState.isRecording && !wasRecordingRef.current) {
      // Recording just started - reset state
      wasRecordingRef.current = true
      receivedFinalTranscriptRef.current = false
      setIsProcessing(false)
    } else if (!speechState.isRecording && wasRecordingRef.current && !receivedFinalTranscriptRef.current) {
      // Recording just stopped and we haven't received a final transcript yet
      setIsProcessing(true)
    }

    // Track when we receive a final transcript (even if it gets cleared later)
    if (speechState.finalTranscript) {
      receivedFinalTranscriptRef.current = true
    }

    // Clear processing on any of: final transcript received, error message, or error code
    if (receivedFinalTranscriptRef.current || speechState.errorMessage || speechState.errorCode) {
      setIsProcessing(false)
    }

    // Reset refs when recording stops
    if (!speechState.isRecording) {
      wasRecordingRef.current = false
    }
  }, [
    speechState.isRecording,
    speechState.finalTranscript,
    speechState.errorMessage,
    speechState.errorCode,
  ])

  // Safety timeout: clear processing state after 10 seconds max
  useEffect(() => {
    if (!isProcessing) return

    const timeoutId = setTimeout(() => {
      setIsProcessing(false)
      wasRecordingRef.current = false
    }, 10000)

    return () => clearTimeout(timeoutId)
  }, [isProcessing])

  // Determine if speech is being detected (has partial transcript)
  const isSpeechDetected = speechState.isRecording && speechState.partialTranscript.length > 0

  // Don't show recording state after we've received a final transcript
  // (there's a brief delay before isRecording becomes false)
  const isActivelyRecording = speechState.isRecording && !receivedFinalTranscriptRef.current

  return {
    // State
    isRecording: isActivelyRecording,
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
    clearError,
  }
}
