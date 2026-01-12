import { auth } from "@/auth"
import {
  accounts,
  appUserProfiles,
  userSetlistSongs,
  userSetlists,
  userSongItems,
  userSongSettings,
  userSpotifyTokens,
  users,
} from "@/lib/db/schema"
import { AuthError, DatabaseError, NotFoundError, UnauthorizedError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const getExportData = Effect.gen(function* () {
  const session = yield* Effect.tryPromise({
    try: () => auth(),
    catch: cause => new AuthError({ cause }),
  })

  if (!session?.user?.id) {
    return yield* Effect.fail(new UnauthorizedError({}))
  }

  const userId = session.user.id
  const { db } = yield* DbService

  // Fetch user, profile, songItems, settings, setlists, spotifyTokens, and spotifyAccount in parallel
  const [
    userResult,
    profileResult,
    songItems,
    settings,
    setlists,
    spotifyTokensResult,
    spotifyAccountResult,
  ] = yield* Effect.all(
    [
      Effect.tryPromise({
        try: () => db.select().from(users).where(eq(users.id, userId)),
        catch: cause => new DatabaseError({ cause }),
      }),
      Effect.tryPromise({
        try: () => db.select().from(appUserProfiles).where(eq(appUserProfiles.userId, userId)),
        catch: cause => new DatabaseError({ cause }),
      }),
      Effect.tryPromise({
        try: () => db.select().from(userSongItems).where(eq(userSongItems.userId, userId)),
        catch: cause => new DatabaseError({ cause }),
      }),
      Effect.tryPromise({
        try: () => db.select().from(userSongSettings).where(eq(userSongSettings.userId, userId)),
        catch: cause => new DatabaseError({ cause }),
      }),
      Effect.tryPromise({
        try: () => db.select().from(userSetlists).where(eq(userSetlists.userId, userId)),
        catch: cause => new DatabaseError({ cause }),
      }),
      Effect.tryPromise({
        try: () => db.select().from(userSpotifyTokens).where(eq(userSpotifyTokens.userId, userId)),
        catch: cause => new DatabaseError({ cause }),
      }),
      Effect.tryPromise({
        try: () => db.select().from(accounts).where(eq(accounts.userId, userId)),
        catch: cause => new DatabaseError({ cause }),
      }),
    ],
    { concurrency: 5 },
  )

  const user = userResult[0]
  const profile = profileResult[0]
  const spotifyTokens = spotifyTokensResult[0]
  const spotifyAccount = spotifyAccountResult[0]

  if (!user) {
    return yield* Effect.fail(new NotFoundError({ resource: "User", id: userId }))
  }

  // Fetch setlist songs in parallel with concurrency limit
  const setlistSongsResults = yield* Effect.all(
    setlists.map(setlist =>
      Effect.tryPromise({
        try: () =>
          db.select().from(userSetlistSongs).where(eq(userSetlistSongs.setlistId, setlist.id)),
        catch: cause => new DatabaseError({ cause }),
      }).pipe(Effect.map(songs => ({ setlistId: setlist.id, songs }))),
    ),
    { concurrency: 5 },
  )

  const setlistSongsMap = new Map<
    string,
    Array<{
      songId: string
      songProvider: string
      title: string
      artist: string
      sortOrder: number
    }>
  >()

  for (const { setlistId, songs } of setlistSongsResults) {
    setlistSongsMap.set(
      setlistId,
      songs.map(s => ({
        songId: s.songId,
        songProvider: s.songProvider,
        title: s.songTitle,
        artist: s.songArtist,
        sortOrder: s.sortOrder,
      })),
    )
  }

  return {
    generatedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      createdAt: user.emailVerified?.toISOString() ?? null,
    },
    profile: profile
      ? {
          consentVersion: profile.consentVersion,
          consentGivenAt: profile.consentGivenAt.toISOString(),
        }
      : null,
    songHistory: songItems
      .filter(s => s.inHistory)
      .map(s => ({
        songId: s.songId,
        songProvider: s.songProvider,
        title: s.songTitle,
        artist: s.songArtist,
        album: s.songAlbum,
        firstPlayedAt: s.firstPlayedAt?.toISOString() ?? null,
        lastPlayedAt: s.lastPlayedAt?.toISOString() ?? null,
        playCount: s.playCount,
      })),
    favorites: songItems
      .filter(s => s.isFavorite)
      .map(s => ({
        songId: s.songId,
        songProvider: s.songProvider,
        title: s.songTitle,
        artist: s.songArtist,
      })),
    songSettings: settings.map(s => ({
      songId: s.songId,
      songProvider: s.songProvider,
      transposeSemitones: s.transposeSemitones,
      capoFret: s.capoFret,
      notes: s.notes,
      tempoMultiplier: s.tempoMultiplier,
    })),
    setlists: setlists.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      color: s.color,
      songs: setlistSongsMap.get(s.id) ?? [],
    })),
    integrations: {
      spotify: spotifyTokens
        ? {
            connected: true,
            scope: spotifyAccount?.scope ?? null,
            lastUpdatedAt: spotifyTokens.updatedAt?.toISOString() ?? null,
          }
        : null,
    },
  }
})

export async function GET() {
  const exit = await Effect.runPromiseExit(getExportData.pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (cause.error instanceof NotFoundError) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
    }
    console.error("Failed to export user data", exit.cause)
    return NextResponse.json({ error: "Failed to export user data" }, { status: 500 })
  }

  const dateStr = new Date().toISOString().split("T")[0]

  return new NextResponse(JSON.stringify(exit.value, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="scrolltunes-data-${dateStr}.json"`,
    },
  })
}
