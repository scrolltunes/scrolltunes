import { auth } from "@/auth"
import { userSongSettings } from "@/lib/db/schema"
import { AuthError, DatabaseError, UnauthorizedError, ValidationError } from "@/lib/errors"
import type { SongEditPayload } from "@/lib/song-edits"
import { DbLayer, DbService } from "@/services/db"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const SONG_PROVIDER = "lrclib"

interface SettingsJson {
  edits?: SongEditPayload
  [key: string]: unknown
}

/**
 * Validate that a payload looks like a valid SongEditPayload
 */
function isValidEditPayload(payload: unknown): payload is SongEditPayload {
  if (typeof payload !== "object" || payload === null) return false

  const p = payload as Record<string, unknown>

  // Check required fields
  if (p.version !== 1) return false
  if (typeof p.createdAt !== "string") return false
  if (typeof p.updatedAt !== "string") return false
  if (!Array.isArray(p.lineEdits)) return false

  // Validate lineEdits array
  for (const edit of p.lineEdits) {
    if (typeof edit !== "object" || edit === null) return false
    const e = edit as Record<string, unknown>
    if (typeof e.lineId !== "string") return false
    if (!["skip", "modify", "section"].includes(e.action as string)) return false
  }

  return true
}

const getEdits = (songId: string) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { db } = yield* DbService

    const settings = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ settingsJson: userSongSettings.settingsJson })
          .from(userSongSettings)
          .where(
            and(
              eq(userSongSettings.userId, session.user.id),
              eq(userSongSettings.songProvider, SONG_PROVIDER),
              eq(userSongSettings.songId, songId),
            ),
          )
          .limit(1),
      catch: cause => new DatabaseError({ cause }),
    })

    const json = settings[0]?.settingsJson as SettingsJson | null
    const edits = json?.edits ?? null

    return { edits }
  })

const saveEdits = (songId: string, edits: unknown) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    // Validate edits payload
    if (edits !== null && !isValidEditPayload(edits)) {
      return yield* Effect.fail(new ValidationError({ message: "Invalid edits payload" }))
    }

    const { db } = yield* DbService

    const existing = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: userSongSettings.id, settingsJson: userSongSettings.settingsJson })
          .from(userSongSettings)
          .where(
            and(
              eq(userSongSettings.userId, session.user.id),
              eq(userSongSettings.songProvider, SONG_PROVIDER),
              eq(userSongSettings.songId, songId),
            ),
          )
          .limit(1),
      catch: cause => new DatabaseError({ cause }),
    })

    const existingRecord = existing[0]
    const currentJson = (existingRecord?.settingsJson as SettingsJson | null) ?? {}

    // Build updatedSettings without undefined values (required by exactOptionalPropertyTypes)
    const updatedSettings: SettingsJson = edits
      ? { ...currentJson, edits }
      : (() => {
          const { edits: _, ...rest } = currentJson
          return rest
        })()

    if (existingRecord) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(userSongSettings)
            .set({
              settingsJson: updatedSettings,
              updatedAt: new Date(),
            })
            .where(eq(userSongSettings.id, existingRecord.id)),
        catch: cause => new DatabaseError({ cause }),
      })
    } else {
      yield* Effect.tryPromise({
        try: () =>
          db.insert(userSongSettings).values({
            userId: session.user.id,
            songId,
            songProvider: SONG_PROVIDER,
            settingsJson: updatedSettings,
          }),
        catch: cause => new DatabaseError({ cause }),
      })
    }

    return { success: true }
  })

const deleteEdits = (songId: string) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { db } = yield* DbService

    const existing = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: userSongSettings.id, settingsJson: userSongSettings.settingsJson })
          .from(userSongSettings)
          .where(
            and(
              eq(userSongSettings.userId, session.user.id),
              eq(userSongSettings.songProvider, SONG_PROVIDER),
              eq(userSongSettings.songId, songId),
            ),
          )
          .limit(1),
      catch: cause => new DatabaseError({ cause }),
    })

    const existingRecord = existing[0]
    if (!existingRecord) {
      return { success: true }
    }

    const currentJson = (existingRecord.settingsJson as SettingsJson | null) ?? {}

    // Remove edits from settingsJson, keep other settings
    const { edits: _, ...rest } = currentJson
    const updatedSettings = Object.keys(rest).length > 0 ? rest : null

    if (updatedSettings) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(userSongSettings)
            .set({
              settingsJson: updatedSettings,
              updatedAt: new Date(),
            })
            .where(eq(userSongSettings.id, existingRecord.id)),
        catch: cause => new DatabaseError({ cause }),
      })
    } else {
      // If no other settings remain, clear the settingsJson
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(userSongSettings)
            .set({
              settingsJson: null,
              updatedAt: new Date(),
            })
            .where(eq(userSongSettings.id, existingRecord.id)),
        catch: cause => new DatabaseError({ cause }),
      })
    }

    return { success: true }
  })

export async function GET(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params

  const exit = await Effect.runPromiseExit(getEdits(songId).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to get song edits", exit.cause)
    return NextResponse.json({ error: "Failed to get song edits" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function PUT(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params

  const body = await request.json().catch(() => ({}))
  const edits = body.edits

  const exit = await Effect.runPromiseExit(saveEdits(songId, edits).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (cause.error instanceof ValidationError) {
        return NextResponse.json({ error: cause.error.message }, { status: 400 })
      }
    }
    console.error("Failed to save song edits", exit.cause)
    return NextResponse.json({ error: "Failed to save song edits" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ songId: string }> },
) {
  const { songId } = await params

  const exit = await Effect.runPromiseExit(deleteEdits(songId).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to delete song edits", exit.cause)
    return NextResponse.json({ error: "Failed to delete song edits" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
