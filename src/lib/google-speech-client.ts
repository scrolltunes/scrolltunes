/**
 * Google Cloud Speech-to-Text V2 Client Wrapper
 * SERVER-SIDE ONLY - Do not import in client components
 */

import { v2 } from "@google-cloud/speech"

type SpeechClient = v2.SpeechClient
const { SpeechClient } = v2
import { ServerConfig } from "@/services/server-config"
import { Context, Effect, Layer } from "effect"

// Configuration for recognition
export interface RecognitionConfig {
  readonly languageHints?: readonly string[]
}

// Result from Google STT
export interface RecognitionResult {
  readonly transcript: string
  readonly isFinal: boolean
  readonly languageCode: string | null
}

function normalizePrivateKey(raw: string): string {
  const unescaped = raw.replace(/\\n/g, "\n").trim()
  const hasNewlines = unescaped.includes("\n")
  if (hasNewlines) return unescaped

  // Add PEM line breaks if the key was pasted as a single line
  const withHeader = unescaped.replace(
    /^-----BEGIN PRIVATE KEY-----/,
    "-----BEGIN PRIVATE KEY-----\n",
  )
  const withFooter = withHeader.replace(/-----END PRIVATE KEY-----$/, "\n-----END PRIVATE KEY-----")
  return `${withFooter}\n`
}

// Create a configured speech client
export class SpeechClientService extends Context.Tag("SpeechClientService")<
  SpeechClientService,
  {
    readonly createClient: Effect.Effect<SpeechClient, Error>
    readonly createRecognizeConfig: (
      config: RecognitionConfig,
    ) => Effect.Effect<{ recognizer: string; config: Record<string, unknown> }, Error>
  }
>() {}

const makeSpeechClientService = Effect.gen(function* () {
  const { googleCloudProjectId, googleCloudClientEmail, googleCloudPrivateKey } =
    yield* ServerConfig
  const privateKey = normalizePrivateKey(googleCloudPrivateKey)
  const recognizer = `projects/${googleCloudProjectId}/locations/global/recognizers/_`

  const createClient = Effect.try({
    try: () =>
      new SpeechClient({
        projectId: googleCloudProjectId,
        credentials: {
          client_email: googleCloudClientEmail,
          private_key: privateKey,
        },
      }),
    catch: error =>
      new Error(
        `Failed to create Speech client: ${error instanceof Error ? error.message : String(error)}`,
      ),
  })

  const createRecognizeConfig = (
    config: RecognitionConfig,
  ): Effect.Effect<{ recognizer: string; config: Record<string, unknown> }, Error> =>
    Effect.succeed({
      recognizer,
      config: {
        model: "latest_short",
        languageCodes: [
          ...(config.languageHints ?? ["en-US", "es-ES", "fr-FR", "pt-BR", "he-IL", "ru-RU"]),
        ],
        features: {},
        autoDecodingConfig: {},
      },
    })

  return {
    createClient,
    createRecognizeConfig,
  }
})

export const SpeechClientServiceLive = Layer.effect(SpeechClientService, makeSpeechClientService)

// Create a configured speech client
export const createSpeechClient = (): Effect.Effect<SpeechClient, Error, SpeechClientService> =>
  SpeechClientService.pipe(Effect.flatMap(service => service.createClient))

// Create recognition request config for V2 API with latest_short model
export const createRecognizeConfig = (
  config: RecognitionConfig,
): Effect.Effect<
  { recognizer: string; config: Record<string, unknown> },
  Error,
  SpeechClientService
> => SpeechClientService.pipe(Effect.flatMap(service => service.createRecognizeConfig(config)))

// Parse recognition response into our result type
export function parseRecognitionResponse(response: unknown): RecognitionResult | null {
  const resp = response as {
    results?: Array<{
      alternatives?: Array<{ transcript?: string }>
      isFinal?: boolean
      languageCode?: string
    }>
  }

  const result = resp.results?.[0]
  if (!result?.alternatives?.[0]?.transcript) {
    return null
  }

  return {
    transcript: result.alternatives[0].transcript,
    isFinal: result.isFinal ?? false,
    languageCode: result.languageCode ?? null,
  }
}
