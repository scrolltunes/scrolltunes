# GP Chord Extraction - Implementation Design (v2)

This document provides the detailed implementation design for GP-based chord extraction, addressing all gaps identified in review.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Admin UI                                        │
│  /admin/enhance/[slug] (extend with Chords tab)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  GP Upload → Track Selection → Chord Preview → Time Offset Adjust → Save    │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Client-Side Extraction (browser-only)                     │
│  src/lib/gp/                                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  extract-chords.ts          │  align-chords.ts                              │
│  ├─ analyzeTracksForChords  │  ├─ alignChordsToLrc                          │
│  ├─ extractChordEvents      │  ├─ generateChordPayload                      │
│  └─ formatChordName         │  └─ applyTimeTransform                        │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ POST /api/admin/chords/enhance
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Database                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  chord_enhancements                                                          │
│  ├─ song_id, lrclib_id, lrc_hash                                            │
│  ├─ algo_version, patch_format_version                                      │
│  ├─ payload (ChordEnhancementPayloadV1)                                     │
│  ├─ coverage, source, created_by                                            │
│  └─ UNIQUE(song_id, lrc_hash, algo_version, patch_format_version)           │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ GET /api/lyrics/[id]
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Runtime (Song Page)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Fetch lyrics + chordEnhancement from /api/lyrics/[id]                   │
│  2. Fetch baseline chords from ChordsStore (Songsterr)                      │
│  3. Merge: GP patches override baseline for matched lines                   │
│  4. Render with time-based chord positioning                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Type Definitions

### 2.1 New Types in `src/lib/gp/chord-types.ts`

```typescript
/**
 * GP Chord extraction types.
 * 
 * NOTE: This module is client-only (imports alphaTab indirectly).
 */

import type { TempoEvent } from "./types"

// ============================================================================
// Time Transform
// ============================================================================

/** Offset-based transform: shift all GP times by a fixed amount */
export interface TimeTransformOffset {
  readonly kind: "offset"
  readonly ms: number
}

/** Piecewise linear transform: interpolate between anchor points */
export interface TimeTransformPiecewise {
  readonly kind: "piecewise_linear"
  readonly anchors: ReadonlyArray<{ readonly gpMs: number; readonly lrcMs: number }>
}

export type TimeTransformV1 = TimeTransformOffset | TimeTransformPiecewise

// ============================================================================
// Track Analysis
// ============================================================================

/** Track suitability analysis for chord extraction */
export interface TrackAnalysis {
  readonly trackIndex: number
  readonly trackName: string
  readonly score: number           // Strumming suitability (-10 to +10)
  readonly chordEventCount: number // Estimated chord events
  readonly isPercussion: boolean
}

// ============================================================================
// Chord Events (intermediate, pre-alignment)
// ============================================================================

/** A chord event extracted from GP, in GP time */
export interface ChordEvent {
  readonly startMs: number       // GP time (before transform)
  readonly durationMs: number    // Duration until next chord or measure end
  readonly chord: string         // Canonical name: "Am", "G", "D7", "Bdim"
  readonly confidence: number    // 0-1, based on scoring function
}

/** Result of chord extraction from a GP file */
export interface ExtractedChords {
  readonly meta: {
    readonly title: string
    readonly artist: string
  }
  readonly tracks: readonly TrackAnalysis[]
  readonly selectedTrackIndex: number
  readonly chords: readonly ChordEvent[]
  readonly tempo: readonly TempoEvent[]
  readonly durationMs: number
}

// ============================================================================
// Chord Enhancement Payload (stored in DB)
// ============================================================================

/** Track metadata for debugging/reproducibility */
export interface PayloadTrackInfo {
  readonly index: number
  readonly name: string
  readonly score: number
}

/** A chord within a line (relative timing) */
export interface LineChord {
  readonly start: number    // Offset from line start in ms
  readonly dur?: number     // Optional duration in ms
  readonly chord: string    // Canonical chord name
}

/** A line with chord enhancements */
export interface EnhancedChordLine {
  readonly idx: number                    // LRC line index
  readonly chords: readonly LineChord[]   // Max 4 per spec
}

/** The payload stored in chord_enhancements.payload */
export interface ChordEnhancementPayloadV1 {
  readonly patchFormatVersion: "chords-json-v1"
  readonly algoVersion: string            // e.g., "1.0.0"
  readonly timeTransform?: TimeTransformV1
  readonly track?: PayloadTrackInfo       // For debugging
  readonly lines: readonly EnhancedChordLine[]
}

// ============================================================================
// Runtime Types (for merged chord display)
// ============================================================================

/** A chord positioned by time (used at runtime) */
export interface TimedChord {
  readonly absoluteMs: number   // Absolute time in song
  readonly durationMs?: number
  readonly chord: string
  readonly source: "gp" | "songsterr"
}

/** A line with merged chords from both sources */
export interface MergedChordLine {
  readonly lineIndex: number
  readonly chords: readonly TimedChord[]
  readonly source: "gp" | "songsterr" | "none"
}
```

### 2.2 Chord Naming Convention

To ensure compatibility with `transposeChord()`:

| Chord Type | Format | Examples |
|------------|--------|----------|
| Major | `{root}` | `C`, `G`, `F#` |
| Minor | `{root}m` | `Am`, `Em`, `C#m` |
| Diminished | `{root}dim` | `Bdim`, `F#dim` |
| Dominant 7 | `{root}7` | `G7`, `A7` |
| Minor 7 | `{root}m7` | `Am7`, `Dm7` |
| No chord | `N.C.` | `N.C.` |

**Rules:**
- Use sharps (`#`) not flats (`b`) for canonical storage
- Simplification per spec §3.5: maj7→major, min7→minor
- Ignore slash chords (use root quality only)

---

## 3. Database Schema

### 3.1 New Table: `chord_enhancements`

```typescript
// In src/lib/db/schema.ts

export const chordEnhancements = pgTable(
  "chord_enhancements",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Link to song catalog
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),

    // Which LRCLIB entry was used
    sourceLrclibId: integer("source_lrclib_id").notNull(),

    // Hash of the base LRC content (for cache invalidation)
    lrcHash: text("lrc_hash").notNull(),

    // Versioning (matches payload fields)
    algoVersion: text("algo_version").notNull(),
    patchFormatVersion: text("patch_format_version").notNull(),

    // Enhancement payload
    payload: jsonb("payload").$type<ChordEnhancementPayloadV1>().notNull(),

    // Metadata (matching lrcWordEnhancements pattern)
    source: enhancementSourceEnum("source").notNull().default("admin"),
    coverage: real("coverage"), // 0-1, fraction of lines with chords
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    // Spec §7: UNIQUE constraint
    uniqueIndex("chord_enhancements_song_hash_algo_fmt_idx").on(
      table.songId,
      table.lrcHash,
      table.algoVersion,
      table.patchFormatVersion,
    ),
    index("chord_enhancements_song_id_idx").on(table.songId),
    index("chord_enhancements_lrclib_id_idx").on(table.sourceLrclibId),
  ],
)

export type ChordEnhancement = typeof chordEnhancements.$inferSelect
export type NewChordEnhancement = typeof chordEnhancements.$inferInsert
```

### 3.2 Update `songs` Table

```typescript
// Add to songs table
hasChordEnhancement: boolean("has_chord_enhancement").notNull().default(false),
```

---

## 4. Extraction Module: `src/lib/gp/extract-chords.ts`

### 4.1 Track Selection Algorithm

```typescript
/**
 * Analyze tracks for chord extraction suitability.
 * 
 * Scoring (per spec §2):
 * - +2 if ≥3 notes frequently start at same tick (chordal)
 * - +1 if note onsets align to regular beat grid
 * - −2 if most events are monophonic runs
 * - −5 if percussion track
 */
export function analyzeTracksForChords(score: Score): TrackAnalysis[] {
  // Implementation details...
}

/**
 * Select the best track for chord extraction.
 * Returns the highest-scoring non-percussion track.
 */
export function selectBestTrack(tracks: TrackAnalysis[]): number {
  // Filter out percussion, sort by score descending
}
```

### 4.2 Chord Detection Algorithm

```typescript
/**
 * Extract chord events from a GP score.
 * 
 * Algorithm (per spec §3):
 * 1. Define windows (per measure, optional half-measure split)
 * 2. Collect pitch-class histogram per window
 * 3. Score chord candidates
 * 4. Apply temporal smoothing
 * 5. Filter by confidence threshold
 */
export function extractChordEvents(
  score: Score,
  trackIndex: number,
  tempoEvents: TempoEvent[],
  options?: {
    minConfidence?: number      // Default: 0.3
    smoothingThreshold?: number // Default: 1.15 (per spec §3.6)
  }
): ChordEvent[] {
  // Implementation...
}

// Chord templates (pitch class sets)
const CHORD_TEMPLATES = {
  major: new Set([0, 4, 7]),
  minor: new Set([0, 3, 7]),
  dim: new Set([0, 3, 6]),
  dom7: new Set([0, 4, 7, 10]),
  min7: new Set([0, 3, 7, 10]),
} as const

// Note names for output
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

/**
 * Format a chord name from root pitch class and quality.
 * Uses sharp notation for consistency with transposeChord().
 */
export function formatExtractedChord(rootPc: number, quality: keyof typeof CHORD_TEMPLATES): string {
  const root = NOTE_NAMES[rootPc]
  switch (quality) {
    case "major": return root
    case "minor": return `${root}m`
    case "dim": return `${root}dim`
    case "dom7": return `${root}7`
    case "min7": return `${root}m7`
  }
}
```

### 4.3 Confidence and No-Chord Handling

```typescript
/**
 * Calculate confidence from chord scoring.
 * 
 * confidence = (in - 0.4 * out) / maxPossibleScore
 * 
 * Returns 0 if below MIN_SCORE threshold (emits no chord).
 */
function calculateConfidence(inScore: number, outScore: number, hist: number[]): number {
  const MIN_SCORE = 2.0 // Below this, emit no chord
  const score = inScore - 0.4 * outScore
  if (score < MIN_SCORE) return 0
  
  const maxPossible = hist.reduce((a, b) => a + b, 0)
  return maxPossible > 0 ? Math.min(1, score / maxPossible) : 0
}
```

---

## 5. Alignment Module: `src/lib/gp/align-chords.ts`

### 5.1 Time Transform Application

```typescript
/**
 * Apply time transform to convert GP time to LRC time.
 */
export function applyTimeTransform(gpMs: number, transform?: TimeTransformV1): number {
  if (!transform) return gpMs
  
  if (transform.kind === "offset") {
    return gpMs + transform.ms
  }
  
  // Piecewise linear interpolation
  const { anchors } = transform
  if (anchors.length === 0) return gpMs
  if (anchors.length === 1) return gpMs + (anchors[0].lrcMs - anchors[0].gpMs)
  
  // Find surrounding anchors and interpolate
  // ...implementation
}
```

### 5.2 Line Assignment

```typescript
/**
 * Assign chords to LRC lines.
 * 
 * Rules (per spec §5):
 * - Assign by inclusion with ±300ms tolerance
 * - Convert to relative offset (from line start)
 * - Deduplicate consecutive identical chords
 * - Cap at 4 events per line
 */
export function alignChordsToLrc(
  chords: readonly ChordEvent[],
  lrcLines: readonly LrcLine[],
  transform?: TimeTransformV1,
): EnhancedChordLine[] {
  const TOLERANCE_MS = 300
  const MAX_CHORDS_PER_LINE = 4
  
  // Transform chord times
  const transformedChords = chords.map(c => ({
    ...c,
    lrcMs: applyTimeTransform(c.startMs, transform),
  }))
  
  const result: EnhancedChordLine[] = []
  
  for (let lineIdx = 0; lineIdx < lrcLines.length; lineIdx++) {
    const line = lrcLines[lineIdx]
    const lineStart = line.startMs - TOLERANCE_MS
    const lineEnd = (lrcLines[lineIdx + 1]?.startMs ?? line.startMs + 10000) + TOLERANCE_MS
    
    // Find chords in this line's time range
    const lineChords = transformedChords
      .filter(c => c.lrcMs >= lineStart && c.lrcMs < lineEnd)
      .map(c => ({
        start: Math.max(0, c.lrcMs - line.startMs),
        dur: c.durationMs,
        chord: c.chord,
      }))
    
    // Deduplicate consecutive identical chords
    const deduped = deduplicateChords(lineChords)
    
    // Cap at max
    const capped = deduped.slice(0, MAX_CHORDS_PER_LINE)
    
    if (capped.length > 0) {
      result.push({ idx: lineIdx, chords: capped })
    }
  }
  
  return result
}
```

### 5.3 Payload Generation

```typescript
/**
 * Generate the chord enhancement payload.
 * 
 * Validates that payload version fields match for consistency.
 */
export function generateChordPayload(
  lines: readonly EnhancedChordLine[],
  track: TrackAnalysis | undefined,
  transform: TimeTransformV1 | undefined,
  algoVersion: string = "1.0.0",
): ChordEnhancementPayloadV1 {
  return {
    patchFormatVersion: "chords-json-v1",
    algoVersion,
    ...(transform && { timeTransform: transform }),
    ...(track && {
      track: {
        index: track.trackIndex,
        name: track.trackName,
        score: track.score,
      },
    }),
    lines,
  }
}

/**
 * Calculate coverage: fraction of lines with chords.
 */
export function calculateCoverage(
  enhancedLines: readonly EnhancedChordLine[],
  totalLrcLines: number,
): number {
  if (totalLrcLines === 0) return 0
  return enhancedLines.length / totalLrcLines
}
```

---

## 6. Runtime Integration

### 6.1 API Response Extension

```typescript
// In /api/lyrics/[id]/route.ts response
interface LyricsApiSuccessResponse {
  lyrics: Lyrics
  bpm: number | null
  key: string | null
  albumArt: string | null
  spotifyId: string | null
  attribution: { ... }
  hasEnhancement: boolean
  enhancement: EnhancementPayload | null
  // NEW:
  hasChordEnhancement: boolean
  chordEnhancement: ChordEnhancementPayloadV1 | null
}
```

### 6.2 Chord Merge Helper

```typescript
// In src/lib/chords/merge-chords.ts

import type { LyricLine } from "@/core"
import type { SongsterrChordData, PositionedChord } from "./songsterr-types"
import type { ChordEnhancementPayloadV1, MergedChordLine, TimedChord } from "@/lib/gp/chord-types"

/**
 * Merge GP chord patches with baseline Songsterr chords.
 * 
 * Rules:
 * - If GP patch exists for a line, use ONLY GP chords (override)
 * - Otherwise, use Songsterr chords (converted to time-based)
 * - Preserve capo/tuning from Songsterr
 */
export function mergeChordSources(
  lrcLines: readonly LyricLine[],
  baseline: SongsterrChordData | null,
  gpPatch: ChordEnhancementPayloadV1 | null,
): {
  lines: readonly MergedChordLine[]
  capo?: number
  tuning?: string
} {
  // Build GP line index set for O(1) lookup
  const gpLineIndices = new Set(gpPatch?.lines.map(l => l.idx) ?? [])
  
  const mergedLines: MergedChordLine[] = lrcLines.map((line, idx) => {
    // Check if GP patch has chords for this line
    const gpLine = gpPatch?.lines.find(l => l.idx === idx)
    
    if (gpLine && gpLine.chords.length > 0) {
      // Use GP chords (override baseline)
      return {
        lineIndex: idx,
        chords: gpLine.chords.map(c => ({
          absoluteMs: line.startTime + c.start,
          durationMs: c.dur,
          chord: c.chord,
          source: "gp" as const,
        })),
        source: "gp" as const,
      }
    }
    
    // Try baseline Songsterr chords
    const baselineChords = findBaselineChordsForLine(baseline, line, idx)
    if (baselineChords.length > 0) {
      return {
        lineIndex: idx,
        chords: baselineChords.map(c => ({
          absoluteMs: line.startTime + estimateChordTimeFromCharIndex(c.charIndex, line),
          chord: c.name,
          source: "songsterr" as const,
        })),
        source: "songsterr" as const,
      }
    }
    
    return { lineIndex: idx, chords: [], source: "none" as const }
  })
  
  return {
    lines: mergedLines,
    capo: baseline?.capo,
    tuning: baseline?.tuning,
  }
}

/**
 * Estimate chord time from char index (for Songsterr baseline).
 * Uses proportional mapping: charIndex / lineLength * lineDuration
 */
function estimateChordTimeFromCharIndex(charIndex: number, line: LyricLine): number {
  const lineLength = line.text.length || 1
  const lineDuration = (line.endTime - line.startTime) || 3000 // default 3s
  return (charIndex / lineLength) * lineDuration
}
```

### 6.3 Song Page Integration

```typescript
// In song page, after loading lyrics and chords:

const [mergedChords, setMergedChords] = useState<MergedChordLine[]>([])

useEffect(() => {
  if (loadState._tag !== "Loaded") return
  
  const { lines, capo, tuning } = mergeChordSources(
    loadState.lyrics.lines,
    chordsState.data,
    loadState.chordEnhancement,
  )
  
  setMergedChords(lines)
  // Preserve capo/tuning for display
}, [loadState, chordsState.data])
```

---

## 7. Admin UI Design

### 7.1 Page Structure

Extend `/admin/enhance/[slug]/page.tsx` with tabs:

```
┌────────────────────────────────────────────────────────────┐
│  Enhance Lyrics                                             │
│  ─────────────────────────────────────────────────────────  │
│  [Word Timing]  [Chords]                                    │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Song Info                                                  │
│  ├─ Title: ...                                              │
│  ├─ Artist: ...                                             │
│  └─ Status: Has chord enhancement ✓ / No enhancement        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Upload Guitar Pro File                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [Drop GP file here or click to browse]              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Track Selection                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ▼ Track 2 - Rhythm Guitar (score: 3.2, 47 chords)  │   │
│  │    Track 1 - Lead Guitar (score: -1.5, 12 chords)   │   │
│  │    Track 3 - Bass (score: -2.0, 8 chords)           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Time Offset Adjustment                                     │
│  ───────────●──────────────────────  +200ms                │
│  (Fine-tune GP↔LRC alignment)                              │
│                                                             │
│  Chord Preview                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [00:15.20] "When I was young..."                    │   │
│  │             Am (+0ms)  G (+1200ms)  C (+2400ms)      │   │
│  │  [00:19.40] "I used to dream..."                     │   │
│  │             F (+0ms)  C (+1500ms)                    │   │
│  │  ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Coverage: 78% (45/58 lines)                               │
│  ⚠️ Low coverage may indicate poor track selection          │
│                                                             │
│  [Save Chord Enhancement]                                   │
└────────────────────────────────────────────────────────────┘
```

### 7.2 Warnings and Edge Cases

- **Coverage < 20%**: Show warning "Very low coverage. Consider selecting a different track or verifying the GP file matches this song."
- **No suitable track**: Show message "No rhythm/chord track detected. Select a track manually."
- **Extraction failed**: Show error with details

---

## 8. API Endpoints

### 8.1 Save Chord Enhancement

```typescript
// POST /api/admin/chords/enhance
interface SaveChordEnhancementRequest {
  songId: string
  lrclibId: number
  baseLrc: string          // For hash computation
  payload: ChordEnhancementPayloadV1
  coverage: number
}

// Validation:
// - Ensure payload.algoVersion matches column value
// - Ensure payload.patchFormatVersion matches column value
// - Compute lrcHash from baseLrc
// - Update songs.hasChordEnhancement = true
```

### 8.2 Delete Chord Enhancement

```typescript
// DELETE /api/admin/chords/enhance
interface DeleteChordEnhancementRequest {
  songId: string
  lrclibId: number
}

// Also update songs.hasChordEnhancement = false
```

### 8.3 Fetch Chord Enhancement (in lyrics API)

```typescript
// In GET /api/lyrics/[id]
// After fetching lyrics, also query chord_enhancements
const [chordEnhancement] = await db
  .select({ payload: chordEnhancements.payload })
  .from(chordEnhancements)
  .where(eq(chordEnhancements.sourceLrclibId, actualLrclibId))
  .limit(1)
```

---

## 9. File Structure

```
src/lib/gp/
├── types.ts              # Existing lyrics types
├── chord-types.ts        # NEW: Chord extraction types
├── extract-lyrics.ts     # Existing
├── extract-chords.ts     # NEW: Track selection + chord detection
├── align-chords.ts       # NEW: Time transform + line assignment
├── build-words.ts        # Existing
├── align-words.ts        # Existing
├── enhance-lrc.ts        # Existing
├── timing.ts             # Existing (shared)
└── index.ts              # Update exports

src/lib/chords/
├── ...existing...
└── merge-chords.ts       # NEW: Runtime merge helper

src/components/admin/
├── GpUploader.tsx        # Existing (reuse)
├── AlignmentPreview.tsx  # Existing
└── ChordPreview.tsx      # NEW: Chord preview component

src/app/admin/enhance/[slug]/
└── page.tsx              # Extend with Chords tab
```

---

## 10. Implementation Order

1. **Types**: Add `chord-types.ts` with all type definitions
2. **Schema**: Add `chord_enhancements` table, run migration
3. **Extraction**: Implement `extract-chords.ts` with tests
4. **Alignment**: Implement `align-chords.ts` with tests
5. **API**: Add chord enhancement endpoints
6. **Admin UI**: Add Chords tab to enhance page
7. **Runtime**: Add merge helper, integrate into song page
8. **Testing**: E2E test with real GP file

---

## 11. Test Strategy

### Unit Tests
- Chord detection accuracy on known songs
- Track scoring algorithm
- Time transform application
- Line assignment with edge cases

### Integration Tests
- Full pipeline: GP → payload → DB → API → merge
- Transposition compatibility

### Manual Testing
- Upload GP files for 5-10 songs with known chord progressions
- Verify visual alignment in song page
- Test with songs that have both GP and Songsterr chords
