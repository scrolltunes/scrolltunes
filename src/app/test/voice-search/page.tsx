"use client"

import { UserMenu } from "@/components/auth/UserMenu"
import { BackButton } from "@/components/ui"
import {
  useAccount,
  useIsWebSpeechAvailable,
  useSpeechControls,
  useSpeechState,
  useSpeechTier,
} from "@/core"
import { Detective, Globe, GoogleLogo, Microphone, Stop, Warning } from "@phosphor-icons/react"
import { memo, useCallback, useEffect, useState } from "react"

// Mobile detection pattern (same as SpeechRecognitionStore)
const MOBILE_UA_REGEX = /Android|iPhone|iPad|iPod/i

interface BraveDetectionInfo {
  readonly isMobile: boolean
  readonly hasBraveApi: boolean
  readonly isBrave: boolean
  readonly isBraveDesktop: boolean
  readonly userAgent: string
}

async function detectBraveInfo(): Promise<BraveDetectionInfo> {
  const userAgent = navigator.userAgent
  const isMobile = MOBILE_UA_REGEX.test(userAgent)

  const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }
  const hasBraveApi = !!nav.brave?.isBrave

  let isBrave = false
  if (hasBraveApi) {
    try {
      isBrave = (await nav.brave?.isBrave?.()) ?? false
    } catch {
      // Ignore errors
    }
  }

  return {
    isMobile,
    hasBraveApi,
    isBrave,
    isBraveDesktop: isBrave && !isMobile,
    userAgent,
  }
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${
        active ? "bg-green-500/20 text-green-400" : "bg-neutral-700 text-neutral-400"
      }`}
    >
      {label}
    </span>
  )
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null
  const colors =
    tier === "google_stt"
      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
      : "bg-amber-500/20 text-amber-400 border-amber-500/30"
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${colors}`}>
      {tier === "google_stt" ? "Google Cloud STT" : "Web Speech API"}
    </span>
  )
}

interface DirectTestResult {
  readonly transcript: string | null
  readonly error: string | null
  readonly isLoading: boolean
  readonly languageCode?: string | null
}

function GoogleSTTDirectTester() {
  const [state, setState] = useState<DirectTestResult>({
    transcript: null,
    error: null,
    isLoading: false,
  })
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [audioChunks, setAudioChunks] = useState<Blob[]>([])

  const handleStart = useCallback(async () => {
    setState({ transcript: null, error: null, isLoading: false })
    setAudioChunks([])

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      })

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      })

      const chunks: Blob[] = []
      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunks.push(event.data)
          setAudioChunks([...chunks])
        }
      }

      recorder.onstop = async () => {
        for (const track of stream.getTracks()) {
          track.stop()
        }

        if (chunks.length === 0) {
          setState({ transcript: null, error: "No audio recorded", isLoading: false })
          return
        }

        setState(prev => ({ ...prev, isLoading: true }))

        const audioBlob = new Blob(chunks, { type: recorder.mimeType })
        const base64Audio = await new Promise<string>(resolve => {
          const reader = new FileReader()
          reader.onloadend = () => {
            const dataUrl = reader.result as string
            const base64 = dataUrl.split(",")[1] ?? ""
            resolve(base64)
          }
          reader.readAsDataURL(audioBlob)
        })

        try {
          const response = await fetch("/api/voice-search/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64Audio }),
          })

          if (!response.ok) {
            const errorData = (await response.json()) as { error?: string; code?: string }
            setState({
              transcript: null,
              error: `[${errorData.code ?? response.status}] ${errorData.error ?? "Transcription failed"}`,
              isLoading: false,
            })
            return
          }

          const data = (await response.json()) as { transcript?: string; languageCode?: string }
          setState({
            transcript: data.transcript ?? null,
            error: data.transcript ? null : "No transcript returned",
            isLoading: false,
            languageCode: data.languageCode ?? null,
          })
        } catch (e) {
          setState({
            transcript: null,
            error: `Network error: ${String(e)}`,
            isLoading: false,
          })
        }
      }

      setMediaRecorder(recorder)
      recorder.start()
      setIsRecording(true)
    } catch (e) {
      setState({
        transcript: null,
        error: `Microphone access failed: ${String(e)}`,
        isLoading: false,
      })
    }
  }, [])

  const handleStop = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop()
    }
    setMediaRecorder(null)
    setIsRecording(false)
  }, [mediaRecorder])

  return (
    <section className="p-4 bg-neutral-900 rounded-xl space-y-4 border border-blue-500/30">
      <div className="flex items-center gap-3">
        <GoogleLogo size={24} weight="bold" className="text-blue-400" />
        <h2 className="text-sm font-medium text-blue-400 uppercase tracking-wider">
          Google Cloud STT (Direct Test)
        </h2>
      </div>
      <p className="text-xs text-neutral-500">
        Bypasses tier selection. Sends audio directly to /api/voice-search/transcribe
      </p>

      <div className="flex flex-wrap gap-3">
        {!isRecording ? (
          <button
            type="button"
            onClick={handleStart}
            disabled={state.isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 rounded-lg transition-colors"
          >
            {state.isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Microphone size={20} />
            )}
            <span>{state.isLoading ? "Transcribing..." : "Record & Transcribe"}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
          >
            <Stop size={20} />
            <span>Stop Recording</span>
          </button>
        )}
      </div>

      {isRecording && (
        <div className="text-sm text-green-400">Recording... ({audioChunks.length} chunks)</div>
      )}

      {state.transcript && (
        <div className="space-y-1">
          <span className="text-neutral-500 text-xs">Transcript:</span>
          <p className="text-white font-mono text-sm bg-neutral-800 rounded px-2 py-1">
            {state.transcript}
          </p>
          {state.languageCode && (
            <span className="text-neutral-500 text-xs">Language: {state.languageCode}</span>
          )}
        </div>
      )}

      {state.error && (
        <div className="p-2 bg-red-900/20 border border-red-500/30 rounded text-red-300 text-sm">
          {state.error}
        </div>
      )}
    </section>
  )
}

function WebSpeechDirectTester() {
  const [state, setState] = useState<DirectTestResult>({
    transcript: null,
    error: null,
    isLoading: false,
  })
  const [isRecording, setIsRecording] = useState(false)
  const [partialTranscript, setPartialTranscript] = useState("")

  const isSupported =
    typeof window !== "undefined" && !!(window.SpeechRecognition ?? window.webkitSpeechRecognition)

  const handleStart = useCallback(() => {
    setState({ transcript: null, error: null, isLoading: false })
    setPartialTranscript("")

    const SpeechRecognitionClass = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      setState({
        transcript: null,
        error: "Web Speech API not supported in this browser",
        isLoading: false,
      })
      return
    }

    const recognition = new SpeechRecognitionClass()
    recognition.lang = "en-US"
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsRecording(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1]
      if (result) {
        const alternative = result[0]
        if (alternative) {
          if (result.isFinal) {
            setState({
              transcript: alternative.transcript,
              error: null,
              isLoading: false,
            })
            setPartialTranscript("")
          } else {
            setPartialTranscript(alternative.transcript)
          }
        }
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setState({
          transcript: null,
          error: `[${event.error}] ${event.message || "Recognition error"}`,
          isLoading: false,
        })
      }
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognition.start()
  }, [])

  const handleStop = useCallback(() => {
    setIsRecording(false)
  }, [])

  return (
    <section className="p-4 bg-neutral-900 rounded-xl space-y-4 border border-amber-500/30">
      <div className="flex items-center gap-3">
        <Globe size={24} weight="bold" className="text-amber-400" />
        <h2 className="text-sm font-medium text-amber-400 uppercase tracking-wider">
          Web Speech API (Direct Test)
        </h2>
      </div>
      <p className="text-xs text-neutral-500">
        Bypasses tier selection. Uses browser&apos;s native SpeechRecognition API directly
      </p>

      <div className="flex items-center gap-4">
        <StatusBadge active={isSupported} label="Supported" />
      </div>

      {!isSupported ? (
        <div className="p-2 bg-amber-900/20 border border-amber-500/30 rounded text-amber-300 text-sm">
          Web Speech API is not supported in this browser. Try Chrome, Edge, or Safari.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {!isRecording ? (
              <button
                type="button"
                onClick={handleStart}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors"
              >
                <Microphone size={20} />
                <span>Start Recognition</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                <Stop size={20} />
                <span>Stop</span>
              </button>
            )}
          </div>

          {isRecording && <div className="text-sm text-green-400">Listening...</div>}

          {partialTranscript && (
            <div className="space-y-1">
              <span className="text-neutral-500 text-xs">Partial:</span>
              <p className="text-neutral-300 font-mono text-sm bg-neutral-800 rounded px-2 py-1 italic">
                {partialTranscript}
              </p>
            </div>
          )}

          {state.transcript && (
            <div className="space-y-1">
              <span className="text-neutral-500 text-xs">Final Transcript:</span>
              <p className="text-white font-mono text-sm bg-neutral-800 rounded px-2 py-1">
                {state.transcript}
              </p>
            </div>
          )}

          {state.error && (
            <div className="p-2 bg-red-900/20 border border-red-500/30 rounded text-red-300 text-sm">
              {state.error}
            </div>
          )}
        </>
      )}
    </section>
  )
}

const VoiceSearchTester = memo(function VoiceSearchTester() {
  const speechState = useSpeechState()
  const { start, stop, clearError, clearTranscript, reset } = useSpeechControls()
  const tier = useSpeechTier()
  const isWebSpeechAvailable = useIsWebSpeechAvailable()
  const { isAuthenticated, isLoading: authLoading } = useAccount()

  const [quotaInfo, setQuotaInfo] = useState<{
    available: boolean
    webSpeechAvailable: boolean
    stats?: { used: number; cap: number; percentUsed: number }
  } | null>(null)
  const [isCheckingQuota, setIsCheckingQuota] = useState(false)
  const [braveInfo, setBraveInfo] = useState<BraveDetectionInfo | null>(null)

  useEffect(() => {
    detectBraveInfo().then(setBraveInfo)
  }, [])

  const handleCheckQuota = useCallback(async () => {
    setIsCheckingQuota(true)
    try {
      const response = await fetch("/api/voice-search/quota")
      if (response.ok) {
        const data = await response.json()
        setQuotaInfo(data)
      }
    } finally {
      setIsCheckingQuota(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      handleCheckQuota()
    }
  }, [isAuthenticated, handleCheckQuota])

  const handleStart = useCallback(async () => {
    clearError()
    clearTranscript()
    await start()
  }, [start, clearError, clearTranscript])

  const handleStop = useCallback(() => {
    stop()
  }, [stop])

  const handleReset = useCallback(() => {
    reset()
    setQuotaInfo(null)
  }, [reset])

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="p-6 bg-neutral-900 rounded-xl text-center">
        <Warning size={48} className="mx-auto mb-4 text-amber-500" />
        <h2 className="text-lg font-semibold mb-2">Sign in required</h2>
        <p className="text-neutral-400 mb-4">Voice search requires authentication</p>
        <a
          href="/login"
          className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
        >
          Sign in
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quota Info */}
      <section className="p-4 bg-neutral-900 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
            Quota Status
          </h2>
          <button
            type="button"
            onClick={handleCheckQuota}
            disabled={isCheckingQuota}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            {isCheckingQuota ? "Checking..." : "Refresh"}
          </button>
        </div>
        {quotaInfo ? (
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <StatusBadge active={quotaInfo.available} label="Google STT" />
              <StatusBadge active={quotaInfo.webSpeechAvailable} label="Web Speech" />
            </div>
            {quotaInfo.stats && (
              <div className="text-sm text-neutral-400">
                Usage: {Math.floor(quotaInfo.stats.used / 60)}m {quotaInfo.stats.used % 60}s /{" "}
                {Math.floor(quotaInfo.stats.cap / 60)}m ({quotaInfo.stats.percentUsed}%)
                <div className="mt-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      quotaInfo.stats.percentUsed >= 90
                        ? "bg-red-500"
                        : quotaInfo.stats.percentUsed >= 75
                          ? "bg-amber-500"
                          : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(quotaInfo.stats.percentUsed, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-neutral-500 text-sm">Loading quota info...</p>
        )}
      </section>

      {/* Browser Support */}
      <section className="p-4 bg-neutral-900 rounded-xl space-y-3">
        <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
          Browser Support
        </h2>
        <div className="flex items-center gap-4">
          <StatusBadge active={speechState.isSupported} label="MediaRecorder" />
          <StatusBadge active={isWebSpeechAvailable} label="Web Speech API" />
        </div>
      </section>

      {/* Brave Detection */}
      <section className="p-4 bg-neutral-900 rounded-xl space-y-3 border border-orange-500/30">
        <div className="flex items-center gap-3">
          <Detective size={24} weight="bold" className="text-orange-400" />
          <h2 className="text-sm font-medium text-orange-400 uppercase tracking-wider">
            Brave Detection
          </h2>
        </div>
        <p className="text-xs text-neutral-500">
          Brave desktop blocks Web Speech API. Detection skips Web Speech and uses Google STT
          directly.
        </p>
        {braveInfo ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge active={braveInfo.isMobile} label="Mobile" />
              <StatusBadge active={braveInfo.hasBraveApi} label="Brave API" />
              <StatusBadge active={braveInfo.isBrave} label="Is Brave" />
              <StatusBadge active={braveInfo.isBraveDesktop} label="Brave Desktop" />
            </div>
            {braveInfo.isBraveDesktop && (
              <div className="p-2 bg-orange-900/20 border border-orange-500/30 rounded text-orange-300 text-sm">
                ⚡ Brave desktop detected — will use Google STT directly
              </div>
            )}
            <div>
              <span className="text-neutral-500 text-xs">User Agent:</span>
              <p className="text-neutral-400 font-mono text-xs break-all bg-neutral-800 rounded px-2 py-1 mt-1">
                {braveInfo.userAgent}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-neutral-500 text-sm">Detecting...</p>
        )}
      </section>

      {/* Tiered System Test (Combined Flow) */}
      <section className="p-4 bg-neutral-900 rounded-xl space-y-4 border border-indigo-500/30">
        <h2 className="text-sm font-medium text-indigo-400 uppercase tracking-wider">
          Tiered System Test (Combined Flow)
        </h2>
        <p className="text-xs text-neutral-500">
          Tests the full tier selection logic: checks quota, picks Google STT or Web Speech fallback
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge active={speechState.isConnecting} label="Connecting" />
          <StatusBadge active={speechState.isRecording} label="Recording" />
          <StatusBadge active={speechState.hasAudioPermission} label="Mic Permission" />
          <StatusBadge active={speechState.isAutoStopping} label="Auto-stopping" />
        </div>
        {tier && (
          <div className="pt-2">
            <span className="text-neutral-400 text-sm mr-2">Active Tier:</span>
            <TierBadge tier={tier} />
          </div>
        )}

        {/* Silence Detection Status (Google STT mode only) */}
        {speechState.isSilenceDetectionActive && (
          <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  speechState.isSilent ? "bg-cyan-500" : "bg-green-500 animate-pulse"
                }`}
              />
              <span className="text-cyan-400 text-sm font-medium">Silence Detection Active</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge active={speechState.hasSpeechBeenDetected} label="Speech Detected" />
              <StatusBadge active={speechState.isSilent} label="Silent" />
            </div>
            <p className="text-xs text-neutral-500">
              Auto-stops after 1.5s of silence following speech
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {!speechState.isRecording ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={speechState.isConnecting}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-500 rounded-lg transition-colors"
            >
              {speechState.isConnecting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Microphone size={20} />
              )}
              <span>{speechState.isConnecting ? "Connecting..." : "Start Recording"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
            >
              <Stop size={20} />
              <span>Stop Recording</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Transcripts */}
        <div className="space-y-2">
          <div>
            <span className="text-neutral-500 text-xs">Partial:</span>
            <p className="text-neutral-300 font-mono text-sm min-h-[1.5rem] bg-neutral-800 rounded px-2 py-1">
              {speechState.partialTranscript || <span className="text-neutral-600">—</span>}
            </p>
          </div>
          <div>
            <span className="text-neutral-500 text-xs">Final:</span>
            <p className="text-white font-mono text-sm min-h-[1.5rem] bg-neutral-800 rounded px-2 py-1">
              {speechState.finalTranscript || <span className="text-neutral-600">—</span>}
            </p>
          </div>
          {speechState.detectedLanguageCode && (
            <div className="text-xs text-neutral-500">
              Detected language: {speechState.detectedLanguageCode}
            </div>
          )}
        </div>
      </section>

      {/* Direct Tier Tests */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Direct Tier Tests</h2>
        <p className="text-sm text-neutral-400">
          Test each tier independently, bypassing the automatic tier selection
        </p>
        <GoogleSTTDirectTester />
        <WebSpeechDirectTester />
      </div>

      {/* Errors */}
      {speechState.errorCode && (
        <section className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl space-y-2">
          <h2 className="text-sm font-medium text-red-400 uppercase tracking-wider">Error</h2>
          <p className="text-red-300 font-mono text-sm">
            [{speechState.errorCode}] {speechState.errorMessage}
          </p>
          <button
            type="button"
            onClick={clearError}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Clear error
          </button>
        </section>
      )}

      {/* Debug Info */}
      <section className="p-4 bg-neutral-900 rounded-xl space-y-2">
        <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
          Debug Info
        </h2>
        <pre className="text-xs text-neutral-500 font-mono overflow-x-auto">
          {JSON.stringify(
            {
              isQuotaAvailable: speechState.isQuotaAvailable,
              isWebSpeechAvailable: speechState.isWebSpeechAvailable,
              tierUsed: speechState.tierUsed,
              lastUpdatedAt: speechState.lastUpdatedAt
                ? new Date(speechState.lastUpdatedAt).toISOString()
                : null,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </div>
  )
})

export default function VoiceSearchTestPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton fallbackHref="/test" ariaLabel="Back" />
            <h1 className="text-lg font-semibold">Voice Search Test</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="pt-20 pb-8 px-4 max-w-2xl mx-auto">
        <div className="mb-6 p-4 bg-amber-900/20 border border-amber-500/30 rounded-xl">
          <p className="text-amber-300 text-sm">
            <strong>Test Page:</strong> This page tests the tiered voice search implementation. Web
            Speech API is used first (fast, free). If low confidence, falls back to Google Cloud STT
            (if quota available).
          </p>
        </div>

        <VoiceSearchTester />
      </main>
    </div>
  )
}
