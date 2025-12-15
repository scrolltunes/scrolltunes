import {
  type BPMResult,
  deezerBpmProvider,
  getBpmWithFallback,
  getSongBpmProvider,
  withInMemoryCache,
} from "@/lib/bpm"
import { getAlbumArt } from "@/lib/deezer-client"
import type { LyricsApiSuccessResponse } from "@/lib/lyrics-api-types"
import { LyricsAPIError, LyricsNotFoundError, getLyricsById } from "@/lib/lyrics-client"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const bpmProviders = [withInMemoryCache(getSongBpmProvider), withInMemoryCache(deezerBpmProvider)]

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const id = Number.parseInt(idParam, 10)

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid ID: must be a positive integer" }, { status: 400 })
  }

  const lyricsEffect = getLyricsById(id)

  const combinedEffect = lyricsEffect.pipe(
    Effect.flatMap(lyrics => {
      const bpmEffect: Effect.Effect<BPMResult | null> = getBpmWithFallback(bpmProviders, {
        title: lyrics.title,
        artist: lyrics.artist,
      }).pipe(
        Effect.catchAll(error => {
          if (error._tag === "BPMAPIError") {
            console.error("BPM API error:", error.status, error.message)
          }
          return Effect.succeed(null)
        }),
        Effect.catchAllDefect(defect => {
          console.error("BPM defect:", defect)
          return Effect.succeed(null)
        }),
      )

      return Effect.map(bpmEffect, bpm => ({ lyrics, bpm }))
    }),
  )

  const result = await Effect.runPromiseExit(combinedEffect)

  if (result._tag === "Failure") {
    const error = result.cause
    if (error._tag === "Fail") {
      const failure = error.error
      if (failure instanceof LyricsNotFoundError) {
        return NextResponse.json({ error: `No lyrics found for ID ${id}` }, { status: 404 })
      }
      if (failure instanceof LyricsAPIError) {
        console.error("Lyrics API error:", failure.message)
        return NextResponse.json(
          { error: "Lyrics service temporarily unavailable" },
          { status: failure.status >= 500 ? 502 : 500 },
        )
      }
    }
    console.error("Lyrics fetch failed:", error)
    return NextResponse.json({ error: "Failed to fetch lyrics" }, { status: 502 })
  }

  const { lyrics, bpm: bpmResult } = result.value

  const albumArt = await getAlbumArt(lyrics.artist, lyrics.title, "medium")

  const body: LyricsApiSuccessResponse = {
    lyrics,
    bpm: bpmResult?.bpm ?? null,
    key: bpmResult?.key ?? null,
    albumArt: albumArt ?? null,
    attribution: {
      lyrics: { name: "LRCLIB", url: "https://lrclib.net" },
      bpm: bpmResult
        ? bpmResult.source === "Deezer"
          ? { name: "Deezer", url: "https://www.deezer.com" }
          : { name: "GetSongBPM", url: "https://getsongbpm.com" }
        : null,
    },
  }
  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  })
}
