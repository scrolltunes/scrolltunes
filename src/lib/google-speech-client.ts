/**
 * Google Cloud Speech-to-Text V2 Client Wrapper
 * SERVER-SIDE ONLY - Do not import in client components
 */

import { v2 } from "@google-cloud/speech"

type SpeechClient = v2.SpeechClient
const { SpeechClient } = v2
import { Effect } from "effect"

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
export function createSpeechClient(): Effect.Effect<SpeechClient, Error> {
  return Effect.try({
    try: () => {
      const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID
      const clientEmail = process.env.GOOGLE_CLOUD_CLIENT_EMAIL
      const privateKeyRaw = process.env.GOOGLE_CLOUD_PRIVATE_KEY
      const privateKey = privateKeyRaw ? normalizePrivateKey(privateKeyRaw) : null

      if (projectId && clientEmail && privateKey) {
        return new SpeechClient({
          projectId,
          credentials: {
            client_email: clientEmail,
            private_key: privateKey,
          },
        })
      }
      // Fall back to default credentials (ADC)
      return new SpeechClient()
    },
    catch: error =>
      new Error(
        `Failed to create Speech client: ${error instanceof Error ? error.message : String(error)}`,
      ),
  })
}

// Create recognition request config for V2 API with latest_short model
export function createRecognizeConfig(config: RecognitionConfig) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID
  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT_ID environment variable is required")
  }

  return {
    recognizer: `projects/${projectId}/locations/global/recognizers/_`,
    config: {
      model: "latest_short",
      languageCodes: [
        ...(config.languageHints ?? ["en-US", "es-ES", "fr-FR", "pt-BR", "he-IL", "ru-RU"]),
      ],
      features: {},
      autoDecodingConfig: {},
    },
  }
}

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
