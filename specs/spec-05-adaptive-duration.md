# Spec 05: Adaptive Duration Relaxation

> Replace hard 30-second rejection with confidence-based tolerance

## Problem Statement

Current duration filtering uses a hard 30-second cutoff:

```rust
fn score_duration(lrclib_sec: i32, spotify_ms: i32) -> Option<i32> {
    let diff = (lrclib_sec - spotify_ms / 1000).abs();
    if diff > 30 {
        return None;  // Hard reject
    }
    // ... graduated scoring
}
```

**Problem:** Legitimate matches are rejected when:
1. Radio edit vs album version (commonly 30-60s difference)
2. Regional versions with different intros/outros
3. Remastered versions with slightly different timing
4. LRCLIB duration metadata is inaccurate

**Example:** "Stairway to Heaven" has versions from 7:55 to 8:02 - a 7-second variance that's within tolerance, but many songs have larger variances.

## Requirements

### R5.1: Confidence-Based Duration Tolerance

Replace hard cutoff with adaptive tolerance based on match confidence:

```rust
fn max_duration_tolerance(title_match: MatchQuality, artist_match: MatchQuality) -> i32 {
    match (title_match, artist_match) {
        (Exact, Exact) => 60,      // High confidence: allow 60s
        (Exact, Partial) => 45,    // Medium confidence: allow 45s
        (Partial, Exact) => 45,
        (Partial, Partial) => 30,  // Low confidence: keep strict
        _ => 30,
    }
}

enum MatchQuality {
    Exact,    // Normalized strings identical
    Partial,  // Primary-artist fallback or similar
    None,
}
```

### R5.2: Ratio-Based Tolerance for Long Tracks

For longer tracks, use percentage-based tolerance:

```rust
fn duration_tolerance(track_duration_sec: i32, confidence: Confidence) -> i32 {
    let base = match confidence {
        High => 60,
        Medium => 45,
        Low => 30,
    };

    // For tracks > 5 min, allow up to 10% variance
    let ratio_based = (track_duration_sec as f32 * 0.10) as i32;

    base.max(ratio_based).min(90)  // Cap at 90s
}
```

### R5.3: Graduated Scoring (No Hard Reject)

Replace None return with very low scores for borderline cases:

```rust
fn score_duration(lrclib_sec: i32, spotify_ms: i32, tolerance: i32) -> i32 {
    let diff = (lrclib_sec - spotify_ms / 1000).abs();

    match diff {
        0..=2 => 100,
        3..=5 => 80,
        6..=10 => 50,
        11..=15 => 25,
        16..=30 => 10,
        31..=45 => 5,    // NEW: low but not zero
        46..=60 => 2,    // NEW: very low
        _ if diff <= tolerance => 1,  // NEW: minimal
        _ => -100,       // Hard reject only beyond tolerance
    }
}
```

### R5.4: Require Score Margin for Relaxed Matches

When accepting matches with >30s duration difference, require:

```rust
fn validate_relaxed_match(candidate: &Match, runner_up: Option<&Match>) -> bool {
    if candidate.duration_diff <= 30 {
        return true;  // Normal match, always accept
    }

    // Relaxed match requires:
    // 1. High confidence (exact title + artist)
    if candidate.title_match != Exact || candidate.artist_match != Exact {
        return false;
    }

    // 2. Significant margin over runner-up (if any)
    if let Some(runner) = runner_up {
        if candidate.score - runner.score < 20 {
            return false;  // Too close, don't trust relaxed match
        }
    }

    true
}
```

## Implementation Notes

### Scoring Function Update

```rust
// In main.rs, update score_candidate()
fn score_candidate(
    group: &Group,
    candidate: &TrackCandidate,
    title_match: MatchQuality,
    artist_match: MatchQuality,
) -> Option<i32> {
    let tolerance = duration_tolerance(
        group.duration_sec,
        confidence_from_match(title_match, artist_match)
    );

    let duration_score = score_duration(
        group.duration_sec,
        candidate.duration_ms,
        tolerance
    );

    // Hard reject if beyond max tolerance
    if duration_score < 0 {
        return None;
    }

    Some(
        duration_score
        + artist_score(group, candidate)
        + quality_score(group)
        + popularity_bonus(candidate)
    )
}
```

### Logging for Analysis

Track relaxed matches separately:

```rust
struct MatchStats {
    total_matches: usize,
    normal_matches: usize,      // duration_diff <= 30s
    relaxed_matches: usize,     // duration_diff > 30s
    relaxed_by_range: HashMap<String, usize>,  // "31-45s", "46-60s", etc.
}
```

## Acceptance Criteria

- [ ] Duration tolerance is adaptive based on match confidence
- [ ] Long tracks (>5 min) use ratio-based tolerance
- [ ] Relaxed matches require high confidence and score margin
- [ ] Logging tracks how many matches are "relaxed"
- [ ] Match rate improves (target: +1-2%)
- [ ] Precision on relaxed matches is acceptable (audit sample)

## Dependencies

- Spec 01: Normalization Unification (for consistent MatchQuality assessment)

## Estimated Impact

- **+1-2% match rate** from recovering duration-rejected matches
- Most impact on:
  - Radio edits vs album versions
  - Live recordings with extended intros
  - Regional versions
- Risk: potential precision loss if tolerance too aggressive

## Testing Strategy

1. Sample 100 relaxed matches (duration_diff 31-60s)
2. Manually verify correctness
3. Target: >90% precision on relaxed matches
4. If precision low, tighten tolerance or increase margin requirement
