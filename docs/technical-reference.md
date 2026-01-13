# ScrollTunes Technical Reference

> Consolidated technical specifications for core systems. Reference for future implementations.

## Table of Contents

1. [LRC Lyrics System](#1-lrc-lyrics-system)
2. [Voice Activity Detection](#2-voice-activity-detection)
3. [Audio Classification](#3-audio-classification)
4. [Search System](#4-search-system)
5. [Song Normalization & Deduplication](#5-song-normalization--deduplication)
6. [Caching Strategy](#6-caching-strategy)
7. [BPM Provider System](#7-bpm-provider-system)
8. [Database Optimizations](#8-database-optimizations)

---

## 1. LRC Lyrics System

### 1.1 LRC Parsing

Standard LRC format with millisecond timestamps:

```
[mm:ss.xx] Lyrics line text
[00:15.50] First line of the song
[00:18.23] Second line here
```

**Parser implementation:** `src/lib/lyrics-parser.ts`

```typescript
interface LrcLine {
  startMs: number
  text: string
  words: string[]  // Split by whitespace
}

// Regex for line parsing
const lineRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/
```

### 1.2 Word-Level Enhancement System

Guitar Pro files provide word-level timing that enhances LRCLIB lyrics.

**Key files:**
- `src/lib/gp/extract-lyrics.ts` - GP parsing via alphaTab
- `src/lib/gp/build-words.ts` - Syllable → word joining
- `src/lib/gp/timing.ts` - Tick-to-millisecond conversion
- `src/lib/gp/align-words.ts` - LRC word alignment
- `src/lib/lrc-hash.ts` - Hash computation for validation

#### Syllable Joining Algorithm

Guitar Pro stores lyrics as syllables with continuation markers:

| Marker | Example | Meaning |
|--------|---------|---------|
| Trailing hyphen | `ma-` | Syllable continues to next |
| Leading hyphen | `-tion` | Continues from previous |
| Bare hyphen | `-` | Previous continues to next |
| Uppercase after hyphen | `lse-` → `Be` | New word (not continuation) |

```typescript
// Continuation detection
const hasTrailingHyphen = text.endsWith("-")
const hasLeadingHyphen = text.startsWith("-")
const looksLikeContinuation = hasLeadingHyphen || hasTrailingHyphen || /^[a-z]/.test(text)
```

#### Token Normalization

GP files contain special characters and Cyrillic lookalikes:

```typescript
function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    // Cyrillic → Latin
    .replace(/а/g, "a").replace(/е/g, "e").replace(/о/g, "o")
    .replace(/р/g, "p").replace(/с/g, "c").replace(/у/g, "y")
    // Collapse repeated vowels (ooo→o)
    .replace(/([aeiou])\1+/g, "$1")
    // Normalize interjections: ooh/oh → o
    .replace(/([ao])h+/g, "$1")
    // Remove GP prolongation markers: (o), (a)
    .replace(/\([a-z]+\)/g, "")
    // Remove +suffix patterns
    .replace(/\+\w+/g, "")
    // Remove internal hyphens
    .replace(/-/g, "")
    // Strip punctuation
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "")
}
```

#### Tick-to-Time Conversion

```typescript
const PPQ = 960  // Pulses per quarter note (alphaTab standard)

function tickToMs(tick: number, tempoEvents: TempoEvent[]): number {
  let ms = 0, lastTick = 0, lastBpm = tempoEvents[0]?.bpm ?? 120

  for (const event of tempoEvents) {
    if (event.tick > tick) break
    ms += (event.tick - lastTick) * 60000 / (lastBpm * PPQ)
    lastTick = event.tick
    lastBpm = event.bpm
  }

  ms += (tick - lastTick) * 60000 / (lastBpm * PPQ)
  return ms
}
```

### 1.3 Enhancement Payload Format

```typescript
interface EnhancementPayload {
  version: number
  algoVersion: number
  lines: Array<{
    idx: number
    startMs?: number  // GP-derived absolute line start
    words: Array<{
      idx: number
      start: number   // offset from line start (ms)
      dur: number     // duration (ms)
    }>
  }>
}
```

### 1.4 LRC Hash Computation

For cache validation:

```typescript
function computeLrcHash(lrc: string): string {
  const canonical = lrc
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .join("\n")
  return sha256(canonical)
}
```

---

## 2. Voice Activity Detection

### 2.1 Silero VAD Configuration

**File:** `src/lib/silero-vad-config.ts`

```typescript
export const SILERO_PRESET_GUITAR: SileroVADConfig = {
  positiveSpeechThreshold: 0.75,   // Trigger threshold
  negativeSpeechThreshold: 0.45,   // Release threshold
  minSpeechMs: 200,                // Minimum speech duration
  redemptionMs: 350,               // Grace period after speech ends
}
```

### 2.2 Detection Pipeline

```
Tier 1: Energy Gate (RMS)
    ↓ [above threshold]
Tier 2: Silero VAD (0.75)
    ↓ [speech detected]
Tier 3: Audio Classifier (YAMNet)
    ↓ [singing confirmed]
Tier 4: Silero Override (for singing over guitar)
    ↓
TRIGGER LYRICS PLAYBACK
```

### 2.3 Key Files

| File | Purpose |
|------|---------|
| `src/core/VoiceActivityStore.ts` | VAD state management |
| `src/core/SileroVADEngine.ts` | Silero model wrapper |
| `src/core/SingingDetectionService.ts` | Detection orchestration |
| `src/lib/voice-detection.ts` | Detection utilities |

---

## 3. Audio Classification

### 3.1 YAMNet Integration

**File:** `src/core/AudioClassifierService.ts`

Uses MediaPipe's YAMNet model:

```typescript
const MEDIAPIPE_WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm"
const YAMNET_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite"
```

### 3.2 Class Categories

| Category | Classes |
|----------|---------|
| `SINGING_CLASSES` | Singing, Choir, Chant, Yodeling, Humming, A capella, Vocal music |
| `SPEECH_CLASSES` | Speech, Male/Female/Child speech, Narration, Conversation |
| `MUSIC_CLASSES` | Music, Musical instrument, Plucked string instrument |
| `INSTRUMENT_REJECT` | Guitar, Harmonica, Whistle, Flute, Drums |
| `HIGH_PRIORITY_REJECT` | Harmonica, Whistle (commonly confused with voice) |

### 3.3 Decision Logic

```
ALLOW (singing confirmed):
  - "Singing" >= 0.3
  - "Music" > 0.3 AND voice > 0.15
  - "Speech" >= 0.5

REJECT (instrument, not voice):
  - High-priority: Harmonica/Whistle > 0.25 AND voice < 0.2
  - Instrument >= 0.4 AND voice < 0.15
  - Music >= 0.4 AND voice < 0.1

DEFER (uncertain): Trust Silero
```

### 3.4 Performance

| Component | Size | Latency |
|-----------|------|---------|
| Energy RMS | 0 | <1ms |
| Silero VAD | ~2MB | ~5ms/frame |
| YAMNet | ~8MB | ~50-100ms |

---

## 4. Search System

### 4.1 Architecture: Spotify-First with Turso Verification

```
User search → Spotify Search (~100ms, popularity-ranked)
           ↓ (max 8 results)
           Turso Lookup (~100-350ms parallel)
           ↓
        Found → Return with Spotify metadata + LRCLIB ID
     Not Found → Skip
```

**Fallback chain:** Spotify + Turso → Turso Direct + Deezer → LRCLIB API + Deezer

### 4.2 Key Files

| File | Purpose |
|------|---------|
| `src/services/turso.ts` | TursoService with `search()`, `getById()`, `findByTitleArtist()` |
| `src/app/api/search/route.ts` | Search endpoint |
| `src/lib/turso-usage-tracker.ts` | Usage monitoring |

### 4.3 Turso Schema

```sql
CREATE TABLE tracks (
  id           INTEGER PRIMARY KEY,  -- lrclib_id
  title        TEXT NOT NULL,
  artist       TEXT NOT NULL,
  album        TEXT,
  duration_sec INTEGER NOT NULL,
  title_norm   TEXT NOT NULL,
  artist_norm  TEXT NOT NULL,
  quality      INTEGER NOT NULL      -- 80=studio, 50=live, 30=garbage
);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
  title, artist,
  content='tracks',
  content_rowid='id',
  tokenize='porter'
);
```

### 4.4 Quality Scoring

| Factor | Score |
|--------|-------|
| Studio album | +80 (base) |
| Live/acoustic | +50 |
| Remix/cover | +30 |
| Garbage title pattern | -50 |
| Title contains artist | -40 |

**Garbage patterns:** Track numbers (`01. Song`), embedded artist (`Artist - Song`)

---

## 5. Song Normalization & Deduplication

### 5.1 Deduplication Key

Songs are deduplicated by `(artist_lower, title_lower)`. Album is metadata, not part of the key.

```sql
CREATE UNIQUE INDEX songs_artist_title_lower_idx
  ON songs(artist_lower, title_lower);
```

### 5.2 Title Normalization

Strip version suffixes:

```typescript
const TITLE_SUFFIXES_TO_STRIP = [
  /\s*[-–—]\s*(?:remaster(?:ed)?(?:\s+\d{4})?)/gi,
  /\s*[\(\[](?:live|acoustic|unplugged)[\)\]]/gi,
  /\s*[\(\[](?:deluxe|expanded|anniversary)(?:\s+edition)?[\)\]]/gi,
  /\s*[\(\[](?:radio\s+edit|single\s+version|extended)[\)\]]/gi,
  /\s*[\(\[](?:explicit|clean|instrumental)[\)\]]/gi,
  /\s*[-–—]\s*\d{4}(?:\s+(?:version|mix))?$/gi,
]
```

### 5.3 Artist Normalization

```typescript
const ARTIST_SUFFIXES_TO_STRIP = [
  /\s+(?:feat\.?|ft\.?|featuring|with|&|,)\s+.*/gi,
  /\s+(?:band|orchestra|ensemble|quartet|trio)$/gi,
]
```

### 5.4 Album Classification

```typescript
const ALBUM_TYPE_PRIORITY: Record<string, number> = {
  'studio': 0,
  'remaster': 1,
  'deluxe': 2,
  'compilation': 3,
  'live': 4,
  'soundtrack': 5,
}

function classifyAlbum(albumName: string): string {
  const lower = albumName.toLowerCase()
  if (/\b(live|concert|unplugged)\b/.test(lower)) return 'live'
  if (/\b(greatest\s+hits|best\s+of|anthology)\b/.test(lower)) return 'compilation'
  if (/\b(soundtrack|ost)\b/.test(lower)) return 'soundtrack'
  if (/\b(remaster|reissue)\b/.test(lower)) return 'remaster'
  if (/\b(deluxe|expanded|anniversary)\b/.test(lower)) return 'deluxe'
  return 'studio'
}
```

### 5.5 LRCLIB ID Mapping

One song can have multiple LRCLIB entries:

```sql
CREATE TABLE song_lrclib_ids (
  song_id    UUID REFERENCES songs(id),
  lrclib_id  INTEGER NOT NULL UNIQUE,
  is_primary BOOLEAN DEFAULT FALSE
);
```

---

## 6. Caching Strategy

### 6.1 localStorage Keys

| Key | Contents | TTL |
|-----|----------|-----|
| `scrolltunes:recents` | Recent songs (max 5) | None |
| `scrolltunes:lyrics:{id}` | Cached lyrics + metadata | 7 days |
| `scrolltunes:favorites` | Favorite songs | None |
| `scrolltunes:prefs` | User preferences | None |

### 6.2 CachedLyrics Structure

```typescript
interface CachedLyrics {
  version: number                    // Cache version (bump to invalidate)
  lyrics: Lyrics
  bpm: number | null
  key: string | null
  albumArt?: string
  spotifyId?: string
  bpmSource?: AttributionSource
  hasEnhancement?: boolean
  enhancement?: EnhancementPayload
  hasChordEnhancement?: boolean
  chordEnhancement?: ChordEnhancementPayload
  cachedAt: number                   // Timestamp for TTL
}
```

### 6.3 Cache Invalidation

```typescript
const CACHE_VERSION = 9  // Bump when schema changes
const LYRICS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

function loadCachedLyrics(id: number): CachedLyrics | null {
  const parsed = JSON.parse(localStorage.getItem(key))
  if (parsed.version !== CACHE_VERSION) return null  // Version mismatch
  if (Date.now() - parsed.cachedAt > LYRICS_CACHE_TTL_MS) return null  // TTL
  if (!parsed.lyrics?.lines?.length) return null  // Garbage
  return parsed
}
```

---

## 7. BPM Provider System

### 7.1 Provider Cascade

```
Has Spotify ID?
  → Yes: Race (parallel): ReccoBeats + GetSongBPM + Deezer
  → No: Fallback (sequential): GetSongBPM → Deezer
     ↓
  All failed + has Spotify ID?
     ↓
  Last Resort: RapidAPI-Spotify (20/day cap)
```

### 7.2 Providers

| Provider | Auth | Rate Limit | Notes |
|----------|------|------------|-------|
| ReccoBeats | None | None | Requires Spotify ID, most accurate |
| GetSongBPM | API Key | 3000/hour | Title/artist search |
| Deezer | None | None | Less accurate, fallback |
| RapidAPI-Spotify | API Key | 20/day | Last resort, Upstash rate limit |

### 7.3 Provider Interface

```typescript
interface BPMProvider {
  readonly name: string
  getBpm(query: BPMTrackQuery): Effect.Effect<BPMResult, BPMError>
}

// Error types
class BPMNotFoundError  // Triggers fallback
class BPMAPIError       // Bubbles up
class BPMRateLimitError // Bubbles up
```

### 7.4 Key Files

| File | Purpose |
|------|---------|
| `src/lib/bpm/index.ts` | Provider exports |
| `src/lib/bpm/bpm-provider.ts` | Interface + fallback/race functions |
| `src/lib/bpm/bpm-cache.ts` | In-memory caching |
| `src/lib/bpm/reccobeats-client.ts` | ReccoBeats provider |
| `src/lib/bpm/getsongbpm-client.ts` | GetSongBPM provider |
| `src/lib/bpm/deezer-bpm-client.ts` | Deezer provider |

---

## 8. Database Optimizations

### 8.1 SQLite Read Performance

```sql
PRAGMA mmap_size = 8589934592;  -- 8GB memory-mapped I/O (critical)
PRAGMA cache_size = -1000000;   -- 1GB page cache
PRAGMA temp_store = MEMORY;     -- In-memory temp storage
```

### 8.2 SQLite Write Performance

```sql
PRAGMA journal_mode = WAL;      -- Write-ahead logging
PRAGMA synchronous = NORMAL;    -- Relaxed durability
PRAGMA cache_size = -64000;     -- 64MB cache
```

### 8.3 Query Optimization

**Subquery vs JOIN:**

```sql
-- Slow (nested loop join)
SELECT t.* FROM tracks t
JOIN lyrics l ON l.id = t.last_lyrics_id
WHERE l.has_synced_lyrics = 1

-- Fast (subquery with covering index)
SELECT t.* FROM tracks t
WHERE t.last_lyrics_id IN (
  SELECT id FROM lyrics WHERE has_synced_lyrics = 1
)
```

**Cursor-based pagination (avoid OFFSET):**

```sql
-- Slow: OFFSET scans all previous rows
SELECT * FROM tracks ORDER BY id LIMIT 50000 OFFSET 1000000;

-- Fast: cursor-based
SELECT * FROM tracks WHERE id > ?last_id ORDER BY id LIMIT 50000;
```

### 8.4 FTS5 Search

**Schema:**

```sql
CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title,                    -- Weight 10.0
    artist,                   -- Weight 1.0
    content='tracks',         -- External content
    content_rowid='id',
    tokenize='porter'         -- Porter stemming
);
```

**Weighted ranking:**

```sql
-- Title matches 10x more than artist
ORDER BY bm25(tracks_fts, 10.0, 1.0)

-- Combine text relevance with quality score
ORDER BY -bm25(tracks_fts, 10.0, 1.0) + t.quality * 0.1 DESC
```

### 8.5 Batch Writes

```typescript
const WRITE_BATCH_SIZE = 10000

for (const chunk of tracks.chunks(WRITE_BATCH_SIZE)) {
  const tx = conn.transaction()
  const stmt = tx.prepare_cached("INSERT INTO ...")
  for (const item of chunk) {
    stmt.execute(params)
  }
  tx.commit()
}
```

---

## Quick Reference: Key Files

### Core Stores

| Store | File |
|-------|------|
| LyricsPlayer | `src/core/LyricsPlayer.ts` |
| VoiceActivityStore | `src/core/VoiceActivityStore.ts` |
| AudioClassifierService | `src/core/AudioClassifierService.ts` |
| SingingDetectionService | `src/core/SingingDetectionService.ts` |
| PreferencesStore | `src/core/PreferencesStore.ts` |
| SongEditsStore | `src/core/SongEditsStore.ts` |

### Library Code

| Module | File |
|--------|------|
| Lyrics parser | `src/lib/lyrics-parser.ts` |
| Lyrics cache | `src/lib/lyrics-cache.ts` |
| LRC enhancement | `src/lib/enhancement.ts` |
| GP extraction | `src/lib/gp/` |
| BPM providers | `src/lib/bpm/` |
| Track normalization | `src/lib/track-normalization.ts` |
| Voice detection | `src/lib/voice-detection.ts` |
| Silero config | `src/lib/silero-vad-config.ts` |

### Services

| Service | File |
|---------|------|
| Turso (search index) | `src/services/turso.ts` |
| Database | `src/services/db.ts` |
| Config | `src/services/config-provider.ts` |
