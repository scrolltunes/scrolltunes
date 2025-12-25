# ScrollTunes – GP-based Chord Extraction (LLM Implementation Spec)

This document provides **precise, step-by-step instructions** for an LLM to implement Guitar Pro–based chord extraction and patching in ScrollTunes. Follow this specification literally unless explicitly extending it.

---

## 0. Scope and assumptions

You are implementing **chord extraction only**.

Assume the following already exist:
- Admin UI for enhanced lyrics with:
  - `.gp/.gpx/.gp5/.musicxml` upload
  - alphaTab parsing
  - tempo map + tick→ms conversion
  - LRC preview with line indices and timestamps
- Runtime system that:
  - renders lyrics from LRCLIB/LRC
  - already fetches baseline chords from a 3rd‑party API
  - supports patch-based enhancements keyed by `lrc_hash`

You are **piggybacking on the enhanced-lyrics system**.

---

## 1. High-level architecture

### Data flow
```
GP file
  → parse via alphaTab
  → extract chord events in GP time
  → optional timeTransform (GP → LRC)
  → assign chords to LRC lines
  → store as chord patch payload
  → apply at runtime
```

### Design rules (non-negotiable)
- Chord patches are **relative to lyric line start**, never absolute.
- Patches are **immutable** and keyed by `lrc_hash`.
- Patched lines **override** baseline chords.
- Time transforms are applied **before** patch generation.

---

## 2. Track selection (strumming-first)

### Goal
Select the rhythm guitar track most suitable for strumming chords.

### Algorithm
For each GP track, compute a score:
- +2 if ≥3 notes frequently start at the same tick
- +1 if note onsets align to a regular beat grid
- −2 if most events are monophonic runs

Select the highest-scoring track.
Allow manual override in UI.

---

## 3. Chord extraction algorithm

### 3.1 Define chord windows

Default:
- 1 window per **measure**.

Optional split:
- Compare full-measure vs two half-measures.
- Split if:
```
score(h1) + score(h2) > score(full) * 1.15
```

---

### 3.2 Collect notes per window

For all notes overlapping the window:
- Convert pitch → pitch class: `pc = midi % 12`
- Accumulate histogram weights:
  - duration weight: `sqrt(duration_in_beats)`
  - onset weight: strong beats > weak beats

Track:
- `hist[12]`: pitch-class histogram
- `bass_pc`: lowest stable pitch class

---

### 3.3 Chord candidates

Supported chord types (v1):
- Major: `{0,4,7}`
- Minor: `{0,3,7}`
- Diminished: `{0,3,6}`
- Dominant 7: `{0,4,7,10}` (optional)
- Minor 7: `{0,3,7,10}` (optional)

---

### 3.4 Scoring function

```
in  = sum(hist[pc] for pc in chordTones)
out = sum(hist[pc] for pc not in chordTones)
score = in - 0.4 * out
```

Add bonuses:
- `+0.8` if `bass_pc == root`
- `+0.4` if `bass_pc ∈ chordTones`

Penalty:
- `−0.5` for 7th chords

---

### 3.5 Simplification rules
- maj7 → major
- min7 → minor
- dom7 → keep only if clearly dominant
- ignore slash chords

---

### 3.6 Temporal smoothing
Only change chord if:
```
newScore > prevScore * 1.15
```

---

## 4. Time alignment (GP → LRC)

```ts
type TimeTransformV1 =
  | { kind: "offset"; ms: number }
  | { kind: "piecewise_linear"; anchors: Array<{ gpMs: number; lrcMs: number }> };
```

Apply once before line assignment.

---

## 5. Assign chords to lyric lines

- Assign by inclusion with ±300ms tolerance
- Convert to relative offset
- Deduplicate
- Cap at 4 events per line

---

## 6. Patch payload schema

```ts
interface ChordEnhancementPayloadV1 {
  patchFormatVersion: "chords-json-v1";
  algoVersion: string;
  timeTransform?: TimeTransformV1;
  lines: Array<{
    idx: number;
    chords: Array<{ start: number; dur?: number; chord: string }>;
  }>;
}
```

---

## 7. Storage schema

```sql
CREATE TABLE chord_enhancements (
  id UUID PRIMARY KEY,
  song_id UUID NOT NULL,
  lrclib_id INTEGER NOT NULL,
  lrc_hash TEXT NOT NULL,
  algo_version TEXT NOT NULL,
  patch_format_version TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(song_id, lrc_hash, algo_version, patch_format_version)
);
```

---

## 8. Runtime application

Patched lines override baseline chords.
Relative times converted to absolute via `line.startMs + start`.

---

## 9. Non-goals (v1)

- Audio-based extraction
- Jazz/slash chords
- Fingerstyle inference
- Runtime warping

---