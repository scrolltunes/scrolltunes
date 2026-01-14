# Spec 04: Combined Scoring System

## Overview

Replace hard ±10s duration cutoff with graduated scoring. Add guardrails against false positives.

## Current State

Duration matching in `stream_match_spotify()` (line 640):
```rust
if (lrclib.track.duration_sec - spotify_duration_sec).abs() > 10 {
    continue;
}
```

This rejects valid matches that are 11-15s off (different versions, fades, etc.)

## Changes Required

### 1. Duration Score Function

```rust
fn duration_score(lrclib_sec: i64, spotify_ms: i64) -> i32 {
    let diff = (lrclib_sec - spotify_ms / 1000).abs();
    match diff {
        0..=2   => 100,  // Near-perfect
        3..=5   => 80,   // Excellent
        6..=10  => 50,   // Good
        11..=15 => 25,   // Acceptable (currently rejected!)
        16..=30 => 10,   // Poor but possible
        _       => -1000, // Hard reject
    }
}
```

### 2. Combined Score Function

```rust
fn combined_score(
    lrclib: &Track,
    lrclib_quality: i32,
    spotify: &SpotifyTrack,
    group_artist_norm: &str,
) -> i32 {
    let spotify_duration_sec = spotify.duration_ms / 1000;
    let duration_diff = (lrclib.duration_sec - spotify_duration_sec).abs();

    // ═══════════════════════════════════════════════════════════════════════
    // GUARDRAIL 1: Hard duration rejection
    // Reject if diff > 30s OR diff > 25% of song length
    // ═══════════════════════════════════════════════════════════════════════
    let max_allowed_diff = 30.max((spotify_duration_sec as f64 * 0.25) as i64);
    if duration_diff > max_allowed_diff {
        return -1000;
    }

    // Duration score (graduated)
    let dur_score = match duration_diff {
        0..=2   => 100,
        3..=5   => 80,
        6..=10  => 50,
        11..=15 => 25,
        16..=30 => 10,
        _       => 0,
    };

    let mut score = dur_score;

    // ═══════════════════════════════════════════════════════════════════════
    // GUARDRAIL 2: Artist verification
    // ═══════════════════════════════════════════════════════════════════════
    let spotify_artist_norm = normalize_artist(&spotify.artist);
    let artist_match = if spotify_artist_norm == group_artist_norm {
        50  // Exact match
    } else {
        let sim = compute_artist_similarity(&spotify_artist_norm, group_artist_norm);
        if sim < 0.3 {
            return -500;  // Artist mismatch - reject
        }
        (sim * 30.0) as i32
    };
    score += artist_match;

    // LRCLIB quality score (existing logic)
    score += lrclib_quality;

    // Title cleanliness bonus
    if !has_garbage_title_pattern(&lrclib.title) {
        score += 30;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GUARDRAIL 3: Popularity as tiebreaker only (bounded)
    // ═══════════════════════════════════════════════════════════════════════
    score += spotify.popularity / 10;  // 0-10 points

    score
}
```

### 3. Artist Similarity Function

```rust
fn compute_artist_similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }

    // Tokenize and compute Jaccard similarity
    let tokens_a: FxHashSet<&str> = a.split_whitespace().collect();
    let tokens_b: FxHashSet<&str> = b.split_whitespace().collect();

    if tokens_a.is_empty() || tokens_b.is_empty() {
        return 0.0;
    }

    let intersection = tokens_a.intersection(&tokens_b).count();
    let union = tokens_a.union(&tokens_b).count();

    intersection as f64 / union as f64
}
```

### 4. Score Thresholds

```rust
const ACCEPT_THRESHOLD: i32 = 80;
const LOW_CONFIDENCE_THRESHOLD: i32 = 120;

fn is_acceptable_match(score: i32) -> bool {
    score >= ACCEPT_THRESHOLD
}

fn is_low_confidence(score: i32) -> bool {
    score >= ACCEPT_THRESHOLD && score < LOW_CONFIDENCE_THRESHOLD
}
```

## Scoring Examples

Spotify: "Love You to Death" by Type O Negative, 429s, popularity 64

| LRCLIB Entry | Duration | Artist | Quality | Clean | Pop | **Total** |
|--------------|----------|--------|---------|-------|-----|-----------|
| "Love You To Death" (414s) | 25 | +50 | +40 | +30 | +6 | **151** |
| "03 - Love you to Death" (429s) | 100 | +50 | -10 | 0 | +6 | **146** |

With graduated scoring:
- 414s entry (15s off) now acceptable at score 151
- Both entries competitive, cleaner title wins despite duration difference

## Validation

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_duration_score() {
        assert_eq!(duration_score(429, 429_000), 100);
        assert_eq!(duration_score(414, 429_000), 25);  // 15s off
        assert_eq!(duration_score(400, 429_000), 10);  // 29s off
        assert_eq!(duration_score(350, 429_000), -1000);  // Too far
    }

    #[test]
    fn test_artist_similarity() {
        assert_eq!(compute_artist_similarity("type o negative", "type o negative"), 1.0);
        assert!(compute_artist_similarity("type o negative", "type o") > 0.5);
        assert!(compute_artist_similarity("metallica", "beatles") < 0.3);
    }
}
```

## Done When

- [ ] Duration uses graduated scoring (not hard ±10s)
- [ ] Duration guardrail: max(30s, 25%)
- [ ] Artist verification with 0.3 threshold
- [ ] Popularity bounded to 0-10 points
- [ ] Score threshold 80 for acceptance
- [ ] All tests pass
