# Design Doc: LRC Enhancement System (Web App)

> **Status:** Proposed

This document describes the **web-based LRC enhancement system** for ScrollTunes:
- Global song catalog with metadata (LRCLIB ID, Spotify ID, etc.)
- Admin panel for uploading Guitar Pro files
- Client-side GP parsing via alphaTab
- Word-level timing extraction from GP lyrics
- Enhancement of LRCLIB lyrics with word timestamps
- Patch storage in Postgres (Neon) linked to song catalog

---

## 0) High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Admin Panel                                  │
│  1. Select song (by LRCLIB ID or search)                            │
│  2. Upload Guitar Pro file (.gp, .gp3, .gp4, .gp5)                  │
│  3. Client-side parsing via alphaTab                                │
│  4. Preview extracted lyrics + timing alignment                     │
│  5. Submit enhancement patches to API                               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      POST /api/admin/lrc/enhance                    │
│  • Validate admin auth                                              │
│  • Fetch base LRC from LRCLIB API                                   │
│  • Build word-level enhancement patches                             │
│  • Store patches in Postgres                                        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Runtime (Player)                            │
│  1. Load base LRC from LRCLIB                                       │
│  2. Compute lrc_hash                                                │
│  3. Fetch enhancement bundle from /api/lrc/enhancement              │
│  4. Apply patches → word-level timing                               │
│  5. Render with per-word highlight                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1) alphaTab Integration

### 1.1 Browser Compatibility

alphaTab is fully compatible with Next.js/browser environments via ESM:

```bash
bun add @coderline/alphatab
```

### 1.2 Parsing Guitar Pro Files

```typescript
import { ScoreLoader } from "@coderline/alphatab"

async function parseGuitarProFile(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  // alphaTab auto-detects format (GP3-7)
  const score = ScoreLoader.loadScoreFromBytes(uint8Array)
  
  return {
    title: score.title,
    artist: score.artist,
    album: score.album,
    tempo: score.tempo,
    tracks: score.tracks,
    masterBars: score.masterBars,
  }
}
```

### 1.3 Supported Formats

| Format | Extension | Status |
|--------|-----------|--------|
| Guitar Pro 3 | `.gp3` | ❌ No lyrics support |
| Guitar Pro 4 | `.gp4` | ✅ Supported |
| Guitar Pro 5 | `.gp5` | ✅ Supported |
| Guitar Pro 6 | `.gpx` | ⚠️ alphaTab supported, needs testing |
| Guitar Pro 7/8 | `.gp` | ✅ Fully supported |

---

## 2) Lyrics & Timing Extraction

### 2.1 Data Model

```typescript
interface ExtractedLyrics {
  meta: {
    title: string
    artist: string
    album?: string
  }
  tempo: TempoEvent[]
  syllables: LyricSyllable[]
  durationMs: number
}

interface TempoEvent {
  tick: number      // MIDI tick position
  bpm: number       // Beats per minute
}

interface LyricSyllable {
  tick: number      // MIDI tick position
  text: string      // Syllable text (may end with "-" for continuation)
  sameBeat: boolean // True if shares beat with previous syllable
}

// Constants
const PPQ = 960  // Pulses per quarter note (alphaTab standard)
```

### 2.2 Extraction Algorithm

```typescript
import { Score, MasterBar, Beat, MidiUtils } from "@coderline/alphatab"

function extractLyrics(score: Score): ExtractedLyrics {
  const syllables: LyricSyllable[] = []
  const tempoEvents: TempoEvent[] = [{ tick: 0, bpm: score.tempo }]
  
  // Collect tempo changes from master bars
  for (const masterBar of score.masterBars) {
    for (const automation of masterBar.tempoAutomation ?? []) {
      tempoEvents.push({
        tick: masterBar.start + Math.floor(automation.ratioPosition * masterBar.calculateDuration()),
        bpm: automation.value,
      })
    }
  }
  
  // Walk through tracks to find lyrics
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      let currentTick = 0
      
      for (let barIdx = 0; barIdx < staff.bars.length; barIdx++) {
        const bar = staff.bars[barIdx]
        const masterBar = score.masterBars[barIdx]
        currentTick = masterBar.start
        
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            // Extract lyrics from this beat
            if (beat.lyrics && beat.lyrics.length > 0) {
              for (const lyricText of beat.lyrics) {
                if (lyricText.trim()) {
                  syllables.push({
                    tick: currentTick,
                    text: lyricText,
                    sameBeat: false, // alphaTab handles this differently
                  })
                }
              }
            }
            
            // Advance tick by beat duration
            const beatTicks = MidiUtils.toTicks(beat.duration)
            currentTick += beatTicks
          }
        }
      }
    }
    
    // Only process first track with lyrics
    if (syllables.length > 0) break
  }
  
  return {
    meta: {
      title: score.title || "",
      artist: score.artist || "",
      album: score.album,
    },
    tempo: tempoEvents.sort((a, b) => a.tick - b.tick),
    syllables,
    durationMs: tickToMs(score.masterBars.at(-1)?.start ?? 0, tempoEvents),
  }
}
```

### 2.3 Tick-to-Time Conversion

```typescript
function tickToMs(tick: number, tempoEvents: TempoEvent[]): number {
  let ms = 0
  let lastTick = 0
  let lastBpm = tempoEvents[0]?.bpm ?? 120
  
  for (const event of tempoEvents) {
    if (event.tick > tick) break
    
    const deltaTicks = event.tick - lastTick
    ms += ticksToMsAtBpm(deltaTicks, lastBpm)
    lastTick = event.tick
    lastBpm = event.bpm
  }
  
  const remainingTicks = tick - lastTick
  ms += ticksToMsAtBpm(remainingTicks, lastBpm)
  
  return ms
}

function ticksToMsAtBpm(ticks: number, bpm: number): number {
  // ms = ticks * (60000 / (bpm * PPQ))
  return ticks * 60000 / (bpm * PPQ)
}
```

### 2.4 Syllable Joining (Word Building)

Guitar Pro stores lyrics as syllables with continuation markers:
- `la-` = syllable continues to next
- `+word` = shares beat with previous (handled by `sameBeat`)

```typescript
interface WordTiming {
  startMs: number
  text: string
}

function buildWordTimings(
  syllables: LyricSyllable[],
  tempoEvents: TempoEvent[]
): WordTiming[] {
  const words: WordTiming[] = []
  let currentWord = ""
  let wordStartTick: number | null = null
  
  for (const syllable of syllables) {
    const text = syllable.text.trim()
    if (!text) continue
    
    if (wordStartTick === null) {
      wordStartTick = syllable.tick
    }
    
    // Check for continuation marker
    if (text.endsWith("-")) {
      currentWord += text.slice(0, -1)
    } else {
      currentWord += text
      
      // Word complete
      words.push({
        startMs: tickToMs(wordStartTick, tempoEvents),
        text: currentWord,
      })
      
      currentWord = ""
      wordStartTick = null
    }
  }
  
  // Handle trailing incomplete word
  if (currentWord && wordStartTick !== null) {
    words.push({
      startMs: tickToMs(wordStartTick, tempoEvents),
      text: currentWord,
    })
  }
  
  return words
}
```

---

## 3) LRC Enhancement Algorithm

### 3.1 Base LRC Parsing

```typescript
interface LrcLine {
  startMs: number
  text: string
  words: string[]
}

function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = []
  const lineRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/
  
  for (const line of lrc.split("\n")) {
    const match = line.match(lineRegex)
    if (!match) continue
    
    const [, mm, ss, cs, text] = match
    const startMs = 
      parseInt(mm) * 60000 + 
      parseInt(ss) * 1000 + 
      parseInt(cs.padEnd(3, "0").slice(0, 3))
    
    if (text.trim()) {
      lines.push({
        startMs,
        text: text.trim(),
        words: text.trim().split(/\s+/),
      })
    }
  }
  
  return lines
}
```

### 3.2 Word Alignment

Match GP word timings to LRC words using normalized comparison:

```typescript
interface WordPatch {
  lineIndex: number
  wordIndex: number
  startMs: number
  durationMs: number
}

function alignWords(
  lrcLines: LrcLine[],
  gpWords: WordTiming[]
): WordPatch[] {
  const patches: WordPatch[] = []
  let gpIdx = 0
  
  for (let lineIdx = 0; lineIdx < lrcLines.length; lineIdx++) {
    const line = lrcLines[lineIdx]
    
    for (let wordIdx = 0; wordIdx < line.words.length; wordIdx++) {
      const lrcWord = normalizeToken(line.words[wordIdx])
      if (!lrcWord) continue
      
      // Find matching GP word
      while (gpIdx < gpWords.length) {
        const gpWord = normalizeToken(gpWords[gpIdx].text)
        
        if (gpWord === lrcWord) {
          const startMs = gpWords[gpIdx].startMs
          
          // Duration = time until next word (or next line, or +500ms default)
          const nextWordMs = gpWords[gpIdx + 1]?.startMs
          const nextLineMs = lrcLines[lineIdx + 1]?.startMs
          const durationMs = Math.min(
            nextWordMs ? nextWordMs - startMs : 500,
            nextLineMs ? nextLineMs - startMs : 500,
            2000 // Max 2 seconds per word
          )
          
          patches.push({
            lineIndex: lineIdx,
            wordIndex: wordIdx,
            startMs: Math.round(startMs),
            durationMs: Math.max(50, Math.round(durationMs)),
          })
          
          gpIdx++
          break
        }
        
        gpIdx++
      }
    }
  }
  
  return patches
}

function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "")
}
```

---

## 4) Database Schema

### 4.1 Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           songs                                      │
│  Global catalog of unique songs (by canonical artist + title)       │
├─────────────────────────────────────────────────────────────────────┤
│  id, title, artist, album, duration_ms                              │
│  artist_lower, title_lower (for deduplication)                      │
│  spotify_id (optional, if linked)                                   │
│  has_synced_lyrics                                                  │
│  total_play_count (aggregate from all users)                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
┌──────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐
│ song_lrclib_ids  │  │ user_song_items │  │ lrc_word_enhancements   │
│ (1:many mapping) │  │ (per-user)      │  │ (word-level patches)    │
├──────────────────┤  ├─────────────────┤  ├─────────────────────────┤
│ song_id FK       │  │ user_id         │  │ song_id FK              │
│ lrclib_id        │  │ song_id FK      │  │ lrclib_id (source)      │
│ is_primary       │  │ is_favorite     │  │ lrc_hash                │
│                  │  │ play_count      │  │ payload (JSONB)         │
└──────────────────┘  └─────────────────┘  └─────────────────────────┘
```

**Key insight:** A song can have multiple LRCLIB entries (duplicates, versions), but our enhancement applies to the canonical song. We track which LRCLIB IDs map to each song.

### 4.2 Tables (Drizzle)

```typescript
// src/lib/db/schema.ts

// ============================================================================
// Global Song Catalog
// ============================================================================

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    
    // Core metadata
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    album: text("album"),
    durationMs: integer("duration_ms"),
    
    // Normalized for deduplication (lowercase, trimmed, punctuation removed)
    artistLower: text("artist_lower").notNull(),
    titleLower: text("title_lower").notNull(),
    
    // External IDs (Spotify is 1:1, LRCLIB is 1:many via separate table)
    spotifyId: text("spotify_id"),
    
    // Lyrics status
    hasSyncedLyrics: boolean("has_synced_lyrics").notNull().default(false),
    
    // Aggregate metrics (updated periodically or via trigger)
    totalPlayCount: integer("total_play_count").notNull().default(0),
    
    // Timestamps
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    // Unique on normalized artist+title to prevent duplicates
    uniqueIndex("songs_artist_title_lower_idx").on(table.artistLower, table.titleLower),
    uniqueIndex("songs_spotify_id_idx").on(table.spotifyId).where(sql`spotify_id IS NOT NULL`),
    index("songs_artist_title_idx").on(table.artist, table.title),
  ],
)

// ============================================================================
// LRCLIB ID Mapping (one song can have multiple LRCLIB entries)
// ============================================================================

export const songLrclibIds = pgTable(
  "song_lrclib_ids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    lrclibId: integer("lrclib_id").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex("song_lrclib_ids_lrclib_id_idx").on(table.lrclibId),
    index("song_lrclib_ids_song_id_idx").on(table.songId),
  ],
)

// ============================================================================
// LRC Word-Level Enhancement (linked to songs)
// ============================================================================

export const lrcWordEnhancements = pgTable(
  "lrc_word_enhancements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    
    // Link to song catalog
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    
    // Which LRCLIB entry was used as source for this enhancement
    // (the LRC content we aligned against)
    sourceLrclibId: integer("source_lrclib_id").notNull(),
    
    // LRC hash for validation (ensures LRC hasn't changed)
    lrcHash: text("lrc_hash").notNull(),
    
    // Version tracking (for future algorithm updates)
    algoVersion: text("algo_version").notNull().default("v1"),
    
    // Word timing data: array of line patches
    // Each line: { idx, words: [{ idx, start, dur }] }
    payload: jsonb("payload").$type<EnhancementPayload>().notNull(),
    
    // Stats
    lineCount: integer("line_count").notNull(),
    wordCount: integer("word_count").notNull(),
    
    // Guitar Pro source info
    gpFileName: text("gp_file_name"),
    gpArtist: text("gp_artist"),
    gpTitle: text("gp_title"),
    
    // Audit
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  table => [
    // One enhancement per song+lrcHash+algo combo
    uniqueIndex("lrc_word_enhancements_song_hash_idx").on(
      table.songId,
      table.lrcHash,
      table.algoVersion,
    ),
    index("lrc_word_enhancements_song_id_idx").on(table.songId),
  ],
)

// Payload type for word-level enhancements
interface EnhancementPayload {
  lines: Array<{
    idx: number       // Line index in LRC
    words: Array<{
      idx: number     // Word index in line
      start: number   // Start time in ms (relative to line start)
      dur: number     // Duration in ms
    }>
  }>
}
```

### 4.3 Updated user_song_items (references songs)

The existing `user_song_items` table can optionally reference `songs` for shared metadata:

```typescript
// Option A: Add FK to songs table
export const userSongItems = pgTable(
  "user_song_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    
    // Link to global song catalog (nullable for migration)
    songId: uuid("song_id").references(() => songs.id),
    
    // Keep denormalized data for display (in case song not in catalog yet)
    songProviderKey: text("song_provider_key").notNull(), // "lrclib:123" or "spotify:abc"
    songTitle: text("song_title").notNull(),
    songArtist: text("song_artist").notNull(),
    songAlbum: text("song_album"),
    songDurationMs: integer("song_duration_ms"),
    
    // User-specific tracking
    isFavorite: boolean("is_favorite").notNull().default(false),
    inHistory: boolean("in_history").notNull().default(false),
    playCount: integer("play_count").notNull().default(0),
    firstPlayedAt: timestamp("first_played_at", { mode: "date", withTimezone: true }),
    lastPlayedAt: timestamp("last_played_at", { mode: "date", withTimezone: true }),
    
    // Soft delete
    deleted: boolean("deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
    
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  // ... indexes
)
```

### 4.5 Migration

```sql
-- drizzle/0003_songs_catalog.sql

-- Global song catalog (unique by normalized artist+title)
CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_ms INTEGER,
  artist_lower TEXT NOT NULL,
  title_lower TEXT NOT NULL,
  spotify_id TEXT,
  has_synced_lyrics BOOLEAN NOT NULL DEFAULT FALSE,
  total_play_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX songs_artist_title_lower_idx ON songs(artist_lower, title_lower);
CREATE UNIQUE INDEX songs_spotify_id_idx ON songs(spotify_id) WHERE spotify_id IS NOT NULL;
CREATE INDEX songs_artist_title_idx ON songs(artist, title);

-- LRCLIB ID mapping (one song can have multiple LRCLIB entries)
CREATE TABLE IF NOT EXISTS song_lrclib_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  lrclib_id INTEGER NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX song_lrclib_ids_lrclib_id_idx ON song_lrclib_ids(lrclib_id);
CREATE INDEX song_lrclib_ids_song_id_idx ON song_lrclib_ids(song_id);

-- Word-level enhancement data
CREATE TABLE IF NOT EXISTS lrc_word_enhancements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  source_lrclib_id INTEGER NOT NULL,
  lrc_hash TEXT NOT NULL,
  algo_version TEXT NOT NULL DEFAULT 'v1',
  payload JSONB NOT NULL,
  line_count INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  gp_file_name TEXT,
  gp_artist TEXT,
  gp_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES "user"(id)
);

CREATE UNIQUE INDEX lrc_word_enhancements_song_hash_idx 
  ON lrc_word_enhancements(song_id, lrc_hash, algo_version);
CREATE INDEX lrc_word_enhancements_song_id_idx 
  ON lrc_word_enhancements(song_id);

-- Add FK from user_song_items to songs (nullable for migration)
ALTER TABLE user_song_items ADD COLUMN song_id UUID REFERENCES songs(id);
CREATE INDEX user_song_items_song_id_idx ON user_song_items(song_id) WHERE song_id IS NOT NULL;
```

---

## 5) API Design

### 5.1 Songs Catalog API

```typescript
// GET /api/admin/songs - List all songs in catalog (admin only)
interface SongsListResponse {
  songs: Array<{
    id: string
    title: string
    artist: string
    album?: string
    lrclibIds: number[]        // All associated LRCLIB IDs
    primaryLrclibId?: number   // The primary one (for fetching LRC)
    spotifyId?: string
    hasSyncedLyrics: boolean
    hasEnhancement: boolean    // derived from lrc_word_enhancements
    totalPlayCount: number
  }>
  total: number
}

// POST /api/songs/upsert - Create or update song in catalog
// Called when user plays a song (creates catalog entry if not exists)
// Deduplicates by normalized artist+title
interface UpsertSongRequest {
  title: string
  artist: string
  album?: string
  durationMs?: number
  lrclibId?: number   // Will be added to song_lrclib_ids
  spotifyId?: string
  hasSyncedLyrics?: boolean
}

interface UpsertSongResponse {
  songId: string
  created: boolean           // true if new song was created
  lrclibIdLinked: boolean    // true if lrclibId was newly linked
  hasEnhancement: boolean    // whether enhancement exists for this song
}

// GET /api/songs/lookup?lrclibId=123
// Lookup song by any of its LRCLIB IDs
interface SongLookupResponse {
  songId: string
  title: string
  artist: string
  hasEnhancement: boolean
  primaryLrclibId?: number
}
```

### 5.2 Admin: Submit Enhancement

```typescript
// POST /api/admin/lrc/enhance
interface EnhanceRequest {
  songId: string  // Reference to songs table
  gpMeta: {
    fileName: string
    artist: string
    title: string
  }
  lrcHash: string
  payload: {
    lines: Array<{
      idx: number
      words: Array<{
        idx: number
        start: number  // Relative to line start (ms)
        dur: number    // Duration (ms)
      }>
    }>
  }
}

interface EnhanceResponse {
  enhancementId: string
  lineCount: number
  wordCount: number
}
```

### 5.3 Runtime: Fetch Enhancement

```typescript
// GET /api/lrc/enhancement?songId=xxx&lrcHash=abc...
// OR
// GET /api/lrc/enhancement?lrclibId=123&lrcHash=abc...
interface EnhancementResponse {
  enhancementId: string
  algoVersion: string
  payload: {
    lines: Array<{
      idx: number
      words: Array<{
        idx: number
        start: number
        dur: number
      }>
    }>
  }
}
```

---

## 6) Admin Panel UI

### 6.1 Songs Catalog View

The admin panel shows all songs in the catalog:

| Column | Description |
|--------|-------------|
| Artist | Song artist |
| Title | Song title |
| LRCLIB ID | Link to LRCLIB if available |
| Spotify ID | Link to Spotify if available |
| Synced | ✓ if has synced lyrics |
| Enhanced | ✓ if has word-level enhancement |
| Plays | Total play count across all users |
| Actions | Upload GP, View Enhancement |

**Filters:**
- Show all / Only with synced / Only without enhancement
- Search by artist/title

### 6.2 Enhancement Workflow

1. **Select Song from Catalog**
   - Click "Upload GP" on a song row
   - Or search/filter to find the song
   - Shows current lyrics and enhancement status

2. **GP File Upload**
   - Drag & drop or file picker
   - Accept: `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`
   - Max size: 10MB

3. **Client-Side Processing**
   - Parse GP with alphaTab (in browser)
   - Extract lyrics + timing
   - Fetch base LRC from LRCLIB (using song's lrclibId)
   - Run alignment algorithm
   - Display preview with word highlighting

4. **Preview & Validation**
   - Show side-by-side comparison: GP lyrics vs LRCLIB lyrics
   - Highlight mismatches
   - Show word coverage percentage
   - Allow manual corrections (future)

5. **Submit**
   - Compute LRC hash
   - Send payload to API with songId
   - Show success/error status
   - Update catalog UI to show "Enhanced ✓"

### 6.3 Song Catalog Population

**Privacy-first approach:** The `songs` catalog is NOT populated by anonymous users (that would violate "no server-side data retention"). Instead:

Songs are added to the catalog only when:
- **Authenticated user** plays a song → upsert to catalog + link to user_song_items
- **Admin** manually adds a song (for enhancement prep)
- **Bulk import** from external source (admin task)

**For anonymous users:**
- Enhancement lookup is a **read-only** operation
- Query: `GET /api/lrc/enhancement?lrclibId=123` (no auth required)
- Returns enhancement if exists, 404 if not
- No song catalog upsert, no tracking, no cookies
- Equivalent privacy to calling LRCLIB directly

This means some songs may not be in the catalog yet when an anonymous user plays them. That's fine — enhancement is a "nice to have" feature that becomes available after an authenticated user or admin has played/added that song.

### 6.4 Component Structure

```
src/app/admin/
├── songs/
│   ├── page.tsx              # Songs catalog list
│   ├── SongsTable.tsx        # Table with filters
│   └── SongRow.tsx           # Row with actions
├── enhance/
│   ├── [songId]/
│   │   └── page.tsx          # Enhancement page for specific song
│   ├── GpUploader.tsx        # File upload + parsing
│   ├── AlignmentPreview.tsx  # Side-by-side preview
│   └── SubmitButton.tsx      # Submit patches
└── layout.tsx                # Admin layout with nav
```

---

## 7) Runtime Enhancement Application

### 7.1 Song Loading Flow

The loading flow differs for anonymous vs authenticated users to respect privacy:

#### Anonymous Users (read-only, no tracking)

```
1. User selects song
                    │
                    ▼
2. Fetch base LRC from LRCLIB
   (cached in localStorage)
                    │
                    ▼
3. Try to fetch enhancement (by lrclibId only, no auth)
   GET /api/lrc/enhancement?lrclibId=123&lrcHash=abc
   Returns: enhancement payload OR 404
                    │
                    ▼
4. Apply patches (if found) → EnhancedLyrics
                    │
                    ▼
5. Render LyricsPlayer
```

No song catalog upsert, no tracking, no cookies. Pure read-only.

#### Authenticated Users (full catalog integration)

```
1. User selects song
                    │
                    ▼
2. Upsert song to catalog ─────────────────────────────────┐
   POST /api/songs/upsert { lrclibId, title, artist }      │
   Returns: { songId, hasEnhancement }                     │
                    │                                       │
                    ▼                                       │
3. Fetch base LRC from LRCLIB                              │
   (cached in localStorage)                                │
                    │                                       │
                    ▼                                       │
4. If hasEnhancement: fetch enhancement ◄──────────────────┘
   GET /api/lrc/enhancement?songId=xxx&lrcHash=abc
                    │
                    ▼
5. Apply patches → EnhancedLyrics
                    │
                    ▼
6. Render LyricsPlayer + update user_song_items (play count, history)
```

### 7.2 Data Types

```typescript
// Base LRC line (from LRCLIB)
interface LrcLine {
  startMs: number
  text: string
  words: string[]  // Split by whitespace
}

// Enhanced line (after applying patches)
interface EnhancedLine {
  startMs: number
  text: string
  words: Array<{
    text: string
    startMs: number   // Absolute time
    endMs: number     // Absolute time
  }>
}

// What we store/fetch for the song
interface SongWithLyrics {
  songId: string
  title: string
  artist: string
  lrclibId?: number
  baseLrc: string
  enhancement?: EnhancementPayload  // Pre-fetched if available
}
```

### 7.3 Loading Implementation

```typescript
// For ALL users (anonymous and authenticated)
// Enhancement lookup is always read-only by lrclibId
async function loadLyricsWithEnhancement(
  lrclibId: number,
  title: string,
  artist: string
): Promise<SongWithLyrics> {
  // 1. Fetch base LRC from LRCLIB (cached in localStorage)
  const baseLrc = await fetchLrcFromLrclib(lrclibId)
  const lrcHash = computeLrcHash(baseLrc)
  
  // 2. Try to fetch enhancement (read-only, no auth required)
  //    Returns 404 if no enhancement exists — that's fine
  let enhancement: EnhancementPayload | undefined
  try {
    const enhRes = await fetch(
      `/api/lrc/enhancement?lrclibId=${lrclibId}&lrcHash=${lrcHash}`
    )
    if (enhRes.ok) {
      enhancement = (await enhRes.json()).payload
    }
  } catch {
    // Enhancement not available, continue without it
  }
  
  return { title, artist, lrclibId, baseLrc, enhancement }
}

// For AUTHENTICATED users only — also updates catalog and user history
async function loadLyricsForAuthenticatedUser(
  lrclibId: number,
  title: string,
  artist: string,
  spotifyId?: string
): Promise<SongWithLyrics> {
  // 1. Upsert song to catalog (creates if not exists, links lrclibId)
  const songRes = await fetch("/api/songs/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lrclibId, title, artist, spotifyId }),
  })
  const { songId, hasEnhancement } = await songRes.json()
  
  // 2. Fetch base LRC
  const baseLrc = await fetchLrcFromLrclib(lrclibId)
  const lrcHash = computeLrcHash(baseLrc)
  
  // 3. Fetch enhancement if catalog says it exists
  let enhancement: EnhancementPayload | undefined
  if (hasEnhancement) {
    const enhRes = await fetch(
      `/api/lrc/enhancement?songId=${songId}&lrcHash=${lrcHash}`
    )
    if (enhRes.ok) {
      enhancement = (await enhRes.json()).payload
    }
  }
  
  return { songId, title, artist, lrclibId, baseLrc, enhancement }
}
```

### 7.4 Applying Enhancements

```typescript
function applyEnhancement(
  baseLrc: string,
  enhancement?: EnhancementPayload
): EnhancedLine[] {
  const lines = parseLrc(baseLrc)
  
  return lines.map((line, lineIdx) => {
    const linePatch = enhancement?.lines.find(l => l.idx === lineIdx)
    
    // No enhancement for this line → words get line start time
    if (!linePatch) {
      return {
        startMs: line.startMs,
        text: line.text,
        words: line.words.map(w => ({
          text: w,
          startMs: line.startMs,
          endMs: line.startMs,
        })),
      }
    }
    
    // Apply word timings from patch
    return {
      startMs: line.startMs,
      text: line.text,
      words: line.words.map((word, wordIdx) => {
        const wordPatch = linePatch.words.find(w => w.idx === wordIdx)
        
        if (!wordPatch) {
          return { text: word, startMs: line.startMs, endMs: line.startMs }
        }
        
        return {
          text: word,
          startMs: line.startMs + wordPatch.start,
          endMs: line.startMs + wordPatch.start + wordPatch.dur,
        }
      }),
    }
  })
}
```

### 7.2 LRC Hash Computation

```typescript
function computeLrcHash(lrc: string): string {
  // Canonicalize: normalize line endings, trim whitespace
  const canonical = lrc
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .join("\n")
  
  // SHA-256 hash
  return sha256(canonical)
}
```

---

## 8) Caching Strategy

### 8.1 Server-Side (Future: Redis)

```
Key: lrc:enhancement:{lrclibId}:{lrcHash}:{algoVersion}
TTL: 24 hours
Value: Serialized patches bundle
```

### 8.2 Client-Side (IndexedDB)

```typescript
// Store in IndexedDB for offline/instant replay
const CACHE_KEY = `lrc_enhancement_v1:${lrclibId}:${lrcHash}`
const CACHE_TTL_DAYS = 7
```

---

## 9) Version Management

| Version | Description |
|---------|-------------|
| `algo_version` | Alignment algorithm version. Bump when matching logic changes. |
| `tokenizer_version` | Token normalization version. Bump when word splitting rules change. |
| `patch_format_version` | Storage format. Currently `json-v1`. Future: `binary-v1` for compression. |

Enhancement patches are immutable once created. To update, create a new set with bumped version.

---

## 10) Error Handling

### 10.1 GP Parsing Errors
- Display user-friendly error message
- Log details for debugging
- Suggest: "Try a different Guitar Pro file or format"

### 10.2 Alignment Failures
- Show word match percentage
- Warn if < 80% coverage
- Allow force-submit with confirmation

### 10.3 LRCLIB Errors
- Handle rate limiting (429)
- Handle not found (404)
- Retry with exponential backoff

---

## 11) Security

- Admin routes require `isAdmin` check from `appUserProfiles`
- Rate limit enhancement submissions
- Validate file size and type before parsing
- Sanitize GP metadata before storage
- No user-generated content in patches (only indices and times)

---

## 12) Future Enhancements

1. **Binary patch format** — Varint encoding for smaller payloads
2. **Redis caching** — Fast enhancement bundle retrieval
3. **Batch import** — Upload multiple GP files at once
4. **Manual timing editor** — Fine-tune word timings in browser
5. **Crowdsourced corrections** — Allow users to submit timing fixes
6. **Audio alignment fallback** — Use audio analysis when GP unavailable

---

## 13) Deployment Architecture

### Why Client-Side Parsing

| Option | Verdict |
|--------|---------|
| **Client-side parsing** | ✅ Best fit for Vercel |
| Vercel Serverless Function | ⚠️ Timeout risk (10-60s), alphaTab is heavy (~2MB) |
| Vercel Edge Function | ❌ No Node.js APIs, can't run alphaTab |
| External Lambda/Cloud Run | ❌ Overkill for admin-only feature |

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                   Admin Browser                          │
│  1. Upload .gp file (stays in browser memory)           │
│  2. Parse with alphaTab (client-side JS)                │
│  3. Fetch base LRC from LRCLIB                          │
│  4. Run alignment algorithm (client-side)               │
│  5. Send computed patches to API                        │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼ POST /api/admin/lrc/enhance
                           { lrclibId, baseLrc, payload }
                           (small JSON, ~10-50KB)
┌─────────────────────────────────────────────────────────┐
│              Vercel Serverless Function                  │
│  1. Validate admin auth                                 │
│  2. Re-compute lrcHash from baseLrc                     │
│  3. Upsert song to catalog (Neon Postgres)              │
│  4. Insert enhancement patches                          │
│  5. Return success                                      │
└─────────────────────────────────────────────────────────┘
```

### Benefits

- **No file upload** — GP file never leaves the browser, no storage needed
- **No server-side parsing** — all heavy compute is client-side
- **Fast API** — just JSON validation + DB writes, well under Vercel's 10s limit
- **Standard Vercel config** — no special runtime or memory settings
- **No cold start issues** — API route has minimal dependencies

### Vercel Config

No special configuration needed. Standard Next.js API routes work fine:

```typescript
// app/api/admin/lrc/enhance/route.ts
export const runtime = "nodejs"  // default
export const maxDuration = 10    // seconds, default is fine
```

---

## 14) Design Review Notes

Based on Oracle review, key recommendations incorporated or to address:

### Schema Improvements
- ✅ Unique constraint on normalized `(artist_lower, title_lower)` for songs deduplication
- ✅ Separate `song_lrclib_ids` table for 1:many LRCLIB mapping
- ⚠️ Add `has_enhancement` boolean on `songs` table for fast admin filtering
- ⚠️ Add partial unique index on `(lrclib_id, lrc_hash)` for enhancements
- ⚠️ Consider `status` column for future crowdsourcing (`active`, `candidate`, `superseded`)
- ⚠️ Add `coverage` percentage column for quality tracking

### API Simplifications
- ⚠️ Unify enhancement lookup to always use `lrclibId + lrcHash` (drop `songId` variant)
- ⚠️ Server re-computes `lrcHash` from submitted `baseLrc` (don't trust client hash)
- ⚠️ Optionally verify `baseLrc` matches current LRCLIB content, reject if stale

### Security & Privacy
- ✅ Anonymous lookup is read-only, no catalog writes
- ⚠️ `/api/songs/upsert` must reject unauthenticated requests
- ⚠️ Consider log rotation/anonymization for enhancement API access logs
- ⚠️ Rate-limit admin endpoints

### alphaTab Integration
- ⚠️ Dynamic import to reduce bundle size (admin pages only)
- ⚠️ Ensure admin pages are client-side only for GP parsing
- ⚠️ Verify PPQ from alphaTab rather than hardcoding 960
- ⚠️ Show clear error for `.gp3` files (no lyrics support)

### Hash Parity
- ⚠️ Define single canonicalization function, share between client and server
- ⚠️ Unit test client/server hash parity to avoid silent mismatches

### Future Crowdsourcing Ready
- ✅ `source_lrclib_id` tracks which LRCLIB entry was aligned against
- ⚠️ Add `source` column (`admin`, `user`, `import`)
- ⚠️ Add `created_by` FK to users table
- ⚠️ Partial unique index for one active enhancement per `(lrclib_id, lrc_hash)`

---

## 14) Implementation Phases

### Phase 1: Database & Songs Catalog
- [ ] Add `songs` table (Drizzle migration)
- [ ] Add `lrc_word_enhancements` table
- [ ] Add `song_id` FK to `user_song_items`
- [ ] Create songs upsert API (auto-populate on play)
- [ ] Create admin songs list API

### Phase 2: alphaTab Integration
- [ ] Add `@coderline/alphatab` dependency
- [ ] Create GP parsing service (browser-side)
- [ ] Implement word timing extraction
- [ ] Implement LRC parsing and hashing utilities
- [ ] Build word alignment algorithm

### Phase 3: Admin Panel
- [ ] Songs catalog table view with filters
- [ ] Enhancement page for specific song
- [ ] GP file uploader with preview
- [ ] Alignment preview UI (side-by-side)
- [ ] Submit enhancement API

### Phase 4: Runtime Integration
- [ ] Update LRC parser to support enhanced format with word-level `<mm:ss.cc>` timestamps
- [ ] Adjust word-by-word painting algorithm to use real timings instead of linear interpolation
- [ ] Enhancement fetch API (by lrclibId + lrcHash)
- [ ] LyricsPlayer patch application
- [ ] Word-level highlight rendering

### Phase 5: Polish & Metrics
- [ ] Error handling and validation
- [ ] Loading states and progress
- [ ] IndexedDB caching for enhancements
- [ ] Play count aggregation
- [ ] Admin analytics/stats dashboard
