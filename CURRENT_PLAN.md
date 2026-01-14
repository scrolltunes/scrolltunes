# Current Plan: Spec 01 - Normalization Improvements

## Spec Reference
[specs/spec-01-normalization.md](specs/spec-01-normalization.md)

## Overview
Enhance title and artist normalization to fix matching failures caused by track number prefixes, artist names in titles, diacritics, and encoding issues.

## Tasks

### Task 1: Add unicode-normalization dependency
- **File:** `scripts/lrclib-extract/Cargo.toml`
- **Line:** 14 (after `rustc-hash`)
- **Changes:** Add `unicode-normalization = "0.1"` dependency
- **Validation:** `cargo check` compiles successfully

---

### Task 2: Add unicode-normalization import
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** 1-10 (imports section)
- **Changes:** Add `use unicode_normalization::UnicodeNormalization;`
- **Validation:** `cargo check` compiles successfully

---

### Task 3: Add TRACK_NUMBER_PREFIX regex constant
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** After line 130 (after `TITLE_PATTERNS`)
- **Changes:** Add static regex pattern:
  ```rust
  static TRACK_NUMBER_PREFIX: Lazy<Regex> = Lazy::new(||
      Regex::new(r"(?i)^(?:track\s*)?\d{1,4}\s*[-–—._]\s*").unwrap()
  );
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 4: Add MOJIBAKE_SUFFIX regex constant
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** After TRACK_NUMBER_PREFIX (or after line 130)
- **Changes:** Add static regex pattern:
  ```rust
  static MOJIBAKE_SUFFIX: Lazy<Regex> = Lazy::new(||
      Regex::new(r"[\uFFFD]+$").unwrap()
  );
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 5: Implement is_combining_mark() helper function
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** After line 240 (after `should_skip_title` function at line 238, before `normalize_title` at line 242)
- **Changes:** Add helper function:
  ```rust
  fn is_combining_mark(c: char) -> bool {
      matches!(c as u32, 0x0300..=0x036F | 0x1AB0..=0x1AFF | 0x1DC0..=0x1DFF | 0xFE20..=0xFE2F)
  }
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 6: Implement fold_to_ascii() function
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** After `is_combining_mark()` function
- **Changes:** Add function:
  ```rust
  fn fold_to_ascii(s: &str) -> String {
      s.nfkd()
          .filter(|c| !is_combining_mark(*c))
          .collect::<String>()
          .to_lowercase()
  }
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 7: Implement normalize_punctuation() function
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** After `fold_to_ascii()` function
- **Changes:** Add function:
  ```rust
  fn normalize_punctuation(s: &str) -> String {
      s.replace([''', '''], "'")
       .replace(['"', '"'], "\"")
       .replace(['´', '`'], "'")
       .replace(" & ", " and ")
  }
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 8: Update normalize_title() to use new helpers
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** 242-248 (current `normalize_title` function)
- **Changes:** Update function to:
  1. Apply `normalize_punctuation()` first
  2. Strip track number prefix using `TRACK_NUMBER_PREFIX`
  3. Strip mojibake suffix using `MOJIBAKE_SUFFIX`
  4. Apply existing TITLE_PATTERNS
  5. Apply `fold_to_ascii()` as final step
  ```rust
  fn normalize_title(title: &str) -> String {
      let mut result = normalize_punctuation(title);

      // Strip track number prefix
      result = TRACK_NUMBER_PREFIX.replace(&result, "").to_string();

      // Strip mojibake suffix
      result = MOJIBAKE_SUFFIX.replace(&result, "").to_string();

      // Apply existing patterns
      for pattern in TITLE_PATTERNS.iter() {
          result = pattern.replace_all(&result, "").to_string();
      }

      fold_to_ascii(&result).trim().to_string()
  }
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 9: Implement normalize_title_with_artist() 2-arg function
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** After updated `normalize_title()` function
- **Changes:** Add function that additionally strips artist prefix from title:
  ```rust
  fn normalize_title_with_artist(title: &str, artist: &str) -> String {
      let mut result = normalize_punctuation(title);

      // Strip track number prefix
      result = TRACK_NUMBER_PREFIX.replace(&result, "").to_string();

      // Strip artist prefix if artist is long enough
      let artist_norm = normalize_artist(artist);
      if artist_norm.len() >= 3 {
          let escaped = regex::escape(&artist_norm);
          if let Ok(prefix_re) = Regex::new(&format!(r"(?i)^\s*{}\s*[-–—:]\s*", escaped)) {
              result = prefix_re.replace(&result, "").to_string();
          }
      }

      // Strip mojibake suffix
      result = MOJIBAKE_SUFFIX.replace(&result, "").to_string();

      // Apply existing patterns
      for pattern in TITLE_PATTERNS.iter() {
          result = pattern.replace_all(&result, "").to_string();
      }

      fold_to_ascii(&result).trim().to_string()
  }
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 10: Update normalize_artist() to use fold_to_ascii()
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** 250-262 (current `normalize_artist` function)
- **Changes:** Update to apply `normalize_punctuation()` and `fold_to_ascii()` for consistent diacritic handling:
  ```rust
  fn normalize_artist(artist: &str) -> String {
      let mut result = normalize_punctuation(artist);
      for pattern in ARTIST_PATTERNS.iter() {
          result = pattern.replace_all(&result, "").to_string();
      }
      let normalized = fold_to_ascii(&result).trim().to_string();

      // Apply transliteration for known Cyrillic artists
      ARTIST_TRANSLITERATIONS
          .get(normalized.as_str())
          .map(|&s| s.to_string())
          .unwrap_or(normalized)
  }
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 11: Update select_canonical() to use normalize_title_with_artist()
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** 386-387 (in `select_canonical` function at line 373)
- **Changes:** Replace:
  ```rust
  let title_norm = normalize_title(&tracks[0].title);
  ```
  With:
  ```rust
  let title_norm = normalize_title_with_artist(&tracks[0].title, &tracks[0].artist);
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 12: Update group_tracks() to use normalize_title_with_artist()
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** 510 (in `group_tracks` function at line 506)
- **Changes:** Replace:
  ```rust
  let key = (normalize_title(&track.title), normalize_artist(&track.artist));
  ```
  With:
  ```rust
  let key = (normalize_title_with_artist(&track.title, &track.artist), normalize_artist(&track.artist));
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 13: Update stream_match_spotify() to use normalize_title_with_artist()
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** 629 (in `stream_match_spotify` function at line 575)
- **Changes:** Replace:
  ```rust
  let title_norm = normalize_title(&spotify_track.name);
  ```
  With:
  ```rust
  let title_norm = normalize_title_with_artist(&spotify_track.name, &spotify_track.artist);
  ```
- **Validation:** `cargo check` compiles successfully

---

### Task 14: Add unit tests for normalization functions
- **File:** `scripts/lrclib-extract/src/main.rs`
- **Line:** End of file (before closing main, as new test module)
- **Changes:** Add test module:
  ```rust
  #[cfg(test)]
  mod tests {
      use super::*;

      #[test]
      fn test_track_number_stripping() {
          assert_eq!(normalize_title("03 - Love You To Death"), "love you to death");
          assert_eq!(normalize_title("Track 5 - Song Name"), "song name");
          assert_eq!(normalize_title("01. First Song"), "first song");
          assert_eq!(normalize_title("0958 - Artist - Song"), "artist - song");
      }

      #[test]
      fn test_diacritic_folding() {
          assert_eq!(fold_to_ascii("Beyoncé"), "beyonce");
          assert_eq!(fold_to_ascii("naïve"), "naive");
          assert_eq!(fold_to_ascii("Motörhead"), "motorhead");
          assert_eq!(fold_to_ascii("Sigur Rós"), "sigur ros");
      }

      #[test]
      fn test_artist_prefix_stripping() {
          assert_eq!(
              normalize_title_with_artist("Type O Negative - Love You To Death", "Type O Negative"),
              "love you to death"
          );
          assert_eq!(
              normalize_title_with_artist("Metallica: Enter Sandman", "Metallica"),
              "enter sandman"
          );
      }

      #[test]
      fn test_punctuation_normalization() {
          assert_eq!(normalize_punctuation("Rock 'n' Roll"), "Rock 'n' Roll");
          assert_eq!(normalize_punctuation(""Quoted""), "\"Quoted\"");
          assert_eq!(normalize_punctuation("Rock & Roll"), "Rock and Roll");
      }

      #[test]
      fn test_mojibake_cleanup() {
          assert_eq!(normalize_title("Song Title\u{FFFD}"), "song title");
          assert_eq!(normalize_title("Song Title\u{FFFD}\u{FFFD}"), "song title");
      }

      #[test]
      fn test_combined_normalization() {
          // Track number + diacritics + remaster suffix
          assert_eq!(
              normalize_title("03 - Beyoncé - Single Ladies (Remastered 2020)"),
              "beyonce - single ladies"
          );
      }
  }
  ```
- **Validation:** `cargo test` passes all tests

---

### Task 15: Run full test suite
- **File:** N/A
- **Changes:** N/A
- **Validation:** Run `cargo test` in `scripts/lrclib-extract/` directory and verify all tests pass

---

### Task 16: Build release and verify compilation
- **File:** N/A
- **Changes:** N/A
- **Validation:** Run `cargo build --release` and verify successful compilation

---

## Validation Command

```bash
cd scripts/lrclib-extract && cargo test && cargo build --release
```

## Done When

- [x] `unicode-normalization` dependency added to Cargo.toml
- [x] Track numbers stripped from title_norm (e.g., "03 - Song" → "song")
- [x] Artist prefixes stripped from title_norm (e.g., "Artist - Song" → "song" when artist="Artist")
- [x] Diacritics folded (Beyoncé matches beyonce)
- [x] Mojibake suffixes removed (\uFFFD characters)
- [x] Punctuation normalized (curly quotes → straight quotes, & → and)
- [x] All unit tests pass (`cargo test`)
- [x] Release build succeeds (`cargo build --release`)

## Notes

### Key Integration Points
1. **group_tracks() at line 506**: Uses normalize functions to create grouping keys
2. **select_canonical() at line 373**: Uses normalize functions for title_norm/artist_norm fields
3. **stream_match_spotify() at line 575**: Uses normalize functions to match Spotify tracks

### Existing Patterns to Follow
- Static regex patterns use `Lazy<Regex>` with `once_cell::sync::Lazy`
- Functions follow snake_case naming
- Error handling uses `Result<T>` with `anyhow`
- Existing test patterns should be followed

### Potential Issues
- The `normalize_title_with_artist()` function creates a new Regex for each call when stripping artist prefix. This could be optimized later if performance is a concern, but for correctness we can accept this initially.
- The spec shows example test assertions that may need adjustment based on actual regex behavior (e.g., "03 - Beyoncé - Single Ladies" might retain "beyonce - single ladies" not just "single ladies" depending on whether artist stripping is applied).
