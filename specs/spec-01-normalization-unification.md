# Spec 01: Normalization Unification

> Single-source normalization code shared between all extraction tools

## Problem Statement

Normalization code is duplicated between `main.rs` (lrclib-extract) and `normalize-spotify.rs`. Any divergence between these implementations produces `no_candidates` failures by construction in an exact-key pipeline.

**Evidence of drift:** The ARTIST_TRANSLITERATIONS map had 73 Russian entries in `main.rs` but only 19 in `normalize-spotify.rs` until manually synced.

## Requirements

### R1.1: Shared Normalization Module

Create `src/normalize.rs` as a shared module containing:

```rust
// Core normalization functions
pub fn normalize_title(title: &str) -> String;
pub fn normalize_artist(artist: &str) -> String;
pub fn fold_to_ascii(s: &str) -> String;
pub fn normalize_punctuation(s: &str) -> String;

// Shared data
pub static ARTIST_TRANSLITERATIONS: phf::Map<&'static str, &'static str>;
pub static TITLE_PATTERNS: Lazy<Vec<Regex>>;
pub static ARTIST_PATTERNS: Lazy<Vec<Regex>>;
```

### R1.2: Remove Duplicated Code

- Delete normalization functions from `main.rs`
- Delete normalization functions from `normalize-spotify.rs`
- Both binaries import from `normalize.rs`

### R1.3: Golden Tests

Create `src/normalize_tests.rs` with test cases covering:

| Category | Examples |
|----------|----------|
| Diacritics | "Björk" → "bjork", "Motörhead" → "motorhead" |
| Track numbers | "01 - Song" → "song", "03. Title" → "title" |
| Brackets | "Song [Live]" → "song", "Title (Remaster)" → "title" |
| "The" handling | "The Beatles" → "beatles", "Band, The" → "band" |
| Cyrillic | "Кино" → "kino", "ДДТ" → "ddt" |
| Hebrew | "אייל גולן" → "eyal golan" (via dictionary) |
| Multi-artist | "A feat. B" → "a", "X & Y" → "x" |
| Separators | "A/B" → "a", "A,B" → "a", "A&B" → "a" |

### R1.4: Compile-Time Enforcement

- Use `mod normalize;` in both binaries (not copy-paste)
- CI should fail if normalization code exists outside the shared module

## Implementation Notes

### File Structure

```
scripts/lrclib-extract/
├── src/
│   ├── main.rs           # Uses normalize module
│   ├── normalize.rs      # NEW: Shared normalization
│   ├── normalize_tests.rs # NEW: Golden tests
│   └── bin/
│       └── normalize-spotify.rs  # Uses normalize module
```

### Migration Steps

1. Create `normalize.rs` with all normalization code from `main.rs`
2. Update `main.rs` to use `mod normalize; use normalize::*;`
3. Update `normalize-spotify.rs` to use `crate::normalize::*;`
4. Add golden tests
5. Verify both binaries produce identical output

## Acceptance Criteria

- [ ] Single `normalize.rs` file contains all normalization logic
- [ ] Both binaries compile and use shared module
- [ ] Golden tests pass for all categories above
- [ ] Rebuilding normalized index produces identical output
- [ ] No normalization code outside `normalize.rs`

## Dependencies

None - this is the foundation for all other improvements.

## Estimated Impact

- Prevents future drift-related failures
- Foundation for measuring other improvements accurately
