# Spec 002: Turso Schema Migration

## Overview

Deploy the enriched LRCLIB database with Spotify metadata to Turso and update the TypeScript service layer.

## Context

- **Current service**: `src/services/turso.ts`
- **Current interface**: `TursoSearchResult` with 6 fields
- **Turso limits**: 5GB free tier, currently using ~600MB

## Requirements

### 2.1 Full Extraction Run

Run the enhanced extraction tool with Spotify enrichment:

```bash
./lrclib-extract \
  /path/to/lrclib-dump.sqlite3 \
  ./lrclib-enriched.sqlite3 \
  --spotify /path/to/spotify_clean.sqlite3 \
  --audio-features /path/to/spotify_clean_audio_features.sqlite3 \
  --min-popularity 1
```

Expected output:
- ~4.2M tracks
- ~1.05GB database size
- ~80% Spotify match rate

### 2.2 Verification Queries

Before deployment, verify the enriched database:

```sql
-- Total tracks
SELECT COUNT(*) FROM tracks;  -- Expected: ~4.2M

-- Match rate
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
  ROUND(100.0 * SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as match_rate
FROM tracks;  -- Expected: ~80%

-- Sample enriched track
SELECT * FROM tracks WHERE spotify_id IS NOT NULL LIMIT 1;

-- Sample unenriched track (should still work)
SELECT * FROM tracks WHERE spotify_id IS NULL LIMIT 1;

-- FTS search with enrichment
SELECT id, title, artist, popularity, tempo
FROM tracks_fts fts
JOIN tracks t ON fts.rowid = t.id
WHERE tracks_fts MATCH 'nothing else matters'
ORDER BY popularity DESC
LIMIT 5;
```

### 2.3 Upload to Turso

Use existing deployment process or Turso CLI:

```bash
# Option 1: turso db shell (for small updates)
turso db shell scrolltunes-lrclib < lrclib-enriched.sqlite3

# Option 2: Replace database (for full rebuild)
turso db destroy scrolltunes-lrclib --yes
turso db create scrolltunes-lrclib --from-file lrclib-enriched.sqlite3
```

### 2.4 Update TursoSearchResult Interface

```typescript
// src/services/turso.ts

export interface TursoSearchResult {
  // Existing fields
  readonly id: number              // lrclib_id
  readonly title: string
  readonly artist: string
  readonly album: string | null
  readonly durationSec: number
  readonly quality: number

  // NEW: Spotify enrichment (all nullable)
  readonly spotifyId: string | null
  readonly popularity: number | null  // 0-100, null if no Spotify match
  readonly tempo: number | null       // BPM
  readonly musicalKey: number | null  // 0-11, -1 = unknown
  readonly mode: number | null        // 0=minor, 1=major
  readonly timeSignature: number | null  // 3-7
  readonly isrc: string | null
  readonly albumImageUrl: string | null  // Medium (300px) Spotify CDN URL
}
```

### 2.5 Update Search Query

```typescript
const search = (query: string, limit = 10) =>
  Effect.gen(function* () {
    const client = yield* getClient
    const result = yield* Effect.tryPromise({
      try: async () => {
        const rs = await client.execute({
          sql: `
            SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality,
                   t.spotify_id, t.popularity, t.tempo, t.musical_key, t.mode,
                   t.time_signature, t.isrc, t.album_image_url
            FROM tracks_fts fts
            JOIN tracks t ON fts.rowid = t.id
            WHERE tracks_fts MATCH ?
            ORDER BY
              (t.popularity IS NOT NULL) DESC,
              t.popularity DESC,
              t.quality DESC,
              -bm25(tracks_fts) ASC
            LIMIT ?
          `,
          args: [query, limit],
        })
        return rs.rows
      },
      catch: error => new TursoSearchError({ message: "Turso search failed", cause: error }),
    })

    return result.map(row => ({
      id: row.id as number,
      title: row.title as string,
      artist: row.artist as string,
      album: row.album as string | null,
      durationSec: row.duration_sec as number,
      quality: row.quality as number,
      // Spotify enrichment
      spotifyId: row.spotify_id as string | null,
      popularity: row.popularity as number | null,
      tempo: row.tempo as number | null,
      musicalKey: row.musical_key as number | null,
      mode: row.mode as number | null,
      timeSignature: row.time_signature as number | null,
      isrc: row.isrc as string | null,
      albumImageUrl: row.album_image_url as string | null,
    }))
  })
```

### 2.6 Update getById Query

Add enrichment fields to the `getById` function.

### 2.7 Update findByTitleArtist Query

Add enrichment fields to the `findByTitleArtist` function.

### 2.8 NULL Handling

All Spotify fields are nullable. Client code must handle:
- `popularity === null` → Track has no Spotify match, use quality-based ranking
- `tempo === null` → Fall back to BPM provider cascade
- `albumImageUrl === null` → Fall back to Deezer lookup

## Acceptance Criteria

1. Enriched database deployed to Turso successfully
2. `TursoSearchResult` interface updated with all new fields
3. Search returns enrichment data when available
4. NULL values handled gracefully throughout the codebase
5. `bun run typecheck` passes
6. Turso storage shows ~1.05GB (21% of 5GB limit)

## Files to Modify

- `src/services/turso.ts` - Update interface and queries

## Testing

```bash
# TypeScript check
bun run typecheck

# Manual API test
curl "http://localhost:3000/api/search?q=nothing+else+matters" | jq '.tracks[0]'
# Should show spotifyId, popularity, tempo, etc.
```
