# Spec 06: Title-First Bounded Rescue Pass

> Second-pass candidate generation for `no_candidates` groups using title-only lookup

## Problem Statement

Many `no_candidates` failures are caused by minor artist differences:
- Typos: "Everythig But The Girl" vs "Everything but the Girl"
- Punctuation: "Guns 'n' Roses" vs "Guns N' Roses"
- Formatting: "AC/DC" vs "AC DC" vs "ACDC"
- Partial names: "Queen" vs "Queen + Paul Rodgers"

These cases have correct titles but artist normalization mismatches.

## Requirements

### R6.1: Title-Only Candidate Retrieval

For groups with `no_candidates`, fetch by title alone:

```rust
fn title_first_rescue(group: &Group) -> Option<Vec<Candidate>> {
    let sql = r#"
        SELECT track_rowid, artist_norm, popularity, duration_ms
        FROM track_norm
        WHERE title_norm = ?
        ORDER BY popularity DESC
        LIMIT ?
    "#;

    // Limit based on title rarity
    let limit = if is_common_title(&group.title_norm) { 50 } else { 500 };

    query_candidates(sql, &[&group.title_norm], limit)
}
```

### R6.2: Artist Similarity Filter

Filter candidates by artist similarity using edit distance:

```rust
fn filter_by_artist_similarity(
    candidates: Vec<Candidate>,
    lrclib_artist_norm: &str,
    threshold: f32,  // 0.7 = 70% similarity
) -> Vec<Candidate> {
    candidates.into_iter()
        .filter(|c| {
            let similarity = normalized_levenshtein(
                lrclib_artist_norm,
                &c.artist_norm
            );
            similarity >= threshold
        })
        .collect()
}
```

### R6.3: Common Title Guard

Skip title-first rescue for very common titles:

```rust
fn is_common_title(title_norm: &str) -> bool {
    // Titles that appear in >10,000 tracks
    const COMMON_TITLES: &[&str] = &[
        "home", "love", "intro", "outro", "interlude",
        "untitled", "track 1", "bonus track", "live",
        "remix", "acoustic", "instrumental",
    ];

    COMMON_TITLES.contains(&title_norm) || title_norm.len() < 3
}

fn should_skip_title_rescue(title_norm: &str, candidate_count: usize) -> bool {
    is_common_title(title_norm) || candidate_count > 1000
}
```

### R6.4: High-Confidence Requirement

Only accept title-first matches with strong confidence:

```rust
fn validate_title_first_match(
    best: &ScoredCandidate,
    runner_up: Option<&ScoredCandidate>,
) -> bool {
    // Require high artist similarity
    if best.artist_similarity < 0.75 {
        return false;
    }

    // Require duration within tolerance
    if best.duration_diff > 30 {
        return false;
    }

    // Require significant margin over runner-up
    if let Some(runner) = runner_up {
        if best.score - runner.score < 30 {
            return false;  // Too ambiguous
        }
    }

    true
}
```

### R6.5: Scoring with Similarity Bonus

Include artist similarity in scoring:

```rust
fn score_title_first_candidate(
    group: &Group,
    candidate: &Candidate,
) -> ScoredCandidate {
    let artist_similarity = normalized_levenshtein(
        &group.artist_norm,
        &candidate.artist_norm
    );

    let score =
        score_duration(group.duration_sec, candidate.duration_ms)
        + (artist_similarity * 50.0) as i32  // 0-50 based on similarity
        + popularity_bonus(candidate.popularity)
        + group.lrclib_quality;

    ScoredCandidate {
        candidate: candidate.clone(),
        score,
        artist_similarity,
        duration_diff: (group.duration_sec - candidate.duration_ms / 1000).abs(),
    }
}
```

## Implementation Notes

### Edit Distance Library

Use `strsim` crate for Levenshtein distance:

```toml
# Cargo.toml
[dependencies]
strsim = "0.11"
```

```rust
use strsim::normalized_levenshtein;

// Returns 0.0 to 1.0 (1.0 = identical)
let similarity = normalized_levenshtein("everythig", "everything");
// similarity ≈ 0.9
```

### Pipeline Integration

```rust
// After main matching phase, before pop=0
let no_candidates_groups: Vec<_> = groups.iter()
    .filter(|g| matches!(
        match_results.get(&g.key()),
        Some(MatchStatus::NoCandidates)
    ))
    .collect();

log::info!("[RESCUE] Running title-first rescue for {} groups",
    no_candidates_groups.len());

let mut rescue_matches = 0;
for group in no_candidates_groups {
    if should_skip_title_rescue(&group.title_norm, count) {
        continue;
    }

    if let Some(candidates) = title_first_rescue(group) {
        let filtered = filter_by_artist_similarity(candidates, &group.artist_norm, 0.7);
        if let Some(best) = score_and_validate(group, filtered) {
            match_results.insert(group.key(), MatchStatus::Matched(best));
            rescue_matches += 1;
        }
    }
}

log::info!("[RESCUE] Found {} matches via title-first rescue", rescue_matches);
```

### Performance Considerations

| Factor | Mitigation |
|--------|-----------|
| Many title-only lookups | Batch queries, limit per title |
| Edit distance computation | Only on filtered candidates (<500) |
| Common titles | Skip or heavily limit |
| Total groups to rescue | ~850K, but many will have 0 candidates |

Estimated runtime: +5-10 minutes (bounded by candidate limits)

## Acceptance Criteria

- [ ] Title-first rescue runs for `no_candidates` groups
- [ ] Artist similarity threshold filters weak matches
- [ ] Common titles are skipped or heavily limited
- [ ] High-confidence requirement prevents false positives
- [ ] Match rate improves (target: +2-4%)
- [ ] Runtime increase is acceptable (<10 minutes)

## Dependencies

- Spec 02: Top-K Candidates (for title-only index)
- Spec 01: Normalization Unification

## Estimated Impact

- **+2-4% match rate** from recovering artist-mismatch cases
- Most impact on:
  - Typos in artist names
  - Punctuation variants
  - Partial artist names
- Risk: false positives if similarity threshold too low

## Testing Strategy

1. Sample 100 title-first rescue matches
2. Manually verify correctness
3. Target: >95% precision
4. If precision low, raise similarity threshold or margin requirement
