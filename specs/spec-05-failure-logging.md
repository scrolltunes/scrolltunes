# Spec 05: Match Failure Logging

## Overview

Log "near-miss" candidates for post-hoc analysis and iterative improvement of matching rules.

## Purpose

- Identify normalization gaps
- Find patterns in unmatched high-quality tracks
- Enable iterative improvement without full re-extraction

## Schema

```sql
CREATE TABLE match_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- LRCLIB entry
    lrclib_id INTEGER NOT NULL,
    lrclib_title TEXT NOT NULL,
    lrclib_artist TEXT NOT NULL,
    lrclib_album TEXT,
    lrclib_duration_sec INTEGER NOT NULL,
    lrclib_title_norm TEXT NOT NULL,
    lrclib_artist_norm TEXT NOT NULL,
    lrclib_quality INTEGER NOT NULL,
    group_variant_count INTEGER NOT NULL,

    -- Failure info
    failure_reason TEXT NOT NULL,  -- 'no_candidates', 'all_rejected', 'low_confidence'
    best_score INTEGER,

    -- Spotify candidates (JSON array, top 5)
    spotify_candidates TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_failures_reason ON match_failures(failure_reason);
CREATE INDEX idx_failures_quality ON match_failures(lrclib_quality DESC);
CREATE INDEX idx_failures_artist ON match_failures(lrclib_artist_norm);
```

## Data Structures

```rust
#[derive(Debug, Clone, serde::Serialize)]
struct SpotifyCandidate {
    spotify_id: String,
    spotify_name: String,
    spotify_artist: String,
    spotify_duration_ms: i64,
    spotify_popularity: i32,
    duration_diff_sec: i64,
    score: i32,
    reject_reason: Option<String>,
}

#[derive(Debug, Clone)]
enum FailureReason {
    NoSpotifyCandidates,
    AllCandidatesRejected {
        candidate_count: usize,
        best_score: i32,
        primary_reject_reason: String,
    },
    LowConfidenceMatch {
        accepted_score: i32,
        threshold: i32,
    },
}
```

## Logging Criteria

```rust
fn should_log_failure(group: &LrclibGroup, best_score: Option<i32>) -> bool {
    let best_lrclib = group.tracks.iter().max_by_key(|t| t.quality).unwrap();

    // Only log high-quality tracks with clean titles
    let is_high_quality = best_lrclib.quality >= 30;
    let has_clean_title = !has_garbage_title_pattern(&best_lrclib.track.title);

    // Either no match, or low-confidence match
    let is_failure_or_marginal = match best_score {
        None => true,
        Some(s) if s < 80 => true,
        _ => false,
    };

    is_high_quality && has_clean_title && is_failure_or_marginal
}
```

## Implementation

```rust
fn log_match_failure(
    conn: &Connection,
    group: &LrclibGroup,
    spotify_candidates: &[SpotifyCandidate],
    failure_reason: FailureReason,
    best_score: Option<i32>,
) -> Result<()> {
    let best_lrclib = group.tracks.iter().max_by_key(|t| t.quality).unwrap();

    let candidates_json = serde_json::to_string(
        &spotify_candidates.iter().take(5).collect::<Vec<_>>()
    )?;

    let reason_str = match &failure_reason {
        FailureReason::NoSpotifyCandidates => "no_candidates",
        FailureReason::AllCandidatesRejected { .. } => "all_rejected",
        FailureReason::LowConfidenceMatch { .. } => "low_confidence",
    };

    conn.execute(
        "INSERT INTO match_failures (...) VALUES (...)",
        params![...],
    )?;

    Ok(())
}
```

## Analysis Queries

```sql
-- Top failure reasons
SELECT failure_reason, COUNT(*) as count
FROM match_failures
GROUP BY failure_reason
ORDER BY count DESC;

-- High-quality tracks with no Spotify candidates
SELECT lrclib_id, lrclib_title, lrclib_artist, lrclib_title_norm
FROM match_failures
WHERE failure_reason = 'no_candidates' AND lrclib_quality >= 50
ORDER BY lrclib_quality DESC
LIMIT 100;

-- Tracks rejected due to duration
SELECT
    lrclib_id, lrclib_title, lrclib_artist, lrclib_duration_sec,
    json_extract(spotify_candidates, '$[0].spotify_name') as spotify_name,
    json_extract(spotify_candidates, '$[0].duration_diff_sec') as duration_diff
FROM match_failures
WHERE failure_reason = 'all_rejected'
  AND json_extract(spotify_candidates, '$[0].reject_reason') LIKE '%duration%'
ORDER BY json_extract(spotify_candidates, '$[0].spotify_popularity') DESC
LIMIT 100;

-- Find patterns in unmatched titles
SELECT
    CASE
        WHEN lrclib_title_norm GLOB '[0-9]* - *' THEN 'track_number_prefix'
        WHEN lrclib_title LIKE '%\uFFFD%' THEN 'mojibake'
        WHEN length(lrclib_title) > 100 THEN 'very_long_title'
        ELSE 'other'
    END as pattern,
    COUNT(*) as count
FROM match_failures
WHERE failure_reason = 'no_candidates'
GROUP BY pattern
ORDER BY count DESC;
```

## Expected Volume

| Category | Estimated Count |
|----------|-----------------|
| Total unmatched | ~1.2M |
| Worth logging (quality >= 30) | ~300K-500K |
| No candidates | ~200K |
| All rejected | ~100K |
| Low confidence | ~50K |

Storage: ~50-100 MB for the table.

## Cargo.toml Addition

```toml
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

## Done When

- [ ] `match_failures` table created in output DB
- [ ] Logging implemented for all three failure types
- [ ] Only high-quality clean-title tracks logged
- [ ] JSON serialization of candidates works
- [ ] Analysis queries return expected results
