# LRCLIB-Spotify Enrichment v2 Analysis

## Extraction Summary

| Metric | Value |
|--------|-------|
| Total Tracks | 4,040,377 |
| Spotify Matches | 2,026,198 (50.1%) |
| Match Failures | 1,450,096 |
| Output Size | 1.19 GB |
| Runtime | 92 minutes |

## Enrichment Verification

| Enrichment Type | Count | % of Matched |
|-----------------|-------|--------------|
| With Spotify ID | 2,026,198 | 100% |
| With Tempo (BPM) | 2,019,420 | 99.7% |
| With Album Art | 2,023,881 | 99.9% |
| With Popularity | 2,026,198 | 100% |

## Test Case Verification

### Type O Negative - "Love You To Death"
```
ID: 548003
Title: Love You To Death
Duration: 429s
Spotify ID: 58RDwkonFMOkoytBtIQetc
Popularity: 64
Tempo: 111.4 BPM
```
**Status: PASSED**

## Match Failure Analysis

### Failure Reason Breakdown

| Reason | Count | Percentage |
|--------|-------|------------|
| no_candidates | 1,444,078 | 99.6% |
| all_rejected | 6,018 | 0.4% |

**Key Finding**: 99.6% of failures are due to no Spotify candidates found - the normalization doesn't produce matching keys between LRCLIB and Spotify.

### Pattern Analysis for No Candidates

| Pattern | Count | Description |
|---------|-------|-------------|
| other | 1,352,356 | Title/artist simply not in Spotify |
| bracket_suffix | 34,923 | `[Mono]`, `[RM1]`, `[take 2]` not stripped |
| track_number_prefix | 28,463 | `16 Eleanor Rigby` - prefix not stripped |
| various_artist | 14,726 | `Various`, `VA` - no real artist |
| encoding_issue | 11,714 | `Can?t` instead of `Can't` |
| file_extension | 1,896 | `.flac`, `.mp3` in title |

### Top Artists With No Matches

| Artist | Failed Count | Likely Cause |
|--------|--------------|--------------|
| various | 6,265 | Compilation tracks |
| various artists | 5,554 | Compilation tracks |
| the beatles | 2,594 | Title variations (see below) |
| va | 2,380 | Compilation tracks |
| elvis presley | 2,153 | Title variations |
| pink floyd | 1,348 | Title variations |

### Beatles Failure Examples

```
Original Title             | Normalized (Problem)
16 Eleanor Rigby           | 16 eleanor rigby (track# not stripped)
I call your name (1964)    | i call your name (1964) (year not stripped)
We Can Work It Out [RM1]   | we can work it out [rm1] (bracket not stripped)
She s Leaving Home         | she s leaving home (apostrophe issue)
Can?t Buy Me Love          | can?t buy me love (encoding issue)
Ask Me Why.flac            | ask me why.flac (extension not stripped)
```

## Recommendations for Improvement

### 1. Enhanced Normalization (High Impact)

**Track Number Prefix**: Current regex misses formats like `16 Song Name` (no separator).
```rust
// Add pattern for number-space-title without separator
static TRACK_NUM_SPACE: Lazy<Regex> = Lazy::new(||
    Regex::new(r"(?i)^\d{1,2}\s+(?=[A-Za-z])").unwrap()
);
```

**Bracket Suffixes**: Strip all `[...]` content at end of title.
```rust
static BRACKET_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"\s*\[[^\]]+\]\s*$").unwrap()
);
```

**File Extensions**: Strip `.flac`, `.mp3`, `.wav` extensions.
```rust
static FILE_EXTENSION: Lazy<Regex> = Lazy::new(||
    Regex::new(r"(?i)\.(flac|mp3|wav|m4a|ogg)$").unwrap()
);
```

**Year in Parentheses**: Strip `(1964)`, `(2009)` etc.
```rust
static YEAR_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"\s*\(\d{4}\)\s*$").unwrap()
);
```

### 2. Encoding Cleanup (Medium Impact)

Fix `?` encoding issues before normalization:
```rust
fn fix_encoding(s: &str) -> String {
    s.replace("?", "'")  // Common encoding issue
     .replace("¿", "")   // Inverted question mark
}
```

### 3. Various Artists Handling (Low Impact)

Skip `Various`, `VA`, `V.A.` during matching - they're compilation tracks that won't match specific Spotify artists anyway.

### 4. Apostrophe Normalization

Normalize all apostrophe variants before comparison:
```rust
fn normalize_apostrophes(s: &str) -> String {
    s.replace(" s ", "'s ")  // "She s" → "She's"
     .replace("' ", "'")     // Stray apostrophe spaces
}
```

## Expected Impact

| Improvement | Est. Additional Matches |
|-------------|------------------------|
| Bracket suffix stripping | ~30,000 |
| Better track number prefix | ~25,000 |
| File extension stripping | ~1,500 |
| Encoding fix | ~10,000 |
| **Total** | **~66,500 (1.6%)** |

With these fixes, expected match rate: **~52%**

## Conclusion

The current 50.1% match rate is an improvement from the 46% baseline. The dominant failure mode (99.6%) is "no candidates" - meaning the normalized title/artist key doesn't exist in Spotify. This is partially due to:

1. **Normalization gaps** (fixable): ~66K tracks with bracket suffixes, track numbers, encoding issues
2. **Genuinely missing content** (not fixable): Spotify doesn't have every track in LRCLIB
3. **Compilation tracks** (~15K): "Various Artists" tracks that can't match

The 65-72% target may be optimistic given Spotify's catalog coverage. A realistic improved target after implementing the recommendations above would be **52-55%**.
