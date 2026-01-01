# Canonical Song Normalization Strategy

> How to deduplicate songs across Spotify and LRCLIB variations

## The Challenge

Both Spotify and LRCLIB return multiple versions of the same song:

| Source | Title | Album |
|--------|-------|-------|
| Spotify | Nothing Else Matters - Remastered 2021 | Metallica (Remastered) |
| Spotify | Nothing Else Matters (Live) | S&M |
| Spotify | Nothing Else Matters | The Black Album |
| LRCLIB | Nothing Else Matters | Metallica |
| LRCLIB | Nothing Else Matters - Remastered | Metallica (Deluxe Edition) |
| LRCLIB | Nothing Else Matters (Bonus Track Edition) | The Black Album |

For ScrollTunes, we want ONE canonical entry that all these map to.

## Current Schema

```sql
-- songs table (one row per canonical song)
CREATE TABLE songs (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,           -- Display: "Nothing Else Matters"
  artist TEXT NOT NULL,          -- Display: "Metallica"
  album TEXT,                    -- Display: "Metallica" (first/best album)
  title_lower TEXT NOT NULL,     -- Key: "nothing else matters"
  artist_lower TEXT NOT NULL,    -- Key: "metallica"
  spotify_id TEXT,               -- Spotify track ID (any version)
  UNIQUE(artist_lower, title_lower)
);

-- song_lrclib_ids table (many-to-one mapping)
CREATE TABLE song_lrclib_ids (
  id UUID PRIMARY KEY,
  song_id UUID REFERENCES songs(id),
  lrclib_id INTEGER NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  UNIQUE(lrclib_id)
);
```

## Why Album is NOT Part of the Unique Key

**Key decision:** Album is stored as metadata but is NOT part of the deduplication key.

The same song appears on multiple albums:
- Original studio album
- Remastered editions
- Greatest Hits / Best Of compilations
- Live albums
- Deluxe editions with bonus tracks

We want ONE canonical entry for "Nothing Else Matters by Metallica" regardless of which album it's from.

**User intent:** When someone searches "Nothing Else Matters Metallica", they want **the song**, not a specific recording. They don't care if the lyrics come from The Black Album or Greatest Hits - they want to sing along.

## Enhanced Normalization Algorithm

### Step 1: Title Normalization

```typescript
const TITLE_SUFFIXES_TO_STRIP = [
  // Remaster variants
  /\s*[-–—]\s*(?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)/gi,
  /\s*[\(\[](?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)[\)\]]/gi,
  
  // Live/acoustic variants
  /\s*[\(\[](?:live(?:\s+(?:at|from|in)\s+[^)\]]+)?|acoustic(?:\s+version)?|unplugged)[\)\]]/gi,
  /\s*[-–—]\s*(?:live(?:\s+(?:at|from|in)\s+.+)?|acoustic(?:\s+version)?)/gi,
  
  // Edition variants
  /\s*[\(\[](?:deluxe|super\s+deluxe|expanded|anniversary|bonus\s+track(?:s)?|special|collector'?s?)(?:\s+edition)?[\)\]]/gi,
  
  // Format variants
  /\s*[\(\[](?:radio\s+edit|single\s+version|album\s+version|extended(?:\s+(?:mix|version))?|original\s+mix|mono|stereo)[\)\]]/gi,
  
  // Content labels
  /\s*[\(\[](?:explicit|clean|censored|instrumental|karaoke)[\)\]]/gi,
  
  // Demo/alternate
  /\s*[\(\[](?:demo(?:\s+version)?|alternate(?:\s+(?:take|version))?|outtake)[\)\]]/gi,
  
  // Year suffixes
  /\s*[-–—]\s*\d{4}(?:\s+(?:version|mix|edit))?$/gi,
]

function normalizeTitle(title: string): string {
  let result = title
  
  // Apply @web-scrobbler/metadata-filter first
  result = spotifyFilter.filterField("track", result)
  
  // Apply all suffix removals
  for (const pattern of TITLE_SUFFIXES_TO_STRIP) {
    result = result.replace(pattern, '')
  }
  
  // Normalize whitespace and punctuation
  result = result
    .replace(/\s+/g, ' ')
    .replace(/[.,!?'"():;\-–—]/g, '')
    .toLowerCase()
    .trim()
  
  return result
}
```

### Step 2: Artist Normalization

```typescript
const ARTIST_SUFFIXES_TO_STRIP = [
  // Featured artists
  /\s+(?:feat\.?|ft\.?|featuring|with|&|,|;|\/)\s+.*/gi,
  
  // Band qualifiers
  /\s+(?:band|orchestra|ensemble|quartet|trio)$/gi,
]

function normalizeArtist(artist: string): string {
  let result = artist
  
  for (const pattern of ARTIST_SUFFIXES_TO_STRIP) {
    result = result.replace(pattern, '')
  }
  
  result = result
    .replace(/\s+/g, ' ')
    .replace(/[.,!?'"():;\-–—]/g, '')
    .toLowerCase()
    .trim()
  
  return result
}
```

### Step 3: Spelling Normalization (Optional)

```typescript
const SPELLING_NORMALIZATIONS: Record<string, string> = {
  'colour': 'color',
  'colours': 'colors',
  'favourite': 'favorite',
  'grey': 'gray',
  'realise': 'realize',
  'centre': 'center',
  'theatre': 'theater',
  "'n'": 'and',
  '&': 'and',
}

function normalizeSpelling(text: string): string {
  let result = text
  for (const [variant, canonical] of Object.entries(SPELLING_NORMALIZATIONS)) {
    result = result.replace(new RegExp(`\\b${variant}\\b`, 'gi'), canonical)
  }
  return result
}
```

## Album Handling

### Album Priority (Best Album Selection)

When multiple albums are available, prefer in order:

1. **Original studio album** - "Metallica" (1991)
2. **Remastered studio** - "Metallica (Remastered)"
3. **Deluxe/Expanded** - "Metallica (Deluxe Edition)"
4. **Compilation** - "Greatest Hits"
5. **Live** - "S&M"
6. **Soundtrack** - "Mission: Impossible II OST"

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
  
  if (/\b(live|concert|tour|unplugged)\b/.test(lower)) return 'live'
  if (/\b(greatest\s+hits|best\s+of|collection|anthology|essential)\b/.test(lower)) return 'compilation'
  if (/\b(soundtrack|ost|motion\s+picture)\b/.test(lower)) return 'soundtrack'
  if (/\b(remaster|reissue)\b/.test(lower)) return 'remaster'
  if (/\b(deluxe|expanded|anniversary|special|collector)\b/.test(lower)) return 'deluxe'
  
  return 'studio' // Default: assume studio album
}

function selectBestAlbum(albums: string[]): string {
  return albums.sort((a, b) => {
    const typeA = classifyAlbum(a)
    const typeB = classifyAlbum(b)
    return (ALBUM_TYPE_PRIORITY[typeA] ?? 99) - (ALBUM_TYPE_PRIORITY[typeB] ?? 99)
  })[0] ?? ''
}
```

## LRCLIB ID Mapping

All LRCLIB variations map to one canonical song. Multiple LRCLIB entries exist for the same song because:
- Different albums (studio, remaster, greatest hits)
- Different submissions by users
- Some have synced lyrics, some don't
- Some have garbage data

```typescript
// song_lrclib_ids table structure
interface SongLrclibId {
  id: string
  songId: string         // FK to songs.id
  lrclibId: number       // LRCLIB database ID
  isPrimary: boolean     // Best version for this song
  createdAt: Date
}
```

## Existing Scoring Logic

ScrollTunes already has comprehensive scoring in `lyrics-client.ts`:

```typescript
// scoreTrackCandidate() scoring factors:
+100  // Has valid synced lyrics (required, or score = 0)
+50   // Duration within ±2s of target
+30   // Duration within ±5s
+10   // Duration within ±10s
+20   // Good album name (not "-", "null", etc.)
+30   // Album matches canonical album name
+25   // Studio version (not live/remix/remaster)
+40   // Artist exact match
+20   // Artist partial match
-60   // Different artist (likely a cover)
+40   // Title exact match
+20   // Title partial match
```

Low-quality albums are filtered: `"-"`, `"."`, `"null"`, `"unknown"`, `"drumless"`, etc.

## Complete Storage Flow

```
User searches "Nothing Else Matters Metallica"
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Spotify Search                                           │
│    Returns: "Nothing Else Matters - Remastered 2021"        │
│    Spotify ID: 0nLiqZ9...                                   │
│    Duration: 386s                                           │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. LRCLIB Availability Check                                │
│    Query: track_name, artist_name, album_name, duration     │
│    Returns multiple candidates:                             │
│      ID 12345: "Metallica" album, synced ✅, 386s           │
│      ID 12346: "-" album, no synced ❌                      │
│      ID 12347: "S&M" (live), synced ✅, 425s                │
│      ID 12348: "Greatest Hits", synced ✅, 388s             │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Score All Candidates                                     │
│    scoreTrackCandidate() for each:                          │
│      ID 12345: 235 pts (best) ⭐                            │
│      ID 12346: 0 pts (excluded - no synced lyrics)          │
│      ID 12347: 130 pts (live version penalty)               │
│      ID 12348: 195 pts (compilation, duration close)        │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Normalize & Check Database                               │
│    titleLower = "nothing else matters"                      │
│    artistLower = "metallica"                                │
│                                                             │
│    SELECT * FROM songs                                      │
│    WHERE artist_lower = 'metallica'                         │
│      AND title_lower = 'nothing else matters'               │
└─────────────────────────────────────────────────────────────┘
     │
     ├── Song exists? ──► Update if better data available
     │
     └── Song not found? ──► Create canonical entry
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Upsert Canonical Song                                    │
│                                                             │
│    songs table:                                             │
│      id: uuid-abc                                           │
│      title: "Nothing Else Matters"                          │
│      artist: "Metallica"                                    │
│      album: "Metallica" (best album from scoring)           │
│      titleLower: "nothing else matters"                     │
│      artistLower: "metallica"                               │
│      albumLower: "metallica"                                │
│      spotifyId: "0nLiqZ9..."                                │
│      durationMs: 386000                                     │
│      hasSyncedLyrics: true                                  │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Store ALL Valid LRCLIB IDs                               │
│                                                             │
│    song_lrclib_ids table:                                   │
│      lrclibId: 12345 → songId: uuid-abc, isPrimary: true    │
│      lrclibId: 12347 → songId: uuid-abc, isPrimary: false   │
│      lrclibId: 12348 → songId: uuid-abc, isPrimary: false   │
│                                                             │
│    (ID 12346 excluded - no synced lyrics)                   │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Return Search Result                                     │
│                                                             │
│    {                                                        │
│      id: "lrclib-12345",        // Primary ID               │
│      lrclibId: 12345,                                       │
│      name: "Nothing Else Matters",                          │
│      artist: "Metallica",                                   │
│      album: "Metallica",                                    │
│      albumArt: "https://...",                               │
│      duration: 386000,                                      │
│      hasLyrics: true                                        │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
```

## Lyrics Fetch with Fallback

When user navigates to `/song/metallica/nothing-else-matters-12345`:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Try Primary ID                                           │
│    getLyricsById(12345)                                     │
└─────────────────────────────────────────────────────────────┘
     │
     ├── Success ──► Return lyrics, done
     │
     └── LyricsInvalidError ──► Fallback
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. findBestAlternativeLyrics()                              │
│    Search LRCLIB for "Nothing Else Matters" + "Metallica"   │
│    Score results, exclude failed ID 12345                   │
│    Return best alternative (ID 12348 or 12347)              │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Update Primary (optional)                                │
│    If 12345 consistently fails, demote it:                  │
│    UPDATE song_lrclib_ids                                   │
│    SET is_primary = false WHERE lrclib_id = 12345           │
│                                                             │
│    UPDATE song_lrclib_ids                                   │
│    SET is_primary = true WHERE lrclib_id = 12348            │
└─────────────────────────────────────────────────────────────┘
```

## Accumulating Knowledge Over Time

The system gets smarter as more users search:

```
Day 1: User A searches "nothing else matters"
  → Creates song uuid-abc
  → Stores lrclibId 12345 (primary)

Day 2: User B searches "nothing else matters metallica black album"
  → Finds existing song uuid-abc
  → Adds lrclibId 12348 (from different album)
  → 12345 stays primary (higher score)

Day 3: User C clicks result, but ID 12345 has corrupt data
  → getLyricsByIdWithFallback() kicks in
  → Returns lyrics from 12348 instead
  → Optionally: flag 12345 for review or demote

Day 4: Admin uploads Guitar Pro enhancement
  → Enhancement linked to song uuid-abc
  → Works with ANY lrclibId mapped to this song
```

## Client-Side Caching Strategy

### localStorage Keys

| Key | Contents | TTL | Size |
|-----|----------|-----|------|
| `scrolltunes:recents` | Recent songs list (max 5) | None | ~2KB |
| `scrolltunes:lyrics:{id}` | Cached lyrics + metadata | 7 days | ~10KB each |
| `scrolltunes:favorites` | Favorite songs list | None | ~5KB |
| `scrolltunes:prefs` | User preferences | None | ~1KB |

### CachedLyrics Structure

```typescript
interface CachedLyrics {
  version: number                    // Cache version (currently 9)
  lyrics: Lyrics                     // Full lyrics with lines
  bpm: number | null
  key: string | null
  albumArt?: string                  // Spotify/Deezer album art URL
  spotifyId?: string
  bpmSource?: AttributionSource      // { name, url }
  lyricsSource?: AttributionSource
  hasEnhancement?: boolean           // Word-level timing available
  enhancement?: EnhancementPayload   // Word timing data
  hasChordEnhancement?: boolean
  chordEnhancement?: ChordEnhancementPayloadV1
  cachedAt: number                   // Timestamp for TTL check
}
```

### Cache Invalidation

```typescript
// lyrics-cache.ts
const CACHE_VERSION = 9  // Bump when schema changes
const LYRICS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

function loadCachedLyrics(id: number): CachedLyrics | null {
  const parsed = JSON.parse(localStorage.getItem(key))
  
  // Invalidate on version mismatch
  if (parsed.version !== CACHE_VERSION) return null
  
  // Invalidate on TTL expiry
  if (Date.now() - parsed.cachedAt > LYRICS_CACHE_TTL_MS) return null
  
  // Invalidate if lyrics are garbage
  if (!parsed.lyrics?.lines?.length) return null
  
  return parsed
}
```

### Enhancement Caching

Enhancements are cached WITH the lyrics to avoid separate fetches:

```
User loads song page
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Check localStorage cache                                 │
│    loadCachedLyrics(lrclibId)                               │
│    If valid: use cached lyrics + enhancement                │
└─────────────────────────────────────────────────────────────┘
     │
     └── Cache miss or expired
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Fetch from /api/lyrics/{id}                              │
│    Returns: lyrics, bpm, key, albumArt, enhancement, etc.   │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Apply enhancement before caching                         │
│    applyEnhancement(lyrics, enhancement)                    │
│    Adds word-level timing to each line                      │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Save to localStorage                                     │
│    saveCachedLyrics(id, { lyrics, enhancement, ... })       │
│    Enhancement is stored for offline karaoke mode           │
└─────────────────────────────────────────────────────────────┘
```

## Missing Metadata Retrieval

### Album Art Sources

Priority order for album art:

1. **Spotify** (during search) - Highest quality, canonical
2. **Deezer** (fallback) - When Spotify unavailable
3. **Cached** - From previous fetch

```
Search flow:
  Spotify → provides albumArt URL directly

LRCLIB fallback flow:
  LRCLIB (no art) → Deezer lookup → albumArt URL
```

### Album Name Sources

Priority order for album names:

1. **Spotify metadata** - Canonical album name
2. **LRCLIB** - May have "-", "null", or user-submitted garbage
3. **Cached** - From previous fetch with valid album

```typescript
// Best album selection
function selectBestAlbumName(
  spotify: string | null, 
  lrclib: string | null, 
  cached: string | null
): string {
  // Spotify is authoritative
  if (spotify && spotify.trim()) return spotify
  
  // LRCLIB if not garbage
  if (lrclib && !LOW_QUALITY_ALBUMS.has(lrclib.toLowerCase())) return lrclib
  
  // Fall back to cached
  if (cached && cached.trim()) return cached
  
  return ''
}
```

### Background Metadata Refresh

When songs are missing album info, background refresh is triggered:

```
┌─────────────────────────────────────────────────────────────┐
│ useLocalSongCache() hook                                    │
│ Scans all cached lyrics every 5 seconds                     │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ Identify songs missing album                                │
│ Filter: !album || album.trim() === ""                       │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ runRefreshMissingAlbums(songsNeedingAlbum)                  │
│ Fire-and-forget background fetch                            │
│ Tracks refreshed IDs to avoid repeated attempts             │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ For each song: GET /api/lyrics/{id}                         │
│ API triggers Spotify lookup for missing metadata            │
│ Returns enriched data with album + albumArt                 │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ Update localStorage cache                                   │
│ Update RecentSongsStore / FavoritesStore                    │
│ UI reactively updates via useSyncExternalStore              │
└─────────────────────────────────────────────────────────────┘
```

### Search Result Enrichment

When local matches are shown alongside API results:

```typescript
// SongSearch.tsx - enrichedLocalMatches
const enrichedLocalMatches = localMatches.map(local => {
  if (local.album) return local  // Already has album
  
  // Try lrclibId match first
  let apiMatch = apiResultsByLrclibId.get(local.lrclibId)
  
  // Fall back to title+artist match (different versions)
  if (!apiMatch) {
    const key = `${normalized.artist}:${normalized.title}`
    apiMatch = apiResultsByTitleArtist.get(key)
  }
  
  if (apiMatch?.album) {
    return {
      ...local,
      album: apiMatch.album,
      albumArt: local.albumArt ?? apiMatch.albumArt,
    }
  }
  return local
})
```

### Persisting Enriched Metadata

When API provides missing album info, persist to stores:

```typescript
// SongSearch.tsx
useEffect(() => {
  for (const local of localMatches) {
    const apiMatch = apiResultsByLrclibId.get(local.lrclibId)
    if (apiMatch && !local.album && apiMatch.album) {
      // Persist to both stores
      favoritesStore.updateMetadata(local.lrclibId, {
        album: apiMatch.album,
        albumArt: apiMatch.albumArt,
      })
      recentSongsStore.updateAlbumInfo(local.lrclibId, {
        album: apiMatch.album,
        albumArt: apiMatch.albumArt,
      })
    }
  }
}, [localMatches, apiResults])
```

## BPM Retrieval and Storage

### BPM Provider Cascade

When a song loads, BPM is fetched from multiple providers with fallback:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Check Catalog Cache                                      │
│    getCachedBpmFromCatalog(lrclibId)                        │
│    If song exists in DB with BPM → use cached value         │
└─────────────────────────────────────────────────────────────┘
     │
     └── Cache miss
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Has Spotify ID?                                          │
│    ├── Yes: Race providers (parallel, first wins)           │
│    │        ReccoBeats + GetSongBPM + Deezer                 │
│    │                                                         │
│    └── No: Fallback chain (sequential)                      │
│            GetSongBPM → Deezer                               │
└─────────────────────────────────────────────────────────────┘
     │
     └── All providers failed + has Spotify ID
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Last Resort: RapidAPI-Spotify                            │
│    Rate limited: 20 requests/day via Upstash Redis          │
│    Warnings at 75%, 85%, 95% usage                          │
└─────────────────────────────────────────────────────────────┘
```

### BPM Providers

| Provider | Auth | Rate Limit | Notes |
|----------|------|------------|-------|
| **ReccoBeats** | None | None | Requires Spotify ID, most accurate |
| **GetSongBPM** | API Key | 3000/hour | Title/artist search |
| **Deezer** | None | None | Less accurate, fallback |
| **RapidAPI-Spotify** | API Key | 20/day | Last resort, Upstash rate limit |

### BPM Storage Flow

When BPM is retrieved, it's stored in both server (songs table) and client (localStorage):

```
Song page loads
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. GET /api/lyrics/{id}                                     │
│    Returns: lyrics, bpm, key, attribution                   │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Client receives BPM + attribution                        │
│                                                             │
│    data.bpm = 120                                           │
│    data.key = "E minor"                                     │
│    data.attribution.bpm = {                                 │
│      name: "ReccoBeats",                                    │
│      url: "https://reccobeats.com"                          │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
     │
     ├── Client-side: Cache in localStorage
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. saveCachedLyrics(id, {                                   │
│      lyrics,                                                │
│      bpm: data.bpm,                                         │
│      key: data.key,                                         │
│      bpmSource: data.attribution.bpm,                       │
│      ...                                                    │
│    })                                                       │
└─────────────────────────────────────────────────────────────┘
     │
     ├── Server-side: Upsert to songs catalog (fire-and-forget)
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. POST /api/songs/upsert                                   │
│    (Only for authenticated users)                           │
│                                                             │
│    {                                                        │
│      title, artist, album, lrclibId, spotifyId,             │
│      bpmAttribution: {                                      │
│        bpm: 120,                                            │
│        musicalKey: "E minor",                               │
│        source: "ReccoBeats",                                │
│        sourceUrl: "https://reccobeats.com"                  │
│      }                                                      │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Database upsert (songs table)                            │
│                                                             │
│    INSERT ... ON CONFLICT (artist_lower, title_lower)       │
│    DO UPDATE SET                                            │
│      bpm = 120,                                             │
│      musical_key = 'E minor',                               │
│      bpm_source = 'ReccoBeats',                             │
│      bpm_source_url = 'https://reccobeats.com'              │
│                                                             │
│    Only updates BPM if not already set (doesn't overwrite)  │
└─────────────────────────────────────────────────────────────┘
```

### BPM in songs Table

```sql
-- Songs table BPM columns
bpm              INTEGER,          -- 120
musical_key      TEXT,             -- "E minor"
bpm_source       TEXT,             -- "ReccoBeats"
bpm_source_url   TEXT              -- "https://reccobeats.com"
```

### BPM in CachedLyrics (localStorage)

```typescript
interface CachedLyrics {
  // ... other fields
  bpm: number | null              // 120
  key: string | null              // "E minor"
  bpmSource?: AttributionSource   // { name: "ReccoBeats", url: "..." }
}
```

### Next Song Load (Cached Path)

Once BPM is stored, subsequent requests use the cached value:

```
GET /api/lyrics/{id}
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│ getCachedBpmFromCatalog(lrclibId)                           │
│                                                             │
│    SELECT bpm, musical_key, bpm_source, bpm_source_url      │
│    FROM song_lrclib_ids                                     │
│    JOIN songs ON songs.id = song_lrclib_ids.song_id         │
│    WHERE lrclib_id = {id}                                   │
└─────────────────────────────────────────────────────────────┘
     │
     ├── Found: Skip external provider calls entirely
     │
     └── Return cached BPM with response
```

### Attribution Display

BPM attribution is shown in the UI with required backlinks:

```typescript
// SongActionBar.tsx
{bpmSource && (
  <a href={bpmSource.url} target="_blank" rel="noopener noreferrer">
    BPM data from {bpmSource.name}
  </a>
)}
```

## Prefetch Strategy

### On App Load

```typescript
// AuthProvider.tsx
useEffect(() => {
  if (!isAuthenticated) {
    // Anonymous users: prefetch top 20 songs
    runPrefetchTopSongs(20)
  } else {
    // Authenticated: sync history, then prefetch gaps
    syncHistory()
    prefetchMissingSongs()
  }
}, [])
```

### Prefetch Service (Effect.ts)

```typescript
// lyrics-prefetch.ts
const prefetchLyricsImpl = (id: number) =>
  Effect.gen(function* () {
    const response = yield* fetchSvc.fetch(`/api/lyrics/${id}`)
    const data = yield* response.json()
    
    // Apply enhancement BEFORE caching
    const enhancedLyrics = data.enhancement
      ? applyEnhancement(data.lyrics, data.enhancement)
      : data.lyrics
    
    return {
      id,
      lyrics: enhancedLyrics,
      albumArt: data.albumArt,
      bpm: data.bpm,
      hasEnhancement: data.hasEnhancement,
      enhancement: data.enhancement,
      // ... other fields
    }
  })
```

### What Gets Prefetched

| Trigger | Songs Prefetched | Concurrency |
|---------|------------------|-------------|
| App load (anon) | Top 20 by play count | 3 parallel |
| App load (auth) | User's history gaps | 3 parallel |
| After playing song | Same artist discography (proposed) | 2 parallel |
| Search result click | Song + related (proposed) | 1 |

## ~~Proposed Song Index~~ (Removed)

> **Status:** This feature was implemented and later removed. The client-side songIndex
> added complexity and caused display issues (lowercase text flashing before API enrichment).
> With Turso providing fast FTS search (~100-350ms), the songIndex is no longer needed.
> Local search now uses only `useLocalSongCache` (favorites, recents, setlists, prefetched lyrics).

## Vercel-Specific Optimizations

### Vercel KV for Query Caching

Cache popular search queries at the edge:

```typescript
import { kv } from '@vercel/kv'

// /api/search/route.ts
const QUERY_CACHE_TTL = 60 * 60 // 1 hour

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')
  const cacheKey = `search:${normalizeQuery(query)}`
  
  // Check KV cache first
  const cached = await kv.get(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT' } })
  }
  
  // Perform search and cache result
  const results = await search(query)
  await kv.set(cacheKey, { tracks: results }, { ex: QUERY_CACHE_TTL })
  
  return NextResponse.json({ tracks: results })
}
```

### CDN Cache Headers

Leverage Vercel's CDN:

```typescript
return NextResponse.json(data, {
  headers: {
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  },
})
```

### ISR for Song Index

Use Incremental Static Regeneration:

```typescript
// /api/songs/index/route.ts
export const revalidate = 3600 // Regenerate every hour
```

## Edge Cases

### 1. Truly Different Songs with Same Name

"Angel" by Sarah McLachlan vs "Angel" by Shaggy:
- Different `artistLower` → separate entries ✓

### 2. Same Song, Different Primary Artists

"Lady Marmalade" - Original vs remake:
- Different artists = different entries (intentional)
- Each gets their own canonical entry

### 3. Covers

"Hurt" by Nine Inch Nails vs Johnny Cash:
- Different artists = different entries ✓
- Scoring penalizes artist mismatch (-60 points)

### 4. Songs with Special Characters

"Scheiße" by Lady Gaga:
- Normalize with diacritics removed: "scheisse"
- Or preserve: "scheiße" (both approaches valid)

## Implementation Checklist

### Already Implemented ✅

**Database & Deduplication:**
- [x] `songs` table with `titleLower`/`artistLower` for deduplication
- [x] `UNIQUE(artistLower, titleLower)` constraint
- [x] `song_lrclib_ids` table for many-to-one mapping
- [x] `is_primary` flag in `song_lrclib_ids`

**Scoring & Selection:**
- [x] `scoreTrackCandidate()` - comprehensive scoring logic
- [x] `scoreLyricsResult()` - scoring for fallback search
- [x] `findBestAlternativeLyrics()` - fallback when primary fails
- [x] `getLyricsByIdWithFallback()` - automatic retry with alternatives
- [x] `isStudioVersion()` - detect live/remix/remaster
- [x] `LOW_QUALITY_ALBUMS` set - filter garbage entries

**Normalization:**
- [x] `@web-scrobbler/metadata-filter` integration
- [x] Basic suffix stripping (remaster, radio edit, etc.)
- [x] `normalizeTrackName()`, `normalizeArtistName()`, `normalizeAlbumName()`
- [x] `createDeduplicationKey()` for consistent matching

**Caching & Storage:**
- [x] `CachedLyrics` interface with version tracking
- [x] 7-day TTL with version-based invalidation
- [x] Enhancement caching with lyrics
- [x] `loadCachedLyrics()` / `saveCachedLyrics()` utilities
- [x] `getAllCachedLyrics()` for index building

**Prefetch:**
- [x] `LyricsPrefetchService` with Effect.ts DI
- [x] `runPrefetchTopSongs()` on app load
- [x] `runPrefetchSongs()` for arbitrary ID lists
- [x] Enhancement applied before caching
- [x] Concurrency limit (3 parallel)

**Metadata Enrichment:**
- [x] `useLocalSongCache()` hook for local search
- [x] `runRefreshMissingAlbums()` background refresh
- [x] Search result enrichment from API matches
- [x] `recentSongsStore.updateAlbumInfo()` persistence
- [x] `favoritesStore.updateMetadata()` persistence
- [x] Album art from Spotify (primary) / Deezer (fallback)

**BPM Retrieval & Storage:**
- [x] BPM provider cascade (ReccoBeats → GetSongBPM → Deezer → RapidAPI)
- [x] `getCachedBpmFromCatalog()` - check DB before external calls
- [x] `getBpmRace()` / `getBpmWithFallback()` - Effect.ts patterns
- [x] RapidAPI rate limiting via Upstash Redis (20/day cap)
- [x] BPM columns in `songs` table (bpm, musical_key, bpm_source, bpm_source_url)
- [x] BPM upsert via `/api/songs/upsert` (fire-and-forget on song load)
- [x] BPM caching in `CachedLyrics` (localStorage)
- [x] Attribution display with required backlinks

### To Implement 🔧

**Turso Search Index (NEW - Priority: HIGH):**
- [ ] Create extraction script to process LRCLIB dump (72GB → ~1.5GB)
- [ ] Implement deduplication: group by (title_norm, artist_norm), score, select best
- [ ] Scoring: album type (+40 studio, -20 live) + duration proximity + penalties
- [ ] Build FTS5 index with porter tokenizer
- [ ] Set up Turso account and upload index
- [ ] Add `@libsql/client` and create `TursoSearchService`
- [ ] Refactor `/api/search` to query Turso first
- [ ] Implement fallback to Spotify→LRCLIB with upsert-on-success
- [ ] Add Spotify enrichment (background) for album art + spotifyId

**Schema Updates:**
- [x] Add `album_lower` column to `songs` table
- [x] Create index on `album_lower` for search
- [x] Migration `0003_add_album_lower.sql` created

**Normalization Enhancements:**
- [x] Enhance `normalizeTrackName()` with comprehensive suffix list
  - Anniversary editions, collector's editions
  - Year suffixes (`- 2021`, `(2016 Version)`)
  - Live/acoustic variants, demo/alternate takes
  - Format variants (mono, stereo, extended mix)
- [x] Enhance `normalizeArtistName()` with band qualifier removal
  - Band, orchestra, ensemble, quartet, trio
- [x] Add `classifyAlbum()` function for best album selection
- [x] Add `selectBestAlbum()` function
- [ ] Add spelling normalization (colors/colours) - optional, deferred
- [ ] Port normalization logic to Python/SQL for extraction script

**Search Flow Integration:**
- [ ] Store ALL valid LRCLIB IDs during search (not just selected one)
- [ ] Mark highest-scoring as `is_primary = true`
- [ ] Update album if better one found (studio > live > compilation)
- [ ] Demote `is_primary` when ID consistently fails

**Data Quality:**
- [ ] Create migration script to re-normalize existing songs
- [ ] Backfill missing `song_lrclib_ids` mappings
- [ ] Add admin UI to manually merge/split song entries
- [ ] Add monitoring for deduplication quality

**Deprecated (superseded by Turso):**
- ~~Song Index with Fuse.js~~ → Turso has 5-6M songs
- ~~Vercel Edge Config for song index~~ → Turso replaces this
- ~~Vercel KV for query caching~~ → Turso is fast enough

**Optional Enhancements:**
- [ ] Vercel KV for caching Turso results (<10ms repeat queries)
- [ ] Local Fuse.js as offline fallback
- [ ] Prefetch artist discography after song play
- [ ] Prefetch on search result hover
