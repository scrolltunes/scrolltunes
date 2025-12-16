"use client"

import { useIsQuotaAvailable } from "@/core"
import { useSpeechControls, useSpeechState } from "@/core/SpeechRecognitionStore"

export function useVoiceSearch() {
  const speechState = useSpeechState()
  const { start, stop, checkQuota, clearTranscript } = useSpeechControls()
  const isQuotaAvailable = useIsQuotaAvailable()

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

    // Controls
    start,
    stop,
    checkQuota,
    clearTranscript,
  }
}
