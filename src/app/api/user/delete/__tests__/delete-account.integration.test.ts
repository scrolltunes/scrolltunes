import { db } from "@/lib/db"
import {
  accounts,
  appUserProfiles,
  sessions,
  userSetlistSongs,
  userSetlists,
  userSongItems,
  userSongSettings,
  users,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

describe("Account deletion integration", () => {
  const testUserId = crypto.randomUUID()
  const testEmail = `test-${testUserId}@scrolltunes-test.com`

  beforeAll(async () => {
    await db.insert(users).values({
      id: testUserId,
      name: "Test User",
      email: testEmail,
    })

    await db.insert(accounts).values({
      userId: testUserId,
      type: "oauth",
      provider: "google",
      providerAccountId: `google-${testUserId}`,
    })

    await db.insert(appUserProfiles).values({
      userId: testUserId,
      consentVersion: "2025-accounts-v1",
      consentGivenAt: new Date(),
    })

    await db.insert(userSongItems).values({
      userId: testUserId,
      songId: "test-song-123",
      songProvider: "lrclib",
      songTitle: "Test Song",
      songArtist: "Test Artist",
      isFavorite: true,
      inHistory: true,
    })

    await db.insert(userSongSettings).values({
      userId: testUserId,
      songId: "test-song-123",
      songProvider: "lrclib",
      transposeSemitones: 2,
    })

    const [setlist] = await db
      .insert(userSetlists)
      .values({
        userId: testUserId,
        name: "Test Setlist",
      })
      .returning()

    if (setlist) {
      await db.insert(userSetlistSongs).values({
        setlistId: setlist.id,
        songId: "test-song-456",
        songProvider: "lrclib",
        songTitle: "Another Song",
        songArtist: "Another Artist",
      })
    }
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, testUserId))
  })

  it("should create user with all related data", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, testUserId),
    })
    expect(user).toBeDefined()
    expect(user?.email).toBe(testEmail)

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, testUserId),
    })
    expect(account).toBeDefined()
    expect(account?.provider).toBe("google")

    const profile = await db.query.appUserProfiles.findFirst({
      where: eq(appUserProfiles.userId, testUserId),
    })
    expect(profile).toBeDefined()

    const songItems = await db.query.userSongItems.findMany({
      where: eq(userSongItems.userId, testUserId),
    })
    expect(songItems).toHaveLength(1)

    const songSettings = await db.query.userSongSettings.findMany({
      where: eq(userSongSettings.userId, testUserId),
    })
    expect(songSettings).toHaveLength(1)

    const setlists = await db.query.userSetlists.findMany({
      where: eq(userSetlists.userId, testUserId),
    })
    expect(setlists).toHaveLength(1)
  })

  it("should delete user and cascade to all related data", async () => {
    await db.delete(users).where(eq(users.id, testUserId))

    const user = await db.query.users.findFirst({
      where: eq(users.id, testUserId),
    })
    expect(user).toBeUndefined()

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, testUserId),
    })
    expect(account).toBeUndefined()

    const profile = await db.query.appUserProfiles.findFirst({
      where: eq(appUserProfiles.userId, testUserId),
    })
    expect(profile).toBeUndefined()

    const songItems = await db.query.userSongItems.findMany({
      where: eq(userSongItems.userId, testUserId),
    })
    expect(songItems).toHaveLength(0)

    const songSettings = await db.query.userSongSettings.findMany({
      where: eq(userSongSettings.userId, testUserId),
    })
    expect(songSettings).toHaveLength(0)

    const setlists = await db.query.userSetlists.findMany({
      where: eq(userSetlists.userId, testUserId),
    })
    expect(setlists).toHaveLength(0)

    const sessions_ = await db.query.sessions.findMany({
      where: eq(sessions.userId, testUserId),
    })
    expect(sessions_).toHaveLength(0)
  })
})
