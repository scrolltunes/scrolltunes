# User Accounts Specification

> Comprehensive specification for optional user accounts in ScrollTunes

**Status:** Draft  
**Created:** December 2025  
**Author:** Amp

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Non-Goals](#goals--non-goals)
3. [Architecture](#architecture)
4. [Data Model](#data-model)
5. [Authentication](#authentication)
6. [API Routes](#api-routes)
7. [Client Integration](#client-integration)
8. [Privacy & Compliance](#privacy--compliance)
9. [Security](#security)
10. [UI/UX](#uiux)
11. [Legal Amendments](#legal-amendments)
12. [Implementation Plan](#implementation-plan)
13. [Corner Cases](#corner-cases)
14. [Future Considerations](#future-considerations)

---

## Overview

ScrollTunes is adding optional user accounts to enable cross-device sync for history, favorites, and per-song settings. The core privacy-first experience remains intact — users can continue using the app without an account, with all data stored locally in the browser.

### Key Principles

- **Opt-in only**: Accounts are optional; anonymous usage remains fully supported
- **Minimal data**: Collect only what's necessary for sync functionality
- **User control**: Full export and deletion capabilities (GDPR compliant)
- **Transparent consent**: Clear explanation of what data is collected before signup

---

## Goals & Non-Goals

### Goals

- Enable cross-device sync for history, favorites, and per-song settings
- Support setlists for organizing songs by event/gig (e.g., "Rock Show", "Open Mic Night")
- Track song popularity (play count) for sorting and recommendations
- Support social login (Google, Spotify)
- Store Spotify OAuth tokens for future integration
- Maintain GDPR compliance with export/delete capabilities
- Keep anonymous experience intact and fully functional

### Non-Goals (for v1)

- Email/password authentication
- User-generated content (playlists, shared setlists)
- Real-time multi-device sync (eventual consistency is acceptable)
- Premium/paid tiers
- Admin dashboard

---

## Architecture

### Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Auth Library** | Auth.js (NextAuth) v5 | Best Next.js App Router support, OAuth handling, mature ecosystem |
| **Database** | Vercel Postgres | Native Vercel integration, relational queries for GDPR ops |
| **ORM** | Drizzle | Type-safe, lightweight, good Vercel Postgres support |
| **Session Strategy** | JWT in HttpOnly cookie | Stateless, no session table needed |
| **Rate Limiting** | Upstash Redis | Already in use for BPM rate limiting |

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client                                   │
├─────────────────────────────────────────────────────────────────┤
│  localStorage (anonymous)     │    Session (logged in)          │
│  - Recent songs               │    - JWT cookie (HttpOnly)      │
│  - Favorites                  │    - User ID in session         │
│  - Per-song settings          │                                 │
│  - Preferences                │                                 │
└───────────────┬───────────────┴─────────────┬───────────────────┘
                │                             │
                │  Sync on login              │  API calls
                │  ◄─────────────►            │  ◄───────────►
                ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Routes                                  │
│  /api/auth/[...nextauth]  - Auth.js handlers                    │
│  /api/user/me             - Get user profile                    │
│  /api/user/history/sync   - Sync song history                   │
│  /api/user/favorites/sync - Sync favorites                      │
│  /api/user/song-settings  - Per-song settings                   │
│  /api/user/export         - GDPR data export                    │
│  /api/user/delete         - Account deletion                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel Postgres                               │
│  - User (Auth.js)           - user_song_items                   │
│  - Account (Auth.js)        - user_song_settings                │
│  - app_user_profiles        - user_spotify_tokens (future)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Database Schema

#### Auth.js Tables (managed by adapter)

```sql
-- These are created/managed by Auth.js Drizzle adapter
-- User, Account, Session, VerificationToken
```

#### Application Tables

```sql
-- User profile extension (1:1 with Auth.js User)
CREATE TABLE app_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  display_name TEXT,
  consent_version TEXT NOT NULL,       -- e.g., "2025-accounts-v1"
  consent_given_at TIMESTAMPTZ NOT NULL,
  gdpr_export_email TEXT,              -- where exports are sent
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Combined history + favorites table
CREATE TABLE user_song_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  
  -- Song identity
  song_id TEXT NOT NULL,               -- LRCLIB ID or future provider IDs
  song_provider TEXT NOT NULL,         -- 'lrclib', 'spotify', 'custom'
  song_title TEXT NOT NULL,
  song_artist TEXT NOT NULL,
  song_album TEXT,
  song_duration_ms INT,
  
  -- Behavior flags
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  in_history BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- History details
  first_played_at TIMESTAMPTZ,
  last_played_at TIMESTAMPTZ,
  play_count INT NOT NULL DEFAULT 0,
  
  -- Soft delete
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (user_id, song_provider, song_id)
);

CREATE INDEX idx_user_song_items_user_id ON user_song_items(user_id);
CREATE INDEX idx_user_song_items_favorite ON user_song_items(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX idx_user_song_items_history ON user_song_items(user_id, in_history, last_played_at DESC) WHERE in_history = TRUE;

-- Per-song settings (transpose, capo, notes)
CREATE TABLE user_song_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  song_provider TEXT NOT NULL,
  
  transpose_semitones INT,
  capo_fret INT,
  notes TEXT,                          -- User notes (key, performance tips)
  tempo_multiplier REAL,               -- Custom tempo override (0.5 to 2.0)
  settings_json JSONB,                 -- Forward-compatible blob
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (user_id, song_provider, song_id)
);

-- User setlists for organizing songs by event/gig
CREATE TABLE user_setlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- e.g., "Rock Show", "Jamming with Friends"
  description TEXT,
  color TEXT,                          -- Optional color for UI (hex)
  icon TEXT,                           -- Optional icon identifier
  sort_order INT NOT NULL DEFAULT 0,   -- User-defined ordering
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_setlists_user_id ON user_setlists(user_id, sort_order);

-- Junction table for setlist songs (ordered)
CREATE TABLE user_setlist_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id UUID NOT NULL REFERENCES user_setlists(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  song_provider TEXT NOT NULL,
  song_title TEXT NOT NULL,            -- Denormalized for quick display
  song_artist TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,   -- Order within setlist
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (setlist_id, song_provider, song_id)
);

CREATE INDEX idx_user_setlist_songs_setlist ON user_setlist_songs(setlist_id, sort_order);

-- Spotify OAuth tokens (for future Spotify integration)
CREATE TABLE user_spotify_tokens (
  user_id UUID PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  token_type TEXT,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### TypeScript Types

```typescript
// src/lib/db/types.ts

export interface AppUserProfile {
  userId: string
  displayName: string | null
  consentVersion: string
  consentGivenAt: Date
  gdprExportEmail: string | null
  createdAt: Date
  updatedAt: Date
}

export interface UserSongItem {
  id: string
  userId: string
  songId: string
  songProvider: "lrclib" | "spotify" | "custom"
  songTitle: string
  songArtist: string
  songAlbum: string | null
  songDurationMs: number | null
  isFavorite: boolean
  inHistory: boolean
  firstPlayedAt: Date | null
  lastPlayedAt: Date | null
  playCount: number
  deleted: boolean
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface UserSongSettings {
  id: string
  userId: string
  songId: string
  songProvider: string
  transposeSemitones: number | null
  capoFret: number | null
  notes: string | null
  tempoMultiplier: number | null
  settingsJson: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface UserSetlist {
  id: string
  userId: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface UserSetlistSong {
  id: string
  setlistId: string
  songId: string
  songProvider: "lrclib" | "spotify" | "custom"
  songTitle: string
  songArtist: string
  sortOrder: number
  addedAt: Date
}

export interface UserSpotifyTokens {
  userId: string
  accessTokenEncrypted: string
  refreshTokenEncrypted: string
  expiresAt: Date
  scope: string | null
  tokenType: string | null
  obtainedAt: Date
  updatedAt: Date
}
```

---

## Authentication

### OAuth Providers

#### Google

- **Use case**: Primary login option
- **Scopes**: `openid email profile`
- **No additional API access needed**

#### Spotify

- **Use case**: Login + future Spotify integration
- **Scopes for login**: `user-read-email user-read-private`
- **Extended scopes (future)**: `user-library-read playlist-read-private`
- **Token storage**: Encrypted in `user_spotify_tokens` table

### Auth.js Configuration

```typescript
// src/auth.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Spotify from "next-auth/providers/spotify"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "user-read-email user-read-private",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
      }
      if (account?.provider === "spotify") {
        // Store Spotify tokens for future use
        token.spotifyAccessToken = account.access_token
        token.spotifyRefreshToken = account.refresh_token
        token.spotifyExpiresAt = account.expires_at
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (isNewUser && user.id) {
        // Create app_user_profiles row
        await createUserProfile(user.id)
      }
      if (account?.provider === "spotify" && user.id) {
        // Store Spotify tokens
        await storeSpotifyTokens(user.id, account)
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})
```

### Environment Variables

```bash
# .env.local (add to .env.example)

# Auth.js
AUTH_SECRET=                          # openssl rand -base64 32
AUTH_URL=http://localhost:3000        # Production: https://scrolltunes.com

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Spotify OAuth
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Database
POSTGRES_URL=                         # Vercel Postgres connection string

# Token encryption
TOKEN_ENCRYPTION_KEY=                 # openssl rand -hex 32
```

---

## API Routes

### Authentication Utilities

```typescript
// src/lib/auth-utils.ts
import { auth } from "@/auth"
import { Effect } from "effect"

export class AuthError extends Error {
  readonly _tag = "AuthError"
}

export const getCurrentUser = () =>
  Effect.tryPromise({
    try: async () => {
      const session = await auth()
      return session?.user ?? null
    },
    catch: () => new AuthError("Failed to get session"),
  })

export const requireAuth = () =>
  Effect.flatMap(getCurrentUser(), (user) =>
    user
      ? Effect.succeed(user)
      : Effect.fail(new AuthError("Authentication required"))
  )
```

### Route Handlers

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/[...nextauth]` | ALL | Auth.js handlers |
| `/api/user/me` | GET | Get user profile and preferences |
| `/api/user/history/sync` | POST | Sync song history |
| `/api/user/history` | DELETE | Clear all history |
| `/api/user/favorites/sync` | POST | Sync favorites |
| `/api/user/favorites/[songId]` | DELETE | Remove specific favorite |
| `/api/user/song-settings` | GET/POST | Get/update per-song settings |
| `/api/user/setlists` | GET/POST | List/create setlists |
| `/api/user/setlists/[id]` | GET/PATCH/DELETE | Get/update/delete setlist |
| `/api/user/setlists/[id]/songs` | GET/POST | List/add songs to setlist |
| `/api/user/setlists/[id]/songs/[songId]` | DELETE | Remove song from setlist |
| `/api/user/setlists/[id]/reorder` | POST | Reorder songs in setlist |
| `/api/user/export` | GET | Download all user data (JSON) |
| `/api/user/delete` | POST | Delete account and all data |

### Request/Response Types

```typescript
// src/lib/api/types.ts

// POST /api/user/history/sync
export interface HistorySyncRequest {
  songs: Array<{
    songId: string
    songProvider: "lrclib" | "spotify" | "custom"
    title: string
    artist: string
    album?: string
    durationMs?: number
    lastPlayedAt: string   // ISO 8601
    playCount?: number
  }>
}

export interface HistorySyncResponse {
  history: Array<{
    songId: string
    songProvider: string
    title: string
    artist: string
    lastPlayedAt: string
    playCount: number
  }>
}

// POST /api/user/favorites/sync
export interface FavoritesSyncRequest {
  favorites: Array<{
    songId: string
    songProvider: "lrclib" | "spotify" | "custom"
    title: string
    artist: string
    album?: string
  }>
}

// GET/POST /api/user/song-settings
export interface SongSettingsRequest {
  songId: string
  songProvider: "lrclib" | "spotify" | "custom"
  transposeSemitones?: number
  capoFret?: number
  notes?: string
  tempoMultiplier?: number
}

// POST /api/user/setlists
export interface CreateSetlistRequest {
  name: string
  description?: string
  color?: string
  icon?: string
}

// PATCH /api/user/setlists/[id]
export interface UpdateSetlistRequest {
  name?: string
  description?: string
  color?: string
  icon?: string
  sortOrder?: number
}

// POST /api/user/setlists/[id]/songs
export interface AddSetlistSongRequest {
  songId: string
  songProvider: "lrclib" | "spotify" | "custom"
  title: string
  artist: string
}

// POST /api/user/setlists/[id]/reorder
export interface ReorderSetlistSongsRequest {
  songIds: string[]  // Ordered array of song IDs
}

// GET /api/user/export
export interface UserDataExport {
  generatedAt: string
  user: {
    id: string
    email: string
    name: string | null
    image: string | null
    createdAt: string
  }
  profile: {
    consentVersion: string
    consentGivenAt: string
  }
  songHistory: Array<{...}>
  favorites: Array<{...}>
  songSettings: Array<{...}>
  setlists: Array<{
    id: string
    name: string
    description: string | null
    color: string | null
    songs: Array<{...}>
  }>
  integrations: {
    spotify: {
      connected: boolean
      scopes: string | null
      lastUpdatedAt: string | null
    } | null
  }
}

// POST /api/user/delete
export interface DeleteAccountRequest {
  confirm: "DELETE"
}
```

### Rate Limiting

```typescript
// Rate limits per user (using existing Upstash Redis)
const rateLimits = {
  "history/sync": { requests: 30, window: "1m" },
  "favorites/sync": { requests: 30, window: "1m" },
  "song-settings": { requests: 60, window: "1m" },
  "export": { requests: 3, window: "24h" },
  "delete": { requests: 3, window: "24h" },
}
```

---

## Client Integration

### Sync Strategy

1. **Anonymous users**: Continue using localStorage only
2. **Logged-in users**: Dual storage (localStorage + server)
3. **Server is source of truth** for logged-in users

### On First Login (Merge Flow)

```typescript
// src/core/AccountSyncStore.ts

async function onFirstLogin() {
  // 1. Get current localStorage data
  const localHistory = recentSongsStore.getSongs()
  const localFavorites = favoritesStore.getFavorites()
  const localSettings = getAllSongSettings()

  // 2. Push to server
  await fetch("/api/user/history/sync", {
    method: "POST",
    body: JSON.stringify({ songs: localHistory }),
  })
  await fetch("/api/user/favorites/sync", {
    method: "POST",
    body: JSON.stringify({ favorites: localFavorites }),
  })
  for (const settings of localSettings) {
    await fetch("/api/user/song-settings", {
      method: "POST",
      body: JSON.stringify(settings),
    })
  }

  // 3. Fetch server state and update localStorage
  const serverData = await fetch("/api/user/me").then(r => r.json())
  // Update localStorage with merged data
  recentSongsStore.replaceAll(serverData.history)
  favoritesStore.replaceAll(serverData.favorites)
}
```

### Ongoing Sync

```typescript
// When user plays a song (logged in)
async function onSongPlayed(song: Song) {
  // 1. Update localStorage immediately (for instant UX)
  recentSongsStore.addSong(song)
  
  // 2. Sync to server (fire and forget, with retry)
  syncQueue.add(() => 
    fetch("/api/user/history/sync", {
      method: "POST",
      body: JSON.stringify({ songs: [song] }),
    })
  )
}
```

### Store Pattern

```typescript
// src/core/AccountStore.ts
import { useSyncExternalStore } from "react"

interface AccountState {
  isLoggedIn: boolean
  user: User | null
  isSyncing: boolean
  lastSyncAt: Date | null
}

class AccountStore {
  private listeners = new Set<() => void>()
  private state: AccountState = {
    isLoggedIn: false,
    user: null,
    isSyncing: false,
    lastSyncAt: null,
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  // ... methods
}

export const accountStore = new AccountStore()

export function useAccount() {
  return useSyncExternalStore(
    accountStore.subscribe,
    accountStore.getSnapshot,
    accountStore.getSnapshot
  )
}
```

---

## Privacy & Compliance

### GDPR Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Right to Access** | `/api/user/export` endpoint |
| **Right to Portability** | JSON export with all data |
| **Right to Erasure** | `/api/user/delete` endpoint |
| **Consent** | Explicit checkbox before OAuth flow |
| **Data Minimization** | Only store sync-essential data |
| **Transparency** | Updated Privacy Policy |

### Consent Flow

1. User clicks "Sign in"
2. Modal appears with:
   - Explanation of what data will be stored
   - Checkbox: "I agree to the Privacy Policy and Terms of Service"
3. Only after checking, OAuth buttons become enabled
4. Consent version and timestamp stored in `app_user_profiles`

### Data Retention

- **Active accounts**: Data retained indefinitely
- **Deleted accounts**: Data hard-deleted within 24 hours
- **Soft-deleted history**: Retained 30 days, then hard-deleted

### Data Processors

Document these in Privacy Policy:

- Vercel (hosting, database)
- Upstash (rate limiting)
- Google (OAuth provider)
- Spotify (OAuth provider)

---

## Security

### Token Encryption

```typescript
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, "hex")

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString("base64")
}

export function decryptToken(ciphertext: string): string {
  const data = Buffer.from(ciphertext, "base64")
  const iv = data.subarray(0, 12)
  const authTag = data.subarray(12, 28)
  const encrypted = data.subarray(28)
  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8")
}
```

### Security Measures

- JWT sessions in HttpOnly, Secure, SameSite=Strict cookies
- Spotify tokens encrypted at rest
- Rate limiting on all user endpoints
- CSRF protection via Auth.js
- Input validation on all API routes
- No PII in Redis keys (only user IDs)

---

## UI/UX

### Entry Points

1. **Header**: User avatar or "Sign in" button
2. **Settings page**: "Account & Sync" section
3. **First song play (optional)**: "Sign in to sync across devices" prompt

### Feature Comparison Screen (Optional — A/B Test)

> **Note:** This screen may be too overwhelming. A/B test to determine if it 
> improves or hurts conversion. Alternative: skip directly to login flow.

Before showing login options, display a comparison of free vs account features:

```
┌───────────────────────────────────────────────────────────────────┐
│                    ScrollTunes is free forever                     │
│              Create an account to unlock more features             │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────┐    ┌─────────────────────────┐       │
│  │      FREE               │    │      WITH ACCOUNT       │       │
│  │      No signup needed   │    │      Sign in to unlock  │       │
│  ├─────────────────────────┤    ├─────────────────────────┤       │
│  │                         │    │                         │       │
│  │  ✓ Voice-activated      │    │  ✓ Everything in Free   │       │
│  │    scrolling            │    │                         │       │
│  │                         │    │  ✓ Sync across devices  │       │
│  │  ✓ Tempo controls       │    │                         │       │
│  │                         │    │  ✓ Unlimited history    │       │
│  │  ✓ Search any song      │    │                         │       │
│  │                         │    │  ✓ Favorites            │       │
│  │  ✓ Recent songs         │    │                         │       │
│  │    (this device only)   │    │  ✓ Setlists for gigs    │       │
│  │                         │    │                         │       │
│  │  ✓ Metronome            │    │  ✓ Per-song settings    │       │
│  │                         │    │    (transpose, capo,    │       │
│  │  ✓ Wake lock            │    │     notes)              │       │
│  │                         │    │                         │       │
│  │  ✓ Keyboard shortcuts   │    │  ✓ Spotify integration  │       │
│  │                         │    │    (coming soon)        │       │
│  │  ✓ No tracking          │    │                         │       │
│  │                         │    │  ✓ Smart search         │       │
│  │                         │    │    (coming soon)        │       │
│  └─────────────────────────┘    └─────────────────────────┘       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                  Create an account                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│                    Continue without account                       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Login Flow (after choosing "Create an account")

```
┌─────────────────────────────────────────────┐
│            Sign in to ScrollTunes            │
├─────────────────────────────────────────────┤
│                                             │
│  By creating an account, you agree to:      │
│                                             │
│  • Storage of your song history, favorites, │
│    and settings on our servers              │
│  • Use of cookies for authentication        │
│  • Analytics to help improve ScrollTunes    │
│  • Processing by third-party services       │
│                                             │
│  See our Privacy Policy and Terms of        │
│  Service for full details.                  │
│                                             │
│  ☐ I agree to the Privacy Policy and        │
│    Terms of Service                         │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │    Continue with Google             │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │    Continue with Spotify            │    │
│  └─────────────────────────────────────┘    │
│                                             │
│              ← Back                         │
│                                             │
└─────────────────────────────────────────────┘
```

### Settings Page (Logged In)

```
Account & Sync
────────────────────────────────────────────
┌─────────────────────────────────────────────┐
│ 👤 John Doe                                 │
│ john@example.com                            │
│                                             │
│ Signed in with Google                       │
│ Last synced: 2 minutes ago                  │
└─────────────────────────────────────────────┘

[Export my data]  [Sign out]

────────────────────────────────────────────
Danger Zone

[Delete my account]
This will permanently delete your account and
all associated data. This action cannot be undone.
```

### Account Deletion Confirmation

```
┌─────────────────────────────────────────────┐
│         Delete your account?                 │
├─────────────────────────────────────────────┤
│                                             │
│  This will permanently delete:              │
│  • Your account and profile                 │
│  • Your song history                        │
│  • Your favorites                           │
│  • Your per-song settings                   │
│  • Any connected integrations               │
│                                             │
│  This action cannot be undone.              │
│                                             │
│  Type DELETE to confirm:                    │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Cancel]              [Delete my account]  │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Legal Amendments

### Two-Tier Privacy Model

ScrollTunes operates with a clear distinction between anonymous and account users:

| Aspect | Anonymous Users | Account Users |
|--------|-----------------|---------------|
| Data storage | Browser only (localStorage) | Server + browser |
| Analytics | None | Usage analytics (opt-in via account creation) |
| Tracking | None | Account-level activity tracking |
| Cookies | None | Session cookie for auth |
| Third-party processing | Lyrics/BPM APIs only | + Google Analytics, LLM services |
| Microphone | Local VAD only | Local VAD only (never recorded) |

### Privacy Policy Additions

Add new section **"Accounts and Synced Data"** after "Overview":

```markdown
## Accounts and Synced Data

ScrollTunes can be used without creating an account. When you use ScrollTunes 
anonymously, we do not store any usage data on our servers, do not use cookies, 
and do not track your activity. Your settings, history, and favorites stay 
entirely in your browser's local storage.

### What Changes When You Create an Account

If you choose to create an account, you consent to the following data collection 
and processing:

**Data We Store**

- **Account information:** Your name, email address, and profile image, as 
  provided by your login provider (Google or Spotify).
- **Song activity:** A list of songs you have played, including title, artist, 
  and basic metadata. We store timestamps, play counts, and setlist organization.
- **Favorites and settings:** Which songs you have marked as favorites and 
  any per-song settings (tempo, transpose, capo position, notes).
- **Setlists:** Custom song groupings you create for performances.
- **Integration data:** If you connect your Spotify account, we store encrypted 
  tokens to communicate with Spotify on your behalf.

**Analytics and Tracking**

When you create an account, we collect anonymized usage analytics to improve 
ScrollTunes, including:
- Features you use and how often
- Performance metrics and error reports
- General usage patterns

We use third-party analytics services (such as Google Analytics) that may set 
cookies and collect data about your use of ScrollTunes. This tracking is 
**only enabled for account holders** who have consented by creating an account.

**AI and LLM Processing**

We may use third-party AI services (such as Google Cloud AI or OpenAI) for 
features like:
- Smart search suggestions
- Lyrics correction or enhancement
- Personalized recommendations

When you use these features, relevant data (such as search queries or song 
metadata) may be sent to these services for processing. We do not send your 
personal information or microphone audio to AI services.

**What We Never Do**

- We do **not** record or store any microphone audio. Microphone access is 
  used only locally in your browser for voice detection.
- We do **not** sell your personal data to third parties.
- We do **not** use your data for advertising or marketing purposes.

### Legal Basis

When you create an account, our legal basis for processing your personal data 
is your **consent** (GDPR Article 6(1)(a)). By creating an account, you 
explicitly agree to:
- Storage of your account and activity data on our servers
- Use of analytics cookies and tracking
- Processing by third-party services as described above

You may withdraw consent at any time by deleting your account.

### Data Retention

We retain your account data for as long as your account is active. When you 
delete your account, we delete your personal data from our active systems 
without undue delay, typically within 30 days.

### Your Rights

If you are in the EU, UK, or similar jurisdiction, you have the right to:
- Access the personal data we hold about you
- Request a copy of your data in a portable format (JSON export)
- Request correction or deletion of your data
- Withdraw your consent for future processing
- Object to processing based on legitimate interests

You can export your data and delete your account from the app's settings, 
or by contacting us at hello@scrolltunes.com.

### Data Processors

We use third-party services to host and operate ScrollTunes:

**For all users (anonymous and account holders):**
- Vercel (hosting)
- LRCLIB (lyrics)
- GetSongBPM (tempo data)

**For account holders only:**
- Vercel Postgres (database)
- Upstash Redis (rate limiting)
- Google and Spotify (authentication)
- Google Analytics (usage analytics)
- AI/LLM services (smart features, when used)

These providers act as data processors on our behalf. We only share the 
minimum information necessary to operate ScrollTunes.
```

Update existing **Overview** section:

```markdown
## Overview

ScrollTunes is built with privacy as a core principle.

**Anonymous users** can use ScrollTunes without creating an account. We do not 
store any data on our servers, do not use cookies, and do not track your 
activity. Everything stays in your browser.

**Account holders** who choose to sign in consent to data collection as 
described in "Accounts and Synced Data" below, including server-side storage, 
analytics, and third-party processing.
```

### Terms of Service Additions

Add new section **"Accounts"**:

```markdown
## Accounts

You are not required to create an account to use ScrollTunes. The core 
functionality is available to all users without registration.

### Creating an Account

By creating an account, you agree to:
- The collection and processing of your data as described in our Privacy Policy
- The use of cookies for authentication and analytics
- Processing of your data by third-party services (analytics, AI features)

You are responsible for maintaining the confidentiality of your login 
credentials and for any activity that occurs under your account.

### Account Termination

We may suspend or terminate your account if you:
- Violate these Terms of Service
- Engage in abuse, fraud, or activities that harm other users
- Create security risks for ScrollTunes or its users

You may delete your account at any time from the app's settings. Deleting 
your account will remove your personal data from our systems, as described 
in our Privacy Policy.

### Data and Privacy

Account creation requires explicit consent to our data collection practices. 
Anonymous use of ScrollTunes does not require any such consent and involves 
no server-side data storage or tracking.
```

### Cookie Policy

Add new section:

```markdown
## Cookies

### Anonymous Users

If you use ScrollTunes without an account, we do not set any cookies. Your 
data is stored only in your browser's localStorage.

### Account Holders

If you sign in to ScrollTunes, we use the following cookies:

- **Authentication cookie:** A secure, HTTP-only session cookie that keeps 
  you logged in. This cookie is essential for the service to function and 
  does not track you across other sites.

- **Analytics cookies:** We use Google Analytics to understand how account 
  holders use ScrollTunes. These cookies collect anonymized usage data. You 
  can opt out of Google Analytics by installing the 
  [Google Analytics Opt-out Browser Add-on](https://tools.google.com/dlpage/gaoptout).

We do not use cookies for advertising or cross-site tracking.

### Managing Cookies

You can disable cookies in your browser settings. If you disable cookies:
- You will not be able to sign in to ScrollTunes
- You can still use ScrollTunes anonymously with full functionality
```

### About Page Updates

Update "Privacy First" section:

```markdown
## Privacy First

**Without an account:**
- No server-side data storage — everything stays in your browser
- No cookies, no tracking, no analytics
- Microphone used for voice detection only — never recorded

**With an account:**
- We store your songs, favorites, and setlists to sync across devices
- We use analytics to improve ScrollTunes (you consent when signing up)
- We use a session cookie to keep you logged in
- Microphone is still never recorded — voice detection runs locally

**Always:**
- No advertising or marketing trackers
- No selling of your data
- You control your data — export or delete anytime
```

---

## Implementation Plan

### Phase 1: Infrastructure (Week 1)

1. Set up Vercel Postgres database
2. Configure Drizzle ORM with schema
3. Set up Auth.js with Google provider
4. Create basic API routes (`/api/user/me`)
5. Add authentication middleware

### Phase 2: Core Sync (Week 2)

1. Implement history sync API
2. Implement favorites sync API
3. Create `AccountStore` on client
4. Build merge logic for first login
5. Wire up ongoing sync

### Phase 3: UI (Week 3)

1. Create `/login` page with consent flow
2. Add account section to Settings page
3. Add user avatar to header
4. Build export and delete account flows

### Phase 4: Polish & Compliance (Week 4)

1. Add Spotify OAuth provider
2. Implement token encryption
3. Update Privacy Policy and Terms
4. Update About page
5. Add rate limiting to all endpoints
6. Write tests

### Phase 5: Per-Song Settings (Week 5)

1. Implement song settings API
2. Wire up to existing tempo preference
3. Prepare for future chords integration

---

## Corner Cases

### Data Merge Conflicts

| Scenario | Resolution |
|----------|------------|
| Same song in local and server history | Use `MAX(lastPlayedAt)`, sum play counts |
| Local favorite not in server | Add to server |
| Server favorite not in local | Add to local |
| Different settings for same song | Server wins (most recent `updatedAt`) |

### Authentication Edge Cases

| Scenario | Handling |
|----------|----------|
| OAuth popup blocked | Show error with retry button |
| Google/Spotify account email mismatch | Create separate accounts (no auto-merge) |
| Token expires during session | Auth.js handles refresh automatically |
| User revokes OAuth access externally | Graceful logout on next API call |

### Account Deletion

| Scenario | Handling |
|----------|----------|
| User deletes account | Hard delete all DB rows, clear localStorage |
| Concurrent requests during deletion | Queue deletion, reject new requests |
| Spotify integration active | Delete tokens, revoke access if possible |

### Network Issues

| Scenario | Handling |
|----------|----------|
| Sync fails | Retry with exponential backoff, show toast |
| Offline | Skip sync, use localStorage, sync on reconnect |
| Rate limited | Backoff, queue requests |

---

## Future Considerations

### Spotify Integration (V3)

- Use stored tokens for personalized search
- Import Spotify playlists as setlists
- Display album art from Spotify

### Real-time Sync

- WebSocket for instant multi-device updates
- Conflict resolution for concurrent edits

### Collaborative Features

- Shared setlists
- Jam session sync

### Premium Tier

- Extended history (unlimited)
- Priority API access
- Offline mode with sync

---

## File Structure

```
src/
├── auth.ts                          # Auth.js configuration
├── lib/
│   ├── db/
│   │   ├── index.ts                # Drizzle client
│   │   ├── schema.ts               # Database schema
│   │   └── types.ts                # TypeScript types
│   ├── auth-utils.ts               # Auth helpers
│   └── crypto.ts                   # Token encryption
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts        # Auth.js handlers
│   │   └── user/
│   │       ├── me/
│   │       │   └── route.ts
│   │       ├── history/
│   │       │   └── sync/
│   │       │       └── route.ts
│   │       ├── favorites/
│   │       │   └── sync/
│   │       │       └── route.ts
│   │       ├── song-settings/
│   │       │   └── route.ts
│   │       ├── export/
│   │       │   └── route.ts
│   │       └── delete/
│   │           └── route.ts
│   └── login/
│       └── page.tsx                # Login page with consent
├── core/
│   └── AccountStore.ts             # Account state management
└── components/
    └── auth/
        ├── LoginModal.tsx
        ├── UserMenu.tsx
        └── AccountSettings.tsx
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "next-auth": "^5.0.0-beta.25",
    "@auth/drizzle-adapter": "^1.7.0",
    "drizzle-orm": "^0.37.0",
    "@neondatabase/serverless": "^0.10.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0"
  }
}
```

Note: Using `@neondatabase/serverless` driver which works with Vercel Postgres.

---

## Open Questions

1. **Email verification**: Should we require email verification for accounts?
   - Recommendation: No, social login providers already verify emails

2. **Account linking**: Should users be able to link multiple OAuth providers?
   - Recommendation: Yes, in V2 (not MVP)

3. **History limits**: Should we limit history size for free accounts?
   - Recommendation: No limits for MVP, revisit if storage costs become an issue

4. **Export format**: JSON only or also CSV?
   - Recommendation: JSON only for MVP, structured and complete

---

*This specification is a living document. Update as implementation progresses.*
