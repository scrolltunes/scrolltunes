# Spec 005: BPM Provider Refactor

## Overview

Use embedded tempo from Turso as primary BPM source, falling back to the provider cascade only when tempo is NULL.

## Context

- **Current providers**: ReccoBeats → GetSongBPM → Deezer → RapidAPI Spotify
- **Current file**: `src/services/bpm-providers.ts`
- **New approach**: Embedded tempo (instant) → Provider cascade (fallback)

## Requirements

### 5.1 BPM Resolution Priority

```
Track loads
     │
     ├── tempo != NULL → Use directly (Spotify attribution)
     │
     └── tempo == NULL → Fall back to provider cascade
                         └── Attribution required for external providers
```

### 5.2 Update Lyrics API Route

```typescript
// src/app/api/lyrics/[id]/route.ts

interface LyricsResponse {
  // ... existing fields ...
  bpm: number | null
  musicalKey: string | null  // e.g., "A minor", "C major"
  timeSignature: number | null  // e.g., 4 for 4/4
  bpmAttribution: BpmAttribution | null
}

// In the handler:
async function getLyricsWithBpm(lrclibId: number) {
  const tursoTrack = await getTursoTrack(lrclibId)

  // Use embedded tempo if available
  if (tursoTrack?.tempo) {
    return {
      bpm: Math.round(tursoTrack.tempo),
      musicalKey: formatMusicalKey(tursoTrack.musicalKey, tursoTrack.mode),
      timeSignature: tursoTrack.timeSignature,
      bpmAttribution: {
        provider: "Spotify",
        url: "https://spotify.com",
        requiresBacklink: false,
      },
    }
  }

  // Fall back to provider cascade
  const bpmResult = await getBpmWithFallback(...)
  return {
    bpm: bpmResult?.bpm ?? null,
    musicalKey: null,  // Not available from providers
    timeSignature: null,
    bpmAttribution: bpmResult?.attribution ?? null,
  }
}
```

### 5.3 Musical Key Formatting

```typescript
// src/lib/musical-key.ts

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export function formatMusicalKey(key: number | null, mode: number | null): string | null {
  if (key === null || key === -1) return null

  const pitch = PITCH_CLASSES[key]
  if (!pitch) return null

  const modeName = mode === 1 ? 'major' : mode === 0 ? 'minor' : ''

  return modeName ? `${pitch} ${modeName}` : pitch
}

// Examples:
// formatMusicalKey(9, 0) → "A minor"
// formatMusicalKey(0, 1) → "C major"
// formatMusicalKey(-1, null) → null
// formatMusicalKey(7, null) → "G"
```

### 5.4 Update BPM Types

```typescript
// src/lib/bpm/bpm-types.ts

export interface BpmResult {
  readonly bpm: number
  readonly attribution: BpmAttribution  // Always present (Spotify for embedded, provider for fallback)
  readonly musicalKey?: string | null
  readonly timeSignature?: number | null
  readonly source: 'embedded' | 'provider'
}

export interface BpmAttribution {
  readonly provider: string
  readonly url?: string
  readonly requiresBacklink: boolean
}
```

### 5.5 Attribution Handling

| Source | Attribution | Backlink Required |
|--------|-------------|-------------------|
| Embedded (Spotify dump) | "via Spotify" | No |
| ReccoBeats | "via ReccoBeats" | Yes |
| GetSongBPM | "via GetSongBPM" | Yes |
| Deezer | "via Deezer" | Yes |
| RapidAPI | "via Spotify (RapidAPI)" | No |

### 5.6 UI Updates

```tsx
// Song metadata display component

interface SongMetadataProps {
  bpm: number | null
  musicalKey: string | null
  timeSignature: number | null
  bpmAttribution: BpmAttribution | null
}

function SongMetadata({ bpm, musicalKey, timeSignature, bpmAttribution }: SongMetadataProps) {
  return (
    <div className="song-metadata">
      {bpm && (
        <span className="bpm">
          {bpm} BPM
          {bpmAttribution?.requiresBacklink && (
            <a href={bpmAttribution.url} target="_blank" rel="noopener">
              via {bpmAttribution.provider}
            </a>
          )}
        </span>
      )}
      {musicalKey && <span className="key">Key: {musicalKey}</span>}
      {timeSignature && <span className="time-sig">{timeSignature}/4</span>}
    </div>
  )
}
```

### 5.7 Effect-Based BPM Resolution

```typescript
// src/lib/bpm/bpm-resolver.ts

import { Effect } from "effect"
import type { TursoSearchResult } from "@/services/turso"
import { formatMusicalKey } from "@/lib/musical-key"
import { BpmProviders } from "@/services/bpm-providers"

export interface ResolvedBpm {
  readonly bpm: number
  readonly musicalKey: string | null
  readonly timeSignature: number | null
  readonly attribution: BpmAttribution
}

const SPOTIFY_ATTRIBUTION: BpmAttribution = {
  provider: "Spotify",
  url: "https://spotify.com",
  requiresBacklink: false,
}

export const resolveBpm = (
  track: TursoSearchResult,
  query: BPMTrackQuery,
): Effect.Effect<ResolvedBpm | null, never, BpmProviders> =>
  Effect.gen(function* () {
    // Priority 1: Embedded tempo (from Spotify dump)
    if (track.tempo !== null) {
      return {
        bpm: Math.round(track.tempo),
        musicalKey: formatMusicalKey(track.musicalKey, track.mode),
        timeSignature: track.timeSignature,
        attribution: SPOTIFY_ATTRIBUTION,
      }
    }

    // Priority 2: Provider cascade
    const providers = yield* BpmProviders

    // Try race providers first
    for (const provider of providers.raceProviders) {
      const result = yield* provider.getBpm(query).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
      )
      if (result) {
        return {
          bpm: result.bpm,
          musicalKey: null,
          timeSignature: null,
          attribution: result.attribution,
        }
      }
    }

    // Last resort
    const lastResort = yield* providers.lastResortProvider.getBpm(query).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    )
    if (lastResort) {
      return {
        bpm: lastResort.bpm,
        musicalKey: null,
        timeSignature: null,
        attribution: lastResort.attribution,
      }
    }

    return null
  })
```

## Acceptance Criteria

1. Tracks with embedded tempo display BPM immediately (no API calls)
2. Tracks without embedded tempo fall back to provider cascade
3. Musical key displays correctly (e.g., "A minor", "E major")
4. Time signature displays (e.g., "4/4")
5. Spotify attribution shown for embedded BPM data
6. Provider attribution shown for fallback results (with backlink where required)
7. No breaking changes to existing BPM display
8. `bun run typecheck` passes

## Files to Create

- `src/lib/musical-key.ts` - Musical key formatting
- `src/lib/bpm/bpm-resolver.ts` - Unified BPM resolution

## Files to Modify

- `src/app/api/lyrics/[id]/route.ts` - Use embedded tempo
- `src/lib/bpm/bpm-types.ts` - Add source field
- UI components displaying BPM/key/time signature

## Testing

```bash
# TypeScript check
bun run typecheck

# Test embedded tempo
curl "http://localhost:3000/api/lyrics/12345" | jq '{bpm, musicalKey, timeSignature, bpmAttribution}'
# For track with tempo: bpmAttribution.provider should be "Spotify"

# Test provider fallback
# For track without tempo: bpmAttribution.provider should be the fallback provider name
```
