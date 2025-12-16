import { auth } from "@/auth"
import {
  createRecognizeConfig,
  createSpeechClient,
  parseRecognitionResponse,
} from "@/lib/google-speech-client"
import { SpeechAPIError, SpeechQuotaError } from "@/lib/speech-errors"
import { checkQuotaAvailable, incrementUsage } from "@/lib/speech-usage-tracker"
import { Effect } from "effect"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

interface TranscribeRequest {
  audio: string
  languageHints?: string[]
}

interface TranscribeResponse {
  transcript: string
  languageCode: string | null
}

interface ErrorResponse {
  error: string
  code: string
}

function transcribeAudio(
  audioBase64: string,
  languageHints: string[] | undefined,
): Effect.Effect<TranscribeResponse, SpeechAPIError | SpeechQuotaError> {
  return Effect.gen(function* () {
    const client = yield* createSpeechClient().pipe(
      Effect.mapError(
        (err) => new SpeechAPIError({ code: "CLIENT_INIT_FAILED", message: err.message }),
      ),
    )

    const audioBuffer = Buffer.from(audioBase64, "base64")

    console.log("[transcribe] Request:", {
      audioBytes: audioBuffer.length,
      languageHints: languageHints ?? ["en-US"],
      model: "latest_short",
      decodingConfig: "auto",
    })

    const recognizeConfig = createRecognizeConfig({
      languageHints: languageHints ?? ["en-US"],
    })

    // V2 API expects content as Uint8Array for gRPC clients (binary format, not base64)
    const request = {
      recognizer: recognizeConfig.recognizer,
      config: recognizeConfig.config,
      content: new Uint8Array(audioBuffer),
    }

    console.log("[transcribe] Sending request to Speech API...")

    const [response] = yield* Effect.tryPromise({
      try: () => client.recognize(request),
      catch: (error): SpeechAPIError | SpeechQuotaError => {
        const err = error as {
          code?: number
          message?: string
          details?: unknown
          metadata?: unknown
          stack?: string
        }
        console.error("[transcribe] API error full:", JSON.stringify(error, null, 2))
        console.error("[transcribe] API error details:", {
          code: err.code,
          message: err.message,
          details: err.details,
          metadata: err.metadata,
          stack: err.stack,
        })
        // gRPC code 8 = RESOURCE_EXHAUSTED (quota)
        if (err.code === 8) {
          return new SpeechQuotaError({ message: "Speech API quota exceeded" })
        }
        // gRPC code 3 = INVALID_ARGUMENT
        if (err.code === 3) {
          return new SpeechAPIError({
            code: "INVALID_ARGUMENT",
            message: err.message ?? "Invalid request configuration",
          })
        }
        return new SpeechAPIError({
          code: String(err.code ?? "UNKNOWN"),
          message: err.message ?? "Recognition failed",
        })
      },
    })

    console.log("[transcribe] Raw response:", JSON.stringify(response, null, 2))

    const results = response.results ?? []
    const transcripts: string[] = []
    let languageCode: string | null = null

    console.log("[transcribe] Response results count:", results.length)

    for (const result of results) {
      console.log("[transcribe] Result:", JSON.stringify(result, null, 2))
      const parsed = parseRecognitionResponse({ results: [result] })
      if (parsed) {
        transcripts.push(parsed.transcript)
        if (!languageCode && parsed.languageCode) {
          languageCode = parsed.languageCode
        }
      }
    }

    const finalTranscript = transcripts.join(" ").trim()
    console.log("[transcribe] Final transcript:", finalTranscript, "Language:", languageCode)

    return {
      transcript: finalTranscript,
      languageCode,
    }
  })
}

export async function POST(request: Request): Promise<NextResponse<TranscribeResponse | ErrorResponse>> {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }

  const quotaResult = await Effect.runPromiseExit(checkQuotaAvailable())
  if (quotaResult._tag === "Failure") {
    console.error("Failed to check quota:", quotaResult.cause)
  } else if (!quotaResult.value) {
    return NextResponse.json(
      { error: "Monthly voice search quota exceeded", code: "QUOTA_EXCEEDED" },
      { status: 429 },
    )
  }

  let body: TranscribeRequest
  try {
    body = (await request.json()) as TranscribeRequest
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_REQUEST" },
      { status: 400 },
    )
  }

  const { audio, languageHints } = body

  if (!audio || typeof audio !== "string") {
    return NextResponse.json(
      { error: "Missing required field: audio (base64 string)", code: "INVALID_REQUEST" },
      { status: 400 },
    )
  }

  const audioBuffer = Buffer.from(audio, "base64")
  const durationSeconds = Math.ceil(audioBuffer.length / 32000)

  const result = await Effect.runPromiseExit(transcribeAudio(audio, languageHints))

  if (result._tag === "Failure") {
    const cause = result.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error instanceof SpeechQuotaError) {
        return NextResponse.json(
          { error: error.message, code: "QUOTA_EXCEEDED" },
          { status: 429 },
        )
      }
      if (error instanceof SpeechAPIError) {
        console.error("Speech API error:", error.code, error.message)
        return NextResponse.json(
          { error: "Speech recognition failed", code: error.code },
          { status: 502 },
        )
      }
    }
    console.error("Transcription failed:", cause)
    return NextResponse.json(
      { error: "Transcription failed", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }

  await Effect.runPromise(
    incrementUsage({ userId: session.user.id, durationSeconds }).pipe(
      Effect.catchAll((err) => {
        console.error("Failed to track usage:", err)
        return Effect.void
      }),
    ),
  )

  return NextResponse.json(result.value)
}
