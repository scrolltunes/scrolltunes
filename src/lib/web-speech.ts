/**
 * Web Speech API Service
 * CLIENT-SIDE ONLY - Uses browser's native speech recognition
 */

import {
  SpeechAPIError,
  SpeechNetworkError,
  SpeechNotSupportedError,
  SpeechPermissionError,
  type SpeechError,
} from "@/lib/speech-errors"
import { Context, Effect, Layer } from "effect"

declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition
    webkitSpeechRecognition?: typeof SpeechRecognition
  }

  class SpeechRecognition extends EventTarget {
    lang: string
    continuous: boolean
    interimResults: boolean
    maxAlternatives: number
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    onstart: (() => void) | null
    start(): void
    stop(): void
    abort(): void
  }

  interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList
    readonly resultIndex: number
  }

  interface SpeechRecognitionResultList {
    readonly length: number
    item(index: number): SpeechRecognitionResult | null
    [index: number]: SpeechRecognitionResult | undefined
  }

  interface SpeechRecognitionResult {
    readonly length: number
    readonly isFinal: boolean
    item(index: number): SpeechRecognitionAlternative | null
    [index: number]: SpeechRecognitionAlternative | undefined
  }

  interface SpeechRecognitionAlternative {
    readonly transcript: string
    readonly confidence: number
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: SpeechRecognitionErrorCode
    readonly message: string
  }

  type SpeechRecognitionErrorCode =
    | "aborted"
    | "audio-capture"
    | "bad-grammar"
    | "language-not-supported"
    | "network"
    | "no-speech"
    | "not-allowed"
    | "service-not-allowed"
}

export interface WebSpeechResult {
  readonly transcript: string
  readonly confidence: number | null
  readonly isFinal: boolean
}

export interface WebSpeechConfig {
  readonly lang?: string
  readonly maxDurationMs?: number
  readonly interimResults?: boolean
}

const DEFAULT_MAX_DURATION_MS = 10000
const DEFAULT_LANG = "en-US"

type SpeechRecognitionType = typeof window.SpeechRecognition

function getSpeechRecognition(): SpeechRecognitionType | null {
  if (typeof window === "undefined") return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

function mapWebSpeechError(error: SpeechRecognitionErrorEvent): SpeechError {
  switch (error.error) {
    case "not-allowed":
      return new SpeechPermissionError({
        message: "Microphone access denied",
      })
    case "network":
      return new SpeechNetworkError({
        message: "Network error during speech recognition",
      })
    case "service-not-allowed":
      return new SpeechAPIError({
        code: error.error,
        message: "Speech recognition service not allowed",
      })
    case "no-speech":
      return new SpeechAPIError({
        code: error.error,
        message: "No speech detected",
      })
    case "audio-capture":
      return new SpeechAPIError({
        code: error.error,
        message: "Audio capture failed",
      })
    case "aborted":
      return new SpeechAPIError({
        code: error.error,
        message: "Speech recognition aborted",
      })
    default:
      return new SpeechAPIError({
        code: error.error,
        message: error.message || "Unknown speech recognition error",
      })
  }
}

export class WebSpeechService extends Context.Tag("WebSpeechService")<
  WebSpeechService,
  {
    readonly isSupported: Effect.Effect<boolean>
    readonly recognize: (config?: WebSpeechConfig) => Effect.Effect<WebSpeechResult, SpeechError>
  }
>() {}

const makeWebSpeechService = Effect.sync(() => {
  const isSupported = Effect.sync(() => getSpeechRecognition() !== null)

  const recognize = (config?: WebSpeechConfig): Effect.Effect<WebSpeechResult, SpeechError> =>
    Effect.async<WebSpeechResult, SpeechError>(resume => {
      const SpeechRecognitionClass = getSpeechRecognition()

      if (!SpeechRecognitionClass) {
        resume(
          Effect.fail(
            new SpeechNotSupportedError({
              message: "Web Speech API not supported in this browser",
            }),
          ),
        )
        return
      }

      const recognition = new SpeechRecognitionClass()
      recognition.lang = config?.lang ?? DEFAULT_LANG
      recognition.interimResults = config?.interimResults ?? false
      recognition.continuous = false
      recognition.maxAlternatives = 1

      let finalResult: WebSpeechResult | null = null
      let hasResumed = false

      const maxDuration = config?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
      const timeoutId = setTimeout(() => {
        if (!hasResumed) {
          recognition.stop()
        }
      }, maxDuration)

      const cleanup = () => {
        clearTimeout(timeoutId)
      }

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const result = event.results[event.results.length - 1]
        if (result) {
          const alternative = result[0]
          if (alternative) {
            finalResult = {
              transcript: alternative.transcript,
              confidence: alternative.confidence ?? null,
              isFinal: result.isFinal,
            }

            if (result.isFinal && !hasResumed) {
              hasResumed = true
              cleanup()
              resume(Effect.succeed(finalResult))
            }
          }
        }
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (!hasResumed) {
          hasResumed = true
          cleanup()
          resume(Effect.fail(mapWebSpeechError(event)))
        }
      }

      recognition.onend = () => {
        if (!hasResumed) {
          hasResumed = true
          cleanup()
          if (finalResult) {
            resume(Effect.succeed(finalResult))
          } else {
            resume(
              Effect.fail(
                new SpeechAPIError({
                  code: "no-speech",
                  message: "No speech detected before recognition ended",
                }),
              ),
            )
          }
        }
      }

      recognition.start()

      return Effect.sync(() => {
        cleanup()
        if (!hasResumed) {
          recognition.abort()
        }
      })
    })

  return {
    isSupported,
    recognize,
  }
})

export const WebSpeechServiceLive = Layer.effect(WebSpeechService, makeWebSpeechService)

export const isSupported: Effect.Effect<boolean, never, WebSpeechService> = WebSpeechService.pipe(
  Effect.flatMap(service => service.isSupported),
)

export const recognize = (
  config?: WebSpeechConfig,
): Effect.Effect<WebSpeechResult, SpeechError, WebSpeechService> =>
  WebSpeechService.pipe(Effect.flatMap(service => service.recognize(config)))
