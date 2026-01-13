# Spec 006: Documentation and Cleanup

## Overview

Update documentation to reflect the new Turso-first architecture, remove deprecated code, and add metrics logging.

## Requirements

### 6.1 Update Technical Reference

Update `docs/technical-reference.md`:

```markdown
## Search Architecture

### Turso-First Search (Current)

ScrollTunes uses a Turso-first search architecture with embedded Spotify metadata:

1. **Primary**: Turso FTS search with popularity ranking
2. **Album Art**: Stored URLs → Deezer ISRC → Deezer search
3. **Fallback**: LRCLIB API for edge cases

### Search Result Fields

| Field | Source | Description |
|-------|--------|-------------|
| id | LRCLIB | Primary identifier |
| title, artist, album | LRCLIB | Canonical metadata |
| spotifyId | Spotify dump | For future integrations |
| popularity | Spotify dump | 0-100, for ranking |
| tempo | Spotify dump | BPM |
| musicalKey | Spotify dump | 0-11 pitch class |
| albumImageUrl | Spotify dump | Medium (300px) |

### BPM Resolution

1. **Embedded**: Use `tempo` field from Turso (instant, no attribution)
2. **Fallback**: ReccoBeats → GetSongBPM → Deezer → RapidAPI
```

### 6.2 Update Search Optimization Plan

Update `docs/search-optimization-plan.md` to reflect current state:

```markdown
## Current State (Implemented)

- Turso-first search with embedded popularity
- ~80% Spotify match rate
- Album art from stored URLs (instant) or Deezer fallback
- No Spotify Search API dependency
```

### 6.3 Remove Deprecated Code

Files/functions to potentially remove:

- `src/app/api/search/verify/route.ts` - If no longer used
- `searchSpotifyWithTurso()` in search route - Replaced by Turso-first
- `findLrclibMatch()` - No longer needed
- Spotify search imports (if only used for search, not lyrics)

### 6.4 Add Metrics Logging

```typescript
// src/lib/metrics.ts

export function logSearchMetrics(
  query: string,
  results: number,
  source: 'turso' | 'lrclib-api',
  latencyMs: number,
) {
  console.log(JSON.stringify({
    event: 'search',
    query: query.slice(0, 50),  // Truncate for privacy
    results,
    source,
    latencyMs,
    timestamp: new Date().toISOString(),
  }))
}

export function logBpmMetrics(
  lrclibId: number,
  source: 'embedded' | 'reccobeats' | 'getsongbpm' | 'deezer' | 'rapidapi' | 'none',
  latencyMs: number,
) {
  console.log(JSON.stringify({
    event: 'bpm_lookup',
    lrclibId,
    source,
    latencyMs,
    timestamp: new Date().toISOString(),
  }))
}

export function logAlbumArtMetrics(
  source: 'stored' | 'isrc' | 'search' | 'none',
  latencyMs: number,
) {
  console.log(JSON.stringify({
    event: 'album_art',
    source,
    latencyMs,
    timestamp: new Date().toISOString(),
  }))
}
```

### 6.5 Update CLAUDE.md

Add note about Spotify enrichment:

```markdown
## Database

### Turso (LRCLIB Search Index)
- ~4.2M songs, FTS5 search
- **Spotify enrichment**: popularity, tempo, album art URLs
- **Always use MATCH queries**, never LIKE
- Results ranked by popularity, quality, relevance
```

### 6.6 Archive Old Plan

Move `docs/spotify-enrichment-plan.md` to `docs/archive/` after implementation or add "Implemented" status.

## Acceptance Criteria

1. `docs/technical-reference.md` reflects new architecture
2. `docs/search-optimization-plan.md` updated with current state
3. Deprecated code removed (no orphan imports)
4. Metrics logging added for search, BPM, album art
5. `bun run check` passes (lint + typecheck + test)
6. No console errors in development

## Files to Update

- `docs/technical-reference.md`
- `docs/search-optimization-plan.md`
- `CLAUDE.md`

## Files to Remove (if unused)

- `src/app/api/search/verify/route.ts`
- Any Spotify search-specific code

## Files to Create

- `src/lib/metrics.ts`
- `docs/archive/` directory (if needed)

## Testing

```bash
# Full validation
bun run check

# Verify no orphan imports
bun run typecheck

# Check for console errors
bun run dev
# Navigate through app, check browser console
```
