# Current Plan: Spec 01 - Normalization Unification (Task 1.1)

## Spec Reference
[specs/spec-01-normalization.md](specs/spec-01-normalization.md)

## Overview
Extract all normalization code from `main.rs` and `normalize-spotify.rs` into a shared `normalize.rs` module to prevent drift and ensure byte-identical normalization across both binaries.

## Problem Statement
The normalization code is currently duplicated between:
- `scripts/lrclib-extract/src/main.rs` (lines 210-717)
- `scripts/lrclib-extract/src/bin/normalize-spotify.rs` (lines 19-392)

Key differences discovered:
1. **TITLE_PATTERNS**: Different regex patterns (main.rs has more sophisticated patterns)
2. **normalize_punctuation()**: main.rs has encoding fixes (`?t` → `'t`) and multi-space collapsing; normalize-spotify.rs is simpler
3. **normalize_title()**: Different ordering of operations between files
4. **is_combining_mark()**: Different syntax forms (equivalent but not byte-identical)
5. **main.rs-only**: `MULTI_SPACE`, `normalize_title_with_artist()`, `extract_primary_artist()`, `ARTIST_SEPARATOR`
6. **ARTIST_TRANSLITERATIONS**: Both have ~205 entries but ordering may differ

Any divergence produces `no_candidates` failures in the exact-key pipeline.

---

## Tasks

### Task 1: Create `normalize.rs` module file
- **File:** `scripts/lrclib-extract/src/normalize.rs` (NEW)
- **Changes:** Create new file with module structure:
  ```rust
  //! Shared normalization functions for LRCLIB-Spotify matching.
  //! Used by both lrclib-extract and normalize-spotify binaries.
  //!
  //! CRITICAL: Any changes here affect both binaries. Run tests after changes.

  use any_ascii::any_ascii;
  use once_cell::sync::Lazy;
  use regex::Regex;
  use rustc_hash::FxHashMap;
  use unicode_normalization::UnicodeNormalization;

  // Module contents will be added in subsequent tasks
  ```
- **Validation:** `cargo check` compiles (empty module is valid)

---

### Task 2: Move regex constants to `normalize.rs`
- **File:** `scripts/lrclib-extract/src/normalize.rs`
- **Changes:** Add all regex patterns (using main.rs versions as canonical):
  - `TRACK_NUMBER_PREFIX` (line 248 in main.rs)
  - `TRACK_NUMBER_SPACE_PREFIX` (line 255 in main.rs)
  - `MOJIBAKE_SUFFIX` (line 260 in main.rs)
  - `BRACKET_SUFFIX` (line 265 in main.rs)
  - `FILE_EXTENSION` (line 270 in main.rs)
  - `YEAR_SUFFIX` (line 275 in main.rs)
  - `TITLE_PATTERNS` (line 210 in main.rs)
  - `ARTIST_PATTERNS` (line 279 in main.rs)
  - `MULTI_SPACE` (line 585 in main.rs)
  - `ARTIST_SEPARATOR` (line 721 in main.rs)
- **Note:** Export all as `pub static`
- **Validation:** `cargo check` compiles

---

### Task 3: Move `ARTIST_TRANSLITERATIONS` to `normalize.rs`
- **File:** `scripts/lrclib-extract/src/normalize.rs`
- **Changes:** Move the full ARTIST_TRANSLITERATIONS map from main.rs (lines 340-561)
- **Note:** This is ~205 entries. Export as `pub static`
- **Validation:** `cargo check` compiles

---

### Task 4: Move helper functions to `normalize.rs`
- **File:** `scripts/lrclib-extract/src/normalize.rs`
- **Changes:** Add helper functions:
  ```rust
  /// Check if a character is a Unicode combining mark (diacritical mark).
  pub fn is_combining_mark(c: char) -> bool {
      matches!(c as u32, 0x0300..=0x036F | 0x1AB0..=0x1AFF | 0x1DC0..=0x1DFF | 0xFE20..=0xFE2F)
  }

  /// Fold Unicode text to ASCII by applying NFKD decomposition and removing combining marks.
  pub fn fold_to_ascii(s: &str) -> String {
      let stripped: String = s.nfkd()
          .filter(|c| !is_combining_mark(*c))
          .collect();
      any_ascii(&stripped).to_lowercase()
  }

  /// Normalize punctuation by converting curly quotes and fixing encoding issues.
  pub fn normalize_punctuation(s: &str) -> String {
      // Use main.rs version with encoding fixes and multi-space collapsing
  }
  ```
- **Validation:** `cargo check` compiles

---

### Task 5: Move `normalize_title()` to `normalize.rs`
- **File:** `scripts/lrclib-extract/src/normalize.rs`
- **Changes:** Add `normalize_title()` function using main.rs implementation (lines 613-641)
- **Signature:** `pub fn normalize_title(title: &str) -> String`
- **Validation:** `cargo check` compiles

---

### Task 6: Move `normalize_title_with_artist()` to `normalize.rs`
- **File:** `scripts/lrclib-extract/src/normalize.rs`
- **Changes:** Add function from main.rs (lines 645-682)
- **Signature:** `pub fn normalize_title_with_artist(title: &str, artist: &str) -> String`
- **Validation:** `cargo check` compiles

---

### Task 7: Move `normalize_artist()` to `normalize.rs`
- **File:** `scripts/lrclib-extract/src/normalize.rs`
- **Changes:** Add function from main.rs (lines 684-717)
- **Signature:** `pub fn normalize_artist(artist: &str) -> String`
- **Note:** Includes transliteration lookup (pre-fold and post-fold)
- **Validation:** `cargo check` compiles

---

### Task 8: Move `extract_primary_artist()` to `normalize.rs`
- **File:** `scripts/lrclib-extract/src/normalize.rs`
- **Changes:** Add function from main.rs (lines 730-744)
- **Signature:** `pub fn extract_primary_artist(artist_norm: &str) -> Option<String>`
- **Validation:** `cargo check` compiles

---

### Task 9: Update `main.rs` to use shared module
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Changes:**
  1. Add `mod normalize;` after other imports
  2. Add `use normalize::*;` to import all public items
  3. Remove all normalization code from main.rs:
     - Delete lines 210-285 (TITLE_PATTERNS, regex constants)
     - Delete lines 340-561 (ARTIST_TRANSLITERATIONS)
     - Delete lines 563-744 (helper functions, normalize_* functions)
     - Keep remaining scoring/matching logic
- **Validation:** `cargo check` compiles

---

### Task 10: Update `normalize-spotify.rs` to use shared module
- **File:** `scripts/lrclib-extract/src/bin/normalize-spotify.rs`
- **Changes:**
  1. Replace `use any_ascii::any_ascii;` and other normalization imports with:
     ```rust
     use lrclib_extract::normalize::{normalize_title, normalize_artist};
     ```
  2. Delete all normalization code (lines 19-392):
     - All `static` regex patterns
     - `ARTIST_TRANSLITERATIONS`
     - `is_combining_mark()`, `fold_to_ascii()`, `normalize_punctuation()`
     - `normalize_title()`, `normalize_artist()`
  3. Keep only the main logic for database operations
- **Validation:** `cargo check` compiles

---

### Task 11: Add `lib.rs` for crate exports
- **File:** `scripts/lrclib-extract/src/lib.rs` (NEW)
- **Changes:** Create library entry point:
  ```rust
  //! LRCLIB extraction library - shared modules for all binaries.

  pub mod normalize;
  ```
- **Note:** Required for `normalize-spotify.rs` to import from the crate
- **Validation:** `cargo check` compiles

---

### Task 12: Update `Cargo.toml` for library + binary structure
- **File:** `scripts/lrclib-extract/Cargo.toml`
- **Changes:** Add library definition (if not already present):
  ```toml
  [lib]
  name = "lrclib_extract"
  path = "src/lib.rs"

  [[bin]]
  name = "lrclib-extract"
  path = "src/main.rs"

  [[bin]]
  name = "normalize-spotify"
  path = "src/bin/normalize-spotify.rs"
  ```
- **Validation:** `cargo check` compiles both binaries

---

### Task 13: Verify both binaries compile
- **File:** N/A
- **Changes:** N/A
- **Validation:** Run `cargo build --release` and verify both binaries compile:
  - `target/release/lrclib-extract`
  - `target/release/normalize-spotify`

---

### Task 14: Add basic unit tests to `normalize.rs`
- **File:** `scripts/lrclib-extract/src/normalize.rs`
- **Changes:** Add test module at the end:
  ```rust
  #[cfg(test)]
  mod tests {
      use super::*;

      #[test]
      fn test_normalize_title_basic() {
          assert_eq!(normalize_title("03 - Song Name"), "song name");
          assert_eq!(normalize_title("Song [Mono]"), "song");
          assert_eq!(normalize_title("Track (2021 Remaster)"), "track");
      }

      #[test]
      fn test_normalize_artist_basic() {
          assert_eq!(normalize_artist("The Beatles"), "beatles");
          assert_eq!(normalize_artist("Band, The"), "band");
          assert_eq!(normalize_artist("Artist feat. Other"), "artist");
      }

      #[test]
      fn test_fold_to_ascii() {
          assert_eq!(fold_to_ascii("Björk"), "bjork");
          assert_eq!(fold_to_ascii("Motörhead"), "motorhead");
          assert_eq!(fold_to_ascii("Beyoncé"), "beyonce");
      }

      #[test]
      fn test_transliteration() {
          assert_eq!(normalize_artist("кино"), "kino");
          assert_eq!(normalize_artist("אייל גולן"), "eyal golan");
      }
  }
  ```
- **Validation:** `cargo test` passes all tests

---

### Task 15: Run full test suite
- **File:** N/A
- **Changes:** N/A
- **Validation:** `cargo test` passes all tests

---

## Validation Commands

```bash
cd scripts/lrclib-extract

# Check compilation
cargo check

# Run tests
cargo test

# Build release binaries
cargo build --release

# Verify both binaries exist
ls -la target/release/lrclib-extract target/release/normalize-spotify
```

## Done When

- [x] `normalize.rs` module exists with all normalization code
- [x] `lib.rs` exports the normalize module
- [x] `main.rs` uses `mod normalize; use normalize::*;`
- [x] `normalize-spotify.rs` uses `use lrclib_extract::normalize::*;`
- [x] No normalization code duplicated in either binary
- [x] `cargo test` passes (27 tests pass)
- [x] `cargo build --release` produces both binaries

## Notes

### Migration Strategy
1. Create new files first (normalize.rs, lib.rs)
2. Copy code to normalize.rs (don't delete from main.rs yet)
3. Update main.rs to use module
4. Verify main.rs still works
5. Update normalize-spotify.rs
6. Verify normalize-spotify still works
7. Delete duplicated code from original locations

### Key Differences to Resolve (Using main.rs as canonical)
| Item | main.rs | normalize-spotify.rs | Resolution |
|------|---------|---------------------|------------|
| `normalize_punctuation` | Has encoding fixes | Simpler | Use main.rs version |
| `normalize_title` order | punct→ext→track→space→bracket→year→moji→patterns→fold | ext→year→bracket→track→space→moji→punct→fold→patterns | Use main.rs version |
| `TITLE_PATTERNS` | 16 patterns | 4 patterns | Use main.rs version |
| `is_combining_mark` | `c as u32` syntax | char literal syntax | Use main.rs version (equivalent) |

### Files to Create
- `scripts/lrclib-extract/src/normalize.rs` (NEW)
- `scripts/lrclib-extract/src/lib.rs` (NEW)

### Files to Modify
- `scripts/lrclib-extract/src/main.rs` (remove normalization code)
- `scripts/lrclib-extract/src/bin/normalize-spotify.rs` (remove normalization code, add import)
- `scripts/lrclib-extract/Cargo.toml` (add lib section)
