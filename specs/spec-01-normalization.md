# Spec 01: Normalization Improvements

## Overview

Enhance title and artist normalization to fix matching failures caused by track number prefixes, artist names in titles, diacritics, and encoding issues.

## Current State

`normalize_title()` in `scripts/lrclib-extract/src/main.rs` (lines 242-248) strips:
- Remaster suffixes
- Live/acoustic tags
- Edition markers
- Version markers
- Featuring tags

Missing:
- Track number prefixes (`03 - Song`)
- Artist name prefixes (`Artist - Song`)
- Diacritic folding (`Beyonce` vs `Beyonce`)
- Mojibake cleanup (`Song Title\uFFFD`)
- Punctuation normalization (curly quotes)

## Changes Required

### 1. Add Track Number Prefix Regex

```rust
static TRACK_NUMBER_PREFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"(?i)^(?:track\s*)?\d{1,4}\s*[-–—._]\s*").unwrap()
);
```

### 2. Add 2-Arg Normalize Function

```rust
fn normalize_title_with_artist(title: &str, artist: &str) -> String {
    let mut result = title.to_string();

    // Strip track number first
    result = TRACK_NUMBER_PREFIX.replace(&result, "").to_string();

    // Strip artist prefix
    let artist_norm = normalize_artist(artist);
    if artist_norm.len() >= 3 {
        let escaped = regex::escape(&artist_norm);
        let prefix_re = Regex::new(&format!(r"(?i)^\s*{}\s*[-–—:]\s*", escaped)).unwrap();
        result = prefix_re.replace(&result, "").to_string();
    }

    // Existing patterns
    for pattern in TITLE_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }

    fold_to_ascii(&result).trim().to_string()
}
```

### 3. Add Unicode Normalization

Add to `Cargo.toml`:
```toml
unicode-normalization = "0.1"
```

Add function:
```rust
use unicode_normalization::UnicodeNormalization;

fn fold_to_ascii(s: &str) -> String {
    s.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
}

fn is_combining_mark(c: char) -> bool {
    matches!(c as u32, 0x0300..=0x036F | 0x1AB0..=0x1AFF | 0x1DC0..=0x1DFF | 0xFE20..=0xFE2F)
}
```

### 4. Add Mojibake Cleanup

```rust
static MOJIBAKE_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"[\uFFFD\u{FFFD}]+$").unwrap()
);
```

### 5. Add Punctuation Normalization

```rust
fn normalize_punctuation(s: &str) -> String {
    s.replace([''', '''], "'")
     .replace(['"', '"'], "\"")
     .replace(['´', '`'], "'")
     .replace(" & ", " and ")
}
```

## Integration Points

- Update all calls to `normalize_title()` to use `normalize_title_with_artist()` where artist is available
- Apply in `build_groups_and_index()` and Spotify streaming normalization
- Apply `fold_to_ascii()` as final step in both title and artist normalization

## Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_track_number_stripping() {
        assert_eq!(normalize_title("03 - Love You To Death"), "love you to death");
        assert_eq!(normalize_title("Track 5 - Song Name"), "song name");
    }

    #[test]
    fn test_diacritic_folding() {
        assert_eq!(fold_to_ascii("Beyonce"), "beyonce");
        assert_eq!(fold_to_ascii("naive"), "naive");
    }

    #[test]
    fn test_artist_prefix_stripping() {
        assert_eq!(
            normalize_title_with_artist("Type O Negative - Love You To Death", "Type O Negative"),
            "love you to death"
        );
    }
}
```

## Validation

```bash
cd scripts/lrclib-extract && cargo test
```

## Done When

- [ ] Track numbers stripped from title_norm
- [ ] Artist prefixes stripped from title_norm
- [ ] Diacritics folded (Beyonce matches Beyonce)
- [ ] Mojibake suffixes removed
- [ ] All tests pass
