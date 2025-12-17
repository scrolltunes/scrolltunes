/**
 * Songsterr API client
 *
 * Provides chord data lookup via songsterr.com.
 * - Search songs by query
 * - Fetch ChordPro data from song pages
 */

import { Effect } from "effect"
import type {
  ChordProDocument,
  RawChordProDocument,
  SongsterrSearchResult,
} from "./songsterr-types"
import { SongsterrError, SongsterrNotFoundError, SongsterrParseError } from "./songsterr-types"

const SONGSTERR_API_URL = "https://www.songsterr.com/api/songs"
const SONGSTERR_BASE_URL = "https://www.songsterr.com"

const headers = {
  "User-Agent": "ScrollTunes/1.0 (https://scrolltunes.com)",
}

interface SongsterrApiResult {
  readonly songId: number
  readonly title: string
  readonly artist: string
  readonly hasChords: boolean
}

interface SongsterrStateData {
  readonly chordpro?: {
    readonly current?: readonly unknown[]
  }
  readonly meta?: {
    readonly song?: {
      readonly title?: string
      readonly artist?: string
    }
  }
}

function toSongsterrSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export const searchSongs = (
  query: string,
): Effect.Effect<SongsterrSearchResult[], SongsterrError> => {
  return Effect.gen(function* () {
    if (process.env.NEXT_PUBLIC_DISABLE_EXTERNAL_APIS === "true") {
      return []
    }

    const params = new URLSearchParams({ pattern: query })
    const url = `${SONGSTERR_API_URL}?${params.toString()}`

    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { headers }),
      catch: () => new SongsterrError({ status: 0, message: "Network error" }),
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new SongsterrError({
          status: response.status,
          message: response.statusText,
        }),
      )
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<readonly SongsterrApiResult[]>,
      catch: () => new SongsterrError({ status: 0, message: "Failed to parse response" }),
    })

    const results: SongsterrSearchResult[] = []
    for (const item of data) {
      if (item.hasChords) {
        results.push({
          songId: item.songId,
          title: item.title,
          artist: item.artist,
          hasChords: item.hasChords,
        })
      }
    }

    return results
  })
}

export const getRawChordProData = (
  songId: number,
  artist: string,
  title: string,
): Effect.Effect<
  RawChordProDocument,
  SongsterrError | SongsterrNotFoundError | SongsterrParseError
> => {
  return Effect.gen(function* () {
    if (process.env.NEXT_PUBLIC_DISABLE_EXTERNAL_APIS === "true") {
      return yield* Effect.fail(new SongsterrNotFoundError({ songId, artist, title }))
    }

    const artistSlug = toSongsterrSlug(artist)
    const titleSlug = toSongsterrSlug(title)
    const url = `${SONGSTERR_BASE_URL}/a/wsa/${artistSlug}-${titleSlug}-chords-s${songId}`

    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { headers }),
      catch: () => new SongsterrError({ status: 0, message: "Network error" }),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return yield* Effect.fail(new SongsterrNotFoundError({ songId, artist, title }))
      }
      return yield* Effect.fail(
        new SongsterrError({
          status: response.status,
          message: response.statusText,
        }),
      )
    }

    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () => new SongsterrError({ status: 0, message: "Failed to read response" }),
    })

    const scriptMatch = html.match(/<script\s+id="state"[^>]*>([\s\S]*?)<\/script>/i)
    if (!scriptMatch?.[1]) {
      return yield* Effect.fail(
        new SongsterrParseError({ message: "Could not find state script in HTML" }),
      )
    }

    let stateData: SongsterrStateData
    try {
      stateData = JSON.parse(scriptMatch[1]) as SongsterrStateData
    } catch {
      return yield* Effect.fail(new SongsterrParseError({ message: "Failed to parse state JSON" }))
    }

    const chordproLines = stateData.chordpro?.current
    if (!chordproLines || !Array.isArray(chordproLines)) {
      return yield* Effect.fail(
        new SongsterrParseError({ message: "No chordpro data found in state" }),
      )
    }

    return chordproLines as RawChordProDocument
  })
}

export const getChordData = (
  songId: number,
  artist: string,
  title: string,
): Effect.Effect<
  ChordProDocument,
  SongsterrError | SongsterrNotFoundError | SongsterrParseError
> => {
  return Effect.gen(function* () {
    const rawDoc = yield* getRawChordProData(songId, artist, title)

    const lines = rawDoc.map(line => {
      if (typeof line === "string") {
        return { type: "lyrics" as const, content: line }
      }
      if (typeof line === "object" && line !== null) {
        const lineObj = line as Record<string, unknown>
        return {
          type: (lineObj.type as "lyrics" | "chord" | "section" | "comment") ?? "lyrics",
          content: (lineObj.content as string) ?? "",
          chord: lineObj.chord as string | undefined,
        }
      }
      return { type: "lyrics" as const, content: "" }
    })

    return {
      songId,
      title,
      artist,
      lines,
    }
  })
}

export async function searchSongsAsync(query: string): Promise<SongsterrSearchResult[]> {
  return Effect.runPromise(searchSongs(query))
}

export async function getChordDataAsync(
  songId: number,
  artist: string,
  title: string,
): Promise<ChordProDocument> {
  return Effect.runPromise(getChordData(songId, artist, title))
}
