# Implementation Plan: Enhance Technical Reference

## Overview

Enhance `docs/technical-reference.md` by validating file references, updating code examples, and adding missing documentation sections.

## Gap Analysis Summary

### File Reference Issues (Spec 001) ✓ Verified
- **1 broken path**: `src/lib/bpm/deezer-bpm-client.ts` → actual file is `src/lib/bpm/deezer-client.ts`
- All other 28 file references are valid

### Code Example Issues (Spec 002) ✓ Verified
- **Silero VAD interface**: Missing `onnxWASMBasePath` and `baseAssetPath` fields (actual interface has 6 fields, doc shows 4)
- **LRC interface**: Document shows `LrcLine` with `words: string[]` but parser returns `Lyrics` with `lines: LyricLine[]` (from `@/core`)
- **Cache version**: Document says `CACHE_VERSION = 9` but actual is `LYRICS_CACHE_VERSION = 1` (exported from `lyrics-cache.ts:11`)
- **CachedLyrics**: Missing `albumArtLarge`, `lyricsSource` fields; has wrong optional field syntax (should use `?: T | undefined`)

### Missing Sections (Spec 003) ✓ Verified
- **Edit Mode System**: `SongEditsStore` + `src/lib/song-edits/types.ts` - LinePatch with skip/modify/section actions, LRC hash validation, 30-day localStorage TTL
- **Share Card System**: `src/components/share/` - ShareExperienceStore, 4 background types, 8 effects, 13 templates, quick presets
- **Chord Enhancement**: `src/lib/gp/chord-types.ts`, `extract-chords.ts`, `align-chords.ts` - pitch-class histogram extraction, time transform alignment
- **ScoreBook Display**: `ScoreBookStore` - PageLineRange, 4-10 lines per page clamping, tagged events

---

## Tasks

### P0: Fix Broken File References

| # | Task | Location | Details |
|---|------|----------|---------|
| 1 | Fix BPM provider file path | `docs/technical-reference.md:466` | Change `deezer-bpm-client.ts` → `deezer-client.ts` |

---

### P1: Update Code Examples

| # | Task | Location | Details |
|---|------|----------|---------|
| 2 | Update Silero VAD interface | `docs/technical-reference.md:159-166` | Add `onnxWASMBasePath`, `baseAssetPath` to interface; update preset values from source |
| 3 | Fix LRC interface | `docs/technical-reference.md:32-38` | Document uses `LrcLine`, but actual code uses `LyricLine` from `@/core`. Clarify that `lyrics-parser.ts` returns `LyricLine[]` |
| 4 | Fix cache version constant | `docs/technical-reference.md:406` | Change `CACHE_VERSION = 9` → `LYRICS_CACHE_VERSION = 1` |
| 5 | Update CachedLyrics interface | `docs/technical-reference.md:386-400` | Add `albumArtLarge`, `lyricsSource`; remove incorrect `version` comment; fix optional field syntax |

---

### P2: Add Missing Documentation Sections

| # | Task | Key Files | Details |
|---|------|-----------|---------|
| 6 | Add Edit Mode System section | `src/core/SongEditsStore.ts`, `src/lib/song-edits/types.ts` | Document `LinePatch`, `SongEditPatchPayload`, skip/modify/section actions, LRC hash validation |
| 7 | Add Share Card System section | `src/components/share/ShareExperienceStore.ts`, `designer/types.ts` | Document compact/expanded modes, quick presets, templates, effects, export flow |
| 8 | Add Chord Enhancement section | `src/lib/gp/chord-types.ts`, `extract-chords.ts`, `align-chords.ts` | Document `ChordEvent`, `LineChord`, `ChordEnhancementPayloadV1`, extraction algorithm |
| 9 | Add ScoreBook Display section | `src/core/ScoreBookStore.ts` | Document `PageLineRange`, pagination state, page navigation, tagged events |
| 10 | Update Table of Contents | `docs/technical-reference.md:5-14` | Add entries for new sections 9-12 |

---

## Implementation Details

### Task 1: Fix BPM Provider File Path

**File:** `docs/technical-reference.md`

**Change at line 466:**
```diff
- | `src/lib/bpm/deezer-bpm-client.ts` | Deezer provider |
+ | `src/lib/bpm/deezer-client.ts` | Deezer provider |
```

---

### Task 2: Update Silero VAD Interface

**Source:** `src/lib/silero-vad-config.ts:8-44`

The documented interface is missing required fields. Update to:

```typescript
interface SileroVADConfig {
  readonly onnxWASMBasePath: string    // CDN path for ONNX WASM
  readonly baseAssetPath: string       // CDN path for VAD model
  readonly positiveSpeechThreshold: number
  readonly negativeSpeechThreshold: number
  readonly minSpeechMs: number
  readonly redemptionMs: number
}

// SILERO_PRESET_GUITAR (default)
{
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/",
  baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
  positiveSpeechThreshold: 0.75,
  negativeSpeechThreshold: 0.45,
  minSpeechMs: 200,
  redemptionMs: 350,
}
```

---

### Task 3: Fix LRC Interface

**Issue:** Document shows `LrcLine` with `words: string[]` but parser returns `Lyrics` with `lines: LyricLine[]`.

**Source:**
- `src/lib/lyrics-parser.ts` - returns `Lyrics` type
- `src/core/LyricsPlayer.ts:12-18` - defines `LyricLine`

Replace the documented interface with the actual types:

```typescript
// From src/core/LyricsPlayer.ts
interface LyricLine {
  readonly id: string
  readonly text: string
  readonly startTime: number  // in seconds
  readonly endTime: number    // in seconds
  readonly words?: readonly LyricWord[]
}

// Parser returns Lyrics (from @/core)
interface Lyrics {
  readonly songId: string
  readonly title: string
  readonly artist: string
  readonly album?: string
  readonly lines: readonly LyricLine[]
  readonly duration: number  // total duration in seconds
}
```

Note: The `words` field on `LyricLine` is populated by enhancement (GP extraction), not the LRC parser.

---

### Task 4: Fix Cache Version

**Source:** `src/lib/lyrics-cache.ts:11`

```diff
- const CACHE_VERSION = 9
+ export const LYRICS_CACHE_VERSION = 1
```

---

### Task 5: Update CachedLyrics Interface

**Source:** `src/lib/recent-songs-types.ts`

Replace the documented interface with the complete actual interface:

```typescript
interface CachedLyrics {
  readonly version?: number | undefined
  readonly lyrics: Lyrics
  readonly bpm: number | null
  readonly key: string | null
  readonly albumArt?: string | undefined
  readonly albumArtLarge?: string | undefined           // MISSING from docs
  readonly spotifyId?: string | undefined
  readonly bpmSource?: AttributionSource | undefined
  readonly lyricsSource?: AttributionSource | undefined // MISSING from docs
  readonly hasEnhancement?: boolean | undefined
  readonly enhancement?: EnhancementPayload | null | undefined
  readonly hasChordEnhancement?: boolean | undefined
  readonly chordEnhancement?: ChordEnhancementPayloadV1 | null | undefined
  readonly cachedAt: number  // timestamp (ms since epoch)
}
```

**Changes needed in docs:**
1. Add `albumArtLarge?: string | undefined`
2. Add `lyricsSource?: AttributionSource | undefined`
3. Fix optional field syntax from `field?: Type` to `field?: Type | undefined` (exactOptionalPropertyTypes)
4. Remove incorrect `// Cache version (bump to invalidate)` comment on version field

---

### Task 6: Add Edit Mode System Section

**New section: "9. Edit Mode System"**

Key concepts to document:

**Core Types:**
```typescript
// Line-level patch (sparse storage - only modified lines)
interface LinePatch {
  idx: number              // 0-based line index
  action: "skip" | "modify" | "section"
  skipped?: boolean        // for skip action
  customText?: string      // user-generated replacement (not copyrighted)
  sectionType?: SectionType
  sectionLabel?: string
}

type SectionType = "verse" | "chorus" | "bridge" | "pre-chorus" |
                   "outro" | "intro" | "instrumental" | "custom"

interface SongEditPatchPayload {
  version: 1
  lrcHash: string          // validates patches match current LRC
  createdAt: string        // ISO timestamp
  updatedAt: string
  linePatches: LinePatch[] // sparse - only modified lines
  bpmOverride?: number | null
  tempoMultiplier?: number | null
}
```

**Key patterns:**
- Index-based references (not content) for resilience to LRCLIB updates
- LRC hash validation detects misalignment when lyrics change
- 30-day localStorage cache with server sync
- User-generated content only (never stores copyrighted LRCLIB text)

**Key files:**
- `src/core/SongEditsStore.ts` - state management, React hooks
- `src/lib/song-edits/types.ts` - interfaces and helpers
- `src/lib/song-edits/apply-edits.ts` - patch application logic

---

### Task 7: Add Share Card System Section

**New section: "10. Share Card System"**

Key concepts to document:

**Background Types (4):**
```typescript
type BackgroundType = "solid" | "gradient" | "albumArt" | "pattern"
type PatternVariant = "none" | "dots" | "grid" | "waves"
```

**Effects (8):**
```typescript
type EffectType = "none" | "vignette" | "blur" | "darken" |
                  "desaturate" | "tint" | "gradient" | "duotone"
```

**Quick Presets:** `clean`, `vibrant`, `dark`, `vintage` - album-aware color derivation

**Template Categories:** `minimal`, `bold`, `vintage`, `artistic` (13 built-in templates)

**Architecture:**
- ShareExperienceStore with Effect.ts tagged events (25+ event types)
- History coalescing (500ms threshold for drag operations)
- Export: Canvas → PNG/JPEG/WebP, clipboard, Web Share API

**Key files:**
- `src/components/share/ShareExperience.tsx` - main component
- `src/components/share/ShareExperienceStore.ts` - state management
- `src/components/share/designer/types.ts` - all type definitions
- `src/components/share/effects/index.ts` - effect implementations
- `src/components/share/designer/templates/` - template definitions

---

### Task 8: Add Chord Enhancement Section

**New section: "11. Chord Enhancement System"**

Key concepts to document:

**Core Types:**
```typescript
// Chord with absolute timing from GP file
interface ChordEvent {
  readonly startMs: number
  readonly durationMs: number
  readonly chord: string
  readonly confidence: number  // 0-1
}

// Chord positioned within LRC line (relative timing)
interface LineChord {
  readonly start: number       // offset from line start (ms)
  readonly dur?: number
  readonly chord: string
  readonly wordIdx?: number    // word-level alignment
}

interface ChordEnhancementPayloadV1 {
  readonly patchFormatVersion: "chords-json-v1"
  readonly algoVersion: string
  readonly timeTransform?: TimeTransformV1
  readonly track?: PayloadTrackInfo
  readonly lines: readonly EnhancedChordLine[]
}
```

**Extraction Pipeline:**
1. **Track Selection**: Guitar preference (+2), vocal penalty (-2), monophonic penalty (-2)
2. **Chord Extraction**: Explicit `beat.chord` markers OR pitch-class histogram analysis
3. **Alignment**: Time transform (offset or piecewise-linear), ±300ms inclusion window, max 4 chords/line

**Chord Templates:** Major, Minor, Dim, Dom7, Min7

**Key files:**
- `src/lib/gp/chord-types.ts` - type definitions
- `src/lib/gp/extract-chords.ts` - extraction algorithm
- `src/lib/gp/align-chords.ts` - LRC alignment logic

---

### Task 9: Add ScoreBook Display Section

**New section: "12. ScoreBook Display System"**

Key concepts to document:

**Core Types:**
```typescript
interface PageLineRange {
  readonly start: number  // 0-indexed, inclusive
  readonly end: number    // 0-indexed, inclusive
}

interface ScoreBookState {
  readonly currentPage: number
  readonly totalPages: number
  readonly linesPerPage: number       // clamped 4-10
  readonly pageLineRanges: readonly PageLineRange[]
  readonly direction: 1 | -1          // navigation direction for transitions
}
```

**Tagged Events:**
- `GoToPage { page: number }` - navigate to specific page
- `NextPage` / `PrevPage` - navigate forward/backward
- `SetPagination { totalLines, linesPerPage }` - reconfigure on lyrics/viewport change

**Pagination Algorithm:**
1. Clamp `linesPerPage` to 4-10 range
2. Calculate `totalPages = Math.ceil(totalLines / linesPerPage)` (min 1)
3. Build page ranges: `start = i * linesPerPage`, `end = min(start + linesPerPage - 1, totalLines - 1)`
4. Preserve current page position (clamp to new valid range)

**Helper Methods:**
- `findPageForLine(lineIndex)` - O(1) page lookup
- `isOnLastLineOfPage()` - boundary detection for transitions
- `isOnSecondToLastLineOfPage()` - near-boundary warning

**Key file:**
- `src/core/ScoreBookStore.ts`

---

### Task 10: Update Table of Contents

Add after line 14:
```markdown
9. [Edit Mode System](#9-edit-mode-system)
10. [Share Card System](#10-share-card-system)
11. [Chord Enhancement System](#11-chord-enhancement-system)
12. [ScoreBook Display System](#12-scorebook-display-system)
```

---

## Validation

```bash
bun run check
```

## Success Criteria

- [x] All file references point to existing files (1 fix needed: Task 1)
- [x] Code examples match actual implementations (Tasks 2-5)
- [x] All major technical systems are documented (Tasks 6-10)
- [x] Document follows consistent formatting
- [x] `bun run check` passes

## Specs

| Spec | Description | Status |
|------|-------------|--------|
| [001-validate-file-references](specs/001-validate-file-references.md) | Verify all file paths exist | ✓ verified |
| [002-enhance-code-examples](specs/002-enhance-code-examples.md) | Update code examples from source | ✓ verified |
| [003-add-missing-sections](specs/003-add-missing-sections.md) | Document undocumented systems | ✓ verified |
