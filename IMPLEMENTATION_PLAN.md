# LRCLIB-Spotify Enrichment v2 Implementation Plan

## Goal

Improve Spotify match rate from 46% to 65-72% through enhanced normalization, delayed canonical selection, graduated scoring, and query optimization.

## Specs

| Spec | Description | Status |
|------|-------------|--------|
| [spec-01](specs/spec-01-normalization.md) | Normalization improvements | Complete |
| [spec-02](specs/spec-02-query-optimization.md) | Query optimization | Complete |
| [spec-03](specs/spec-03-delayed-canonical.md) | Delayed canonical selection | Complete |
| [spec-04](specs/spec-04-combined-scoring.md) | Combined scoring system | Complete |
| [spec-05](specs/spec-05-failure-logging.md) | Match failure logging | Complete |

## Implementation Order

### Phase 1: Normalization (spec-01)

**Files:** `scripts/lrclib-extract/src/main.rs`, `scripts/lrclib-extract/Cargo.toml`

1. Add `unicode-normalization = "0.1"` to Cargo.toml
2. Add `TRACK_NUMBER_PREFIX` regex
3. Add `MOJIBAKE_SUFFIX` regex
4. Implement `fold_to_ascii()` function
5. Implement `is_combining_mark()` helper
6. Implement `normalize_punctuation()` function
7. Create `normalize_title_with_artist()` 2-arg function
8. Update `normalize_title()` to use new helpers
9. Add unit tests for normalization
10. Run `cargo test`

### Phase 2: Data Structures (spec-03)

**Files:** `scripts/lrclib-extract/src/main.rs`

1. Add `LrclibGroup` struct
2. Update `ScoredTrack` to remove redundant fields
3. Create type aliases: `LrclibIndex`, `TitleOnlyIndex`
4. Run `cargo test`

### Phase 3: Query Optimization (spec-02)

**Files:** `scripts/lrclib-extract/src/main.rs`

1. Update `read_tracks()` to use optimized JOIN query
2. Create `SpotifyTrackPartial` struct
3. Implement `batch_fetch_primary_artists()` function
4. Update `stream_match_spotify()` for 2-phase approach
5. Implement `load_audio_features_batched()` function
6. Implement `load_album_images_batched()` function
7. Run `cargo test`

### Phase 4: Combined Scoring (spec-04)

**Files:** `scripts/lrclib-extract/src/main.rs`

1. Implement `duration_score()` function
2. Implement `compute_artist_similarity()` function
3. Implement `combined_score()` function with guardrails
4. Add score threshold constants
5. Add unit tests for scoring
6. Run `cargo test`

### Phase 5: Delayed Canonical (spec-03)

**Files:** `scripts/lrclib-extract/src/main.rs`

1. Implement `build_groups_and_index()` function
2. Implement `build_title_only_index()` helper
3. Update `stream_and_match_spotify()` to score all variants
4. Implement `select_canonical_and_enrich()` function
5. Update main flow to use new pipeline
6. Run `cargo test`

### Phase 6: Failure Logging (spec-05)

**Files:** `scripts/lrclib-extract/src/main.rs`, `scripts/lrclib-extract/Cargo.toml`

1. Add `serde = { version = "1.0", features = ["derive"] }` to Cargo.toml
2. Add `serde_json = "1.0"` to Cargo.toml
3. Add `SpotifyCandidate` struct with Serialize
4. Add `FailureReason` enum
5. Add `match_failures` table schema
6. Implement `should_log_failure()` function
7. Implement `log_match_failure()` function
8. Add logging calls during matching
9. Run `cargo test`

### Phase 7: Integration & Validation

1. Build release: `cargo build --release`
2. Run test extraction with `--artists "type o negative"`
3. Verify Type O Negative "Love You to Death" matches
4. Run full extraction and measure:
   - Match rate (target: >= 65%)
   - Runtime (target: ~25-30 min)
   - Peak memory (target: < 3 GB)
5. Query `match_failures` table for insights

## Validation Commands

```bash
# In scripts/lrclib-extract/
cargo test
cargo build --release

# Test extraction
./target/release/lrclib-extract \
    /path/to/lrclib-dump.sqlite3 \
    /tmp/test-output.sqlite3 \
    --spotify /path/to/spotify_clean.sqlite3 \
    --audio-features /path/to/spotify_audio_features.sqlite3 \
    --artists "type o negative" \
    --test "love you to death"

# Validation queries on output
sqlite3 /tmp/test-output.sqlite3 "
SELECT id, title, duration_sec, spotify_id, popularity
FROM tracks
WHERE artist_norm = 'type o negative'
  AND title_norm = 'love you to death';
"

# Check for track number prefixes (should be 0)
sqlite3 /tmp/test-output.sqlite3 "
SELECT COUNT(*) FROM tracks WHERE title_norm GLOB '[0-9]* - *';
"
```

## Success Criteria

- [ ] All tests pass (`cargo test`)
- [ ] Build succeeds (`cargo build --release`)
- [ ] Type O Negative test case matches
- [ ] 0 tracks with track number prefixes in title_norm
- [ ] Match rate >= 65% on full extraction
- [ ] Runtime <= 35 min
- [ ] Peak memory < 3 GB

## Rollback Plan

The existing `main.rs` is preserved. If issues arise:
1. Revert changes to main.rs
2. Run `cargo build --release`
3. Re-extract with previous version
