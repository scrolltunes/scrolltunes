import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import type { AdapterAccountType } from "next-auth/adapters"

// ============================================================================
// Auth.js Tables (standard schema)
// ============================================================================

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
})

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  account => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
    index("account_user_id_idx").on(account.userId),
  ],
)

export const sessions = pgTable(
  "session",
  {
    sessionToken: text("sessionToken").primaryKey(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  session => [index("session_user_id_idx").on(session.userId)],
)

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  verificationToken => [
    primaryKey({ columns: [verificationToken.identifier, verificationToken.token] }),
  ],
)

// ============================================================================
// Application Tables
// ============================================================================

export const appUserProfiles = pgTable("app_user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  consentVersion: text("consent_version").notNull(),
  consentGivenAt: timestamp("consent_given_at", { mode: "date", withTimezone: true }).notNull(),
  gdprExportEmail: text("gdpr_export_email"),
  preferencesJson: jsonb("preferences_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  isAdmin: boolean("is_admin").notNull().default(false),
})

export const userSongItems = pgTable(
  "user_song_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: text("song_id").notNull(),
    songProvider: text("song_provider").notNull(),
    songTitle: text("song_title").notNull(),
    songArtist: text("song_artist").notNull(),
    songAlbum: text("song_album"),
    songDurationMs: integer("song_duration_ms"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    inHistory: boolean("in_history").notNull().default(false),
    firstPlayedAt: timestamp("first_played_at", { mode: "date", withTimezone: true }),
    lastPlayedAt: timestamp("last_played_at", { mode: "date", withTimezone: true }),
    playCount: integer("play_count").notNull().default(0),
    deleted: boolean("deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex("user_song_items_user_provider_song_idx").on(
      table.userId,
      table.songProvider,
      table.songId,
    ),
    index("user_song_items_user_id_idx").on(table.userId),
    index("user_song_items_favorite_idx")
      .on(table.userId, table.isFavorite)
      .where(sql`is_favorite = TRUE`),
    index("user_song_items_history_idx")
      .on(table.userId, table.inHistory, table.lastPlayedAt)
      .where(sql`in_history = TRUE`),
  ],
)

export const userSongSettings = pgTable(
  "user_song_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: text("song_id").notNull(),
    songProvider: text("song_provider").notNull(),
    transposeSemitones: integer("transpose_semitones"),
    capoFret: integer("capo_fret"),
    notes: text("notes"),
    tempoMultiplier: real("tempo_multiplier"),
    settingsJson: jsonb("settings_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex("user_song_settings_user_provider_song_idx").on(
      table.userId,
      table.songProvider,
      table.songId,
    ),
    index("user_song_settings_user_id_idx").on(table.userId),
  ],
)

export const userSetlists = pgTable(
  "user_setlists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("user_setlists_user_id_idx").on(table.userId, table.sortOrder)],
)

export const userSetlistSongs = pgTable(
  "user_setlist_songs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setlistId: uuid("setlist_id")
      .notNull()
      .references(() => userSetlists.id, { onDelete: "cascade" }),
    songId: text("song_id").notNull(),
    songProvider: text("song_provider").notNull(),
    songTitle: text("song_title").notNull(),
    songArtist: text("song_artist").notNull(),
    songAlbum: text("song_album"),
    sortOrder: integer("sort_order").notNull().default(0),
    addedAt: timestamp("added_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex("user_setlist_songs_setlist_provider_song_idx").on(
      table.setlistId,
      table.songProvider,
      table.songId,
    ),
    index("user_setlist_songs_setlist_idx").on(table.setlistId, table.sortOrder),
  ],
)

export const userSpotifyTokens = pgTable("user_spotify_tokens", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  scope: text("scope"),
  tokenType: text("token_type"),
  obtainedAt: timestamp("obtained_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
})

// ============================================================================
// Type Exports
// ============================================================================

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

export type VerificationToken = typeof verificationTokens.$inferSelect
export type NewVerificationToken = typeof verificationTokens.$inferInsert

export type AppUserProfile = typeof appUserProfiles.$inferSelect
export type NewAppUserProfile = typeof appUserProfiles.$inferInsert

export type UserSongItem = typeof userSongItems.$inferSelect
export type NewUserSongItem = typeof userSongItems.$inferInsert

export type UserSongSettings = typeof userSongSettings.$inferSelect
export type NewUserSongSettings = typeof userSongSettings.$inferInsert

export type UserSetlist = typeof userSetlists.$inferSelect
export type NewUserSetlist = typeof userSetlists.$inferInsert

export type UserSetlistSong = typeof userSetlistSongs.$inferSelect
export type NewUserSetlistSong = typeof userSetlistSongs.$inferInsert

export type UserSpotifyTokens = typeof userSpotifyTokens.$inferSelect
export type NewUserSpotifyTokens = typeof userSpotifyTokens.$inferInsert
