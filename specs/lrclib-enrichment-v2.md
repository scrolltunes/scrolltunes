# LRCLIB-Spotify Enrichment v2

## Overview

Improve Spotify match rate from 46% to 65-72% through enhanced normalization, delayed canonical selection, and query optimization.

## Current State

- Match rate: 46.4% (1.9M/4.1M tracks)
- Runtime: ~45 min
- Peak memory: ~2 GB
- Location: `scripts/lrclib-extract/`

## Target State

- Match rate: 65-72% globally, 85-95% mainstream catalogs
- Runtime: ~25-30 min
- Peak memory: ~2.5 GB

## Acceptance Criteria

- [ ] `cargo test` passes in `scripts/lrclib-extract/`
- [ ] `cargo build --release` succeeds
- [ ] Type O Negative "Love You to Death" matches after extraction
- [ ] 0 tracks with `title_norm GLOB '[0-9]* - *'` in output
- [ ] Match rate >= 65% on full extraction run
- [ ] No regression in existing functionality

## Tasks

### Phase 1: Normalization Improvements (spec-01)

1. Add track number prefix stripping: `^\d{1,4}\s*[-–—._]\s*`
2. Add artist name prefix stripping (2-arg normalize function)
3. Add Unicode NFKD normalization + diacritic folding
4. Add mojibake suffix cleanup: `[\uFFFD]+$`
5. Add punctuation normalization (curly quotes -> straight)

### Phase 2: Query Optimization (spec-02)

1. Optimize LRCLIB read query (JOIN instead of subquery)
2. Implement 2-phase Spotify streaming (tracks only, then batch artist lookup)
3. Implement batched audio features lookup
4. Implement batched album images lookup

### Phase 3: Delayed Canonical Selection (spec-03)

1. Keep ALL variants per (title_norm, artist_norm) group
2. Stream Spotify and score against all variants
3. Select canonical AFTER matching (best combined score)
4. Fallback to quality-only if no Spotify match

### Phase 4: Combined Scoring System (spec-04)

1. Implement graduated duration scoring (replace ±10s hard cutoff)
2. Add duration guardrails (max 30s or 25% of song)
3. Add artist verification with similarity threshold
4. Bound popularity influence (0-10 points)

### Phase 5: Match Failure Logging (spec-05)

1. Create `match_failures` table schema
2. Implement logging for no-candidate failures
3. Implement logging for all-rejected failures
4. Implement logging for low-confidence matches
5. Add analysis queries

## Dependencies

- `unicode-normalization = "0.1"` crate for NFKD normalization
- Existing: rusqlite, rayon, indicatif, regex, clap, anyhow, rustc-hash

## File Changes

Primary: `scripts/lrclib-extract/src/main.rs`
Config: `scripts/lrclib-extract/Cargo.toml`

## Reference

Full specification: `docs/lrclib-enrichment-v2-spec.md`
