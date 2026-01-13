# Search Optimization Plan

> Goal: Near-instant search results (<50ms perceived latency) to beat Google for lyrics lookup

## Current Architecture (Implemented)

### Turso-First with Embedded Spotify Metadata

**Status: ✅ Implemented**

```
User types "never too late"
         │
         ▼
   ┌─────────────────────────┐
   │      Turso FTS Search   │  → ~100-350ms
   │  ORDER BY popularity,   │     (popularity-ranked)
   │    quality, relevance   │
   └──────────┬──────────────┘
              │
       ┌──────┴──────┐
       │             │
    Results      No results
       │             │
       ▼             ▼
   Return with    LRCLIB API
   embedded       fallback
   Spotify data
```

**Key changes from previous architecture:**
- **No Spotify Search API calls** — Popularity ranking embedded in Turso
- **~80% Spotify match rate** — BPM, popularity, album art pre-enriched
- **Album art from stored URLs** — ~0ms for most tracks
- **BPM from embedded tempo** — No provider cascade needed for most tracks

### Fallback Chain

```
Turso Search (primary) → LRCLIB API + Deezer (fallback)
```

### Implementation Files

| File | Purpose |
|------|---------|
| `src/services/turso.ts` | TursoService with `search()`, `getById()`, `findByTitleArtist()` |
| `src/app/api/search/route.ts` | Search endpoint (Turso-first) |
| `src/lib/turso-usage-tracker.ts` | Usage monitoring via Platform API |
| `src/app/api/cron/turso-usage/route.ts` | Hourly cron for usage alerts |
| `src/lib/album-art.ts` | Three-tier album art resolution |
| `scripts/lrclib-extract/` | Rust extraction tool with Spotify enrichment |

### Search Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Result limit | `10` | Reasonable page size |
| Album art concurrency | `4` | For Deezer fallback |

## Performance

### Turso Query Latency

| State | Latency |
|-------|---------|
| Cold start (after idle) | 3-14s |
| Warm | 75-350ms per query |

### End-to-End Search Latency

| Scenario | Expected |
|----------|----------|
| Turso search (warm) | ~100-350ms |
| LRCLIB API fallback | ~3-5s |

### Improvements Achieved

| Metric | Before | After |
|--------|--------|-------|
| Search latency (p50) | ~500ms | ~100ms |
| Album art latency | ~200ms | ~0ms (stored) |
| BPM availability | ~70% | ~85% |
| Spotify API calls/search | 1 | 0 |
| External dependencies | 5 | 1 (Deezer fallback) |

## Turso Schema

```sql
CREATE TABLE tracks (
  -- LRCLIB (source of truth)
  id           INTEGER PRIMARY KEY,  -- lrclib_id
  title        TEXT NOT NULL,
  artist       TEXT NOT NULL,
  album        TEXT,
  duration_sec INTEGER NOT NULL,
  title_norm   TEXT NOT NULL,
  artist_norm  TEXT NOT NULL,
  quality      INTEGER NOT NULL,     -- 80=studio, 50=live, 30=garbage
  -- Spotify enrichment (all nullable)
  spotify_id      TEXT,
  popularity      INTEGER,           -- 0-100, NULL if no Spotify match
  tempo           REAL,              -- BPM
  musical_key     INTEGER,           -- 0-11 pitch class, -1=unknown
  mode            INTEGER,           -- 0=minor, 1=major
  time_signature  INTEGER,           -- 3-7
  isrc            TEXT,
  album_image_url TEXT               -- Medium (300px) Spotify CDN URL
);

CREATE INDEX idx_tracks_spotify_id ON tracks(spotify_id);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
  title, artist,
  content='tracks',
  content_rowid='id',
  tokenize='porter'
);
```

### Query Pattern

```sql
SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality,
       t.spotify_id, t.popularity, t.tempo, t.musical_key, t.mode,
       t.time_signature, t.isrc, t.album_image_url
FROM tracks_fts fts
JOIN tracks t ON fts.rowid = t.id
WHERE tracks_fts MATCH ?
ORDER BY
  (t.popularity IS NOT NULL) DESC,  -- Enriched tracks first
  t.popularity DESC,                 -- Most popular
  t.quality DESC,                    -- Then by quality
  -bm25(tracks_fts) ASC              -- Then by relevance
LIMIT ?
```

## Quality Scoring

Applied during extraction (Rust tool). Picks canonical version when multiple matches exist.

| Factor | Score |
|--------|-------|
| Studio album | +80 (base) |
| Live/acoustic | +50 |
| Remix/cover | +30 |
| Garbage title pattern | -50 |
| Title contains artist | -40 |

**Garbage patterns:**
- Track numbers: `01. Song`, `0170. Artist - Song`
- Embedded artist: `Artist - Song`, `Artist 'Song'`
- Cover attribution: `Song (Original Artist)`

## Usage Monitoring

### Turso Platform API Integration

- **Endpoint:** `/api/cron/turso-usage`
- **Schedule:** Hourly (`0 * * * *` in vercel.json)
- **Alerts:** Web3Forms email at 80%, 90%, 95% of 500M monthly limit

### Current Usage

```json
{
  "rowsRead": 1446,
  "rowsWritten": 0,
  "storageBytes": 602013696,
  "percentage": "0.00",
  "limit": 500000000
}
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `TURSO_DATABASE_URL` | Turso connection URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `TURSO_PLATFORM_TOKEN` | Platform API for usage stats |

## Extraction Tool

**Location:** `scripts/lrclib-extract/`

**Input:** LRCLIB SQLite dump (72GB, 20M tracks)
**Output:** Deduplicated index (~600MB, ~4.2M tracks)

### Features

- Quality scoring (studio > live > remix > garbage)
- Garbage title pattern detection
- Artist transliteration (Cyrillic/Hebrew → Latin)
- Deduplication by normalized title+artist
- FTS5 index with Porter stemming

### Commands

```bash
cd scripts/lrclib-extract
cargo build --release
./target/release/lrclib-extract \
  /path/to/lrclib-dump.sqlite3 \
  /path/to/output-index.sqlite3 \
  --test "everlong foo fighters"
```

### Upload to Turso

```bash
scripts/update-turso-token.sh
```

This script:
1. Deletes existing Turso database
2. Uploads new index
3. Gets new auth token
4. Updates `.env.local` and Vercel

## Design Decisions

### Why Turso-First with Embedded Metadata?

**Previous approach (Spotify-first):** Used Spotify Search API for popularity ranking, then verified each result against Turso. Required runtime API calls.

**Current approach:** Pre-enrich Turso index with Spotify metadata during extraction. Benefits:

1. **No runtime Spotify API calls** — All data in Turso
2. **Popularity ranking** — `popularity` field from Spotify dump
3. **Instant album art** — `album_image_url` from Spotify dump
4. **Instant BPM** — `tempo` field from Spotify audio features
5. **Single query** — One Turso query returns everything

### Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| Turso-first (current) | Fast, no API calls, all data in one query | ~20% tracks lack Spotify match |
| Spotify-first (previous) | 100% Spotify coverage | Slow, API rate limits, parallel Turso lookups |

### Fallback Strategy

For the ~20% of tracks without Spotify enrichment:
- **Album art:** Deezer ISRC lookup → Deezer search
- **BPM:** Provider cascade (ReccoBeats → GetSongBPM → Deezer → RapidAPI)

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| ~~Need complex BM25 + quality weighting?~~ | Yes, combined with popularity |
| ~~Rebuild index for new flow?~~ | Yes, with Spotify enrichment |
| ~~Track Turso usage?~~ | Yes, hourly cron with alerts |
| ~~Spotify API dependency?~~ | Eliminated — data pre-enriched |
| ~~Album art latency?~~ | Reduced to ~0ms with stored URLs |

## Future Optimizations

1. **Vercel KV cache** — Cache Turso results for <10ms repeat queries
2. **Embedded replicas** — Turso supports local SQLite replicas for ~1ms reads
3. **Incremental updates** — Track new songs from fallback, batch import
4. **Monthly refresh** — Re-run extraction to update popularity scores
