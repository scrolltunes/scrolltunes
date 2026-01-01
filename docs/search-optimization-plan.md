# Search Optimization Plan

> Goal: Near-instant search results (<50ms perceived latency) to beat Google for lyrics lookup

## Current Architecture (Implemented)

### Spotify-First with Turso Verification

```
User types "never too late"
         │
         ▼
   ┌─────────────┐
   │   Spotify   │  → ~100ms (popularity-ranked)
   │   Search    │
   └──────┬──────┘
          │
          ▼ (max 8 results)
   ┌─────────────────────┐
   │  Turso Lookup       │  → ~100-350ms (parallel, unbounded)
   │  findByTitleArtist  │
   │  phrase match       │
   └──────────┬──────────┘
              │
        ┌─────┴─────┐
        │           │
      Found     Not Found
        │           │
        ▼           ▼
   Return with    Skip
   Spotify metadata
   + LRCLIB ID
```

**Key insight:** Spotify handles popularity ranking; Turso just verifies LRCLIB availability.

### Fallback Chain

```
Spotify + Turso → Turso Direct + Deezer → LRCLIB API + Deezer
      │                  │                      │
   Primary          Spotify down           Both down
```

### Implementation Files

| File | Purpose |
|------|---------|
| `src/services/turso.ts` | TursoService with `search()`, `getById()`, `findByTitleArtist()` |
| `src/app/api/search/route.ts` | Search endpoint with Spotify-first flow |
| `src/lib/turso-usage-tracker.ts` | Usage monitoring via Platform API |
| `src/app/api/cron/turso-usage/route.ts` | Hourly cron for usage alerts |
| `scripts/lrclib-extract/` | Rust extraction tool for building index |

### Search Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Spotify fetch count | `Math.min(limit + 2, 8)` | Enough for dedup, not too many Turso calls |
| Turso concurrency | `"unbounded"` | Max parallelism for 5-8 lookups |
| Deezer concurrency | `4` | Respect third-party rate limits |

## Performance

### Turso Query Latency

| State | Latency |
|-------|---------|
| Cold start (after idle) | 3-14s |
| Warm | 75-350ms per query |
| Parallel (8 queries) | ~100-350ms total |

### End-to-End Search Latency

| Scenario | Expected |
|----------|----------|
| Spotify + Turso (warm) | ~400-600ms |
| Turso direct (warm) | ~300-500ms |
| LRCLIB API fallback | ~3-5s |

## Turso Schema

```sql
CREATE TABLE tracks (
  id           INTEGER PRIMARY KEY,  -- lrclib_id
  title        TEXT NOT NULL,
  artist       TEXT NOT NULL,
  album        TEXT,
  duration_sec INTEGER NOT NULL,
  title_norm   TEXT NOT NULL,
  artist_norm  TEXT NOT NULL,
  quality      INTEGER NOT NULL      -- 80=studio, 50=live, 30=garbage, etc.
);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
  title, artist,
  content='tracks',
  content_rowid='id',
  tokenize='porter'
);
```

### Query Patterns

**Spotify-first (phrase match):**
```sql
SELECT t.* FROM tracks_fts fts
JOIN tracks t ON fts.rowid = t.id
WHERE tracks_fts MATCH '"Never Too Late" "Three Days Grace"'
ORDER BY t.quality DESC
LIMIT 1
```

**Fallback (free-form search):**
```sql
SELECT t.* FROM tracks_fts fts
JOIN tracks t ON fts.rowid = t.id
WHERE tracks_fts MATCH 'never too late'
ORDER BY -bm25(tracks_fts, 10.0, 1.0) + t.quality DESC
LIMIT 10
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

## Why Spotify-First?

### Problem with Turso-First

Without popularity data, BM25 ranking doesn't know that Three Days Grace's "Never Too Late" is more famous than Kylie Minogue's. Garbage titles with more term matches ranked higher.

### Solution

Let Spotify handle popularity ranking. We just verify LRCLIB availability via Turso phrase match. Benefits:

1. **Popularity ranking** — Spotify knows what's popular
2. **Album art** — Spotify provides high-quality images
3. **Normalized metadata** — Spotify has clean artist/title
4. **Fast verification** — Turso phrase match is O(1), ~100ms

### When Spotify Fails

Fall back to Turso direct search with Deezer album art. Quality score helps rank results.

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| ~~Need complex BM25 + quality weighting?~~ | No, Spotify handles popularity |
| ~~Rebuild index for new flow?~~ | No, existing index works |
| ~~Track Turso usage?~~ | Yes, hourly cron with alerts |
| ~~Optimal concurrency?~~ | Unbounded (5-8 parallel lookups) |

## Future Optimizations

1. **Vercel KV cache** — Cache Turso results for <10ms repeat queries
2. **Embedded replicas** — Turso supports local SQLite replicas for ~1ms reads
3. **Incremental updates** — Track new songs from fallback, batch import
4. **Popularity enrichment** — Optional: add Spotify popularity to index for fallback ranking
