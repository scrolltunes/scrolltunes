# LRCLIB-Spotify Enrichment v3: Implementation Plan

> Improving match rate from 57.5% toward 65-72%

**Generated:** January 2026
**Target:** 65-72% match rate, <60 min extraction time
**Source:** [Data Scientist Recommendations](/Users/hmemcpy/Downloads/lrclib_spotify_enrichment_recommendations.md)

---

## Overview

This plan implements recommendations from the senior data scientist's analysis to improve the LRCLIB-Spotify matching pipeline. Changes are ordered by dependency and expected impact.

## Current Baseline

| Metric | Value |
|--------|-------|
| Match rate | 57.5% |
| Unique groups | 3,834,157 |
| Spotify matches | 2,203,300 |
| Extraction time | ~48 min |

## Specs

| Spec | Description | Est. Impact |
|------|-------------|-------------|
| [spec-01](specs/spec-01-normalization.md) | Single-source normalization | Foundation |
| [spec-02](specs/spec-02-topk-candidates.md) | Top-K candidates per key | +2-4% |
| [spec-03](specs/spec-03-multi-artist.md) | Multi-artist scoring | +1-2% |
| [spec-04](specs/spec-04-pop0-fallback.md) | Pop=0 fallback fix | +0.5-1% |
| [spec-05](specs/spec-05-adaptive-duration.md) | Adaptive duration tolerance | +1-2% |
| [spec-06](specs/spec-06-title-rescue.md) | Title-first rescue pass | +2-4% |
| [spec-07](specs/spec-07-instrumentation.md) | Instrumentation & evaluation | Measurement |

## Implementation Phases

### Phase 1: Foundation (Required First)

| # | Task | Spec | Status |
|---|------|------|--------|
| 1.1 | Extract normalization to shared module | spec-01 | [x] |
| 1.2 | Add golden tests for normalization | spec-01 | [x] |
| 1.3 | Add instrumentation framework | spec-07 | [x] |
| 1.4 | Verify both binaries use shared module | spec-01 | [x] |

**Checkpoint:** Rebuild normalized index, verify identical output to current.

### Phase 2: Quick Wins

| # | Task | Spec | Status |
|---|------|------|--------|
| 2.1 | Fix pop=0 fallback condition | spec-04 | [x] |
| 2.2 | Implement adaptive duration tolerance | spec-05 | [ ] |
| 2.3 | Add multi-artist verification | spec-03 | [ ] |

**Checkpoint:** Run extraction, measure impact of each change.

### Phase 3: High-Value Changes

| # | Task | Spec | Status |
|---|------|------|--------|
| 3.1 | Implement top-K candidates schema | spec-02 | [ ] |
| 3.2 | Update normalize-spotify for new schema | spec-02 | [ ] |
| 3.3 | Update lrclib-extract for multi-candidate scoring | spec-02 | [ ] |
| 3.4 | Rebuild normalized index | spec-02 | [ ] |
| 3.5 | Implement title-first rescue pass | spec-06 | [ ] |

**Checkpoint:** Full extraction run, validate against audit sample.

---

## Expected Outcomes

| Phase | Cumulative Match Rate |
|-------|----------------------|
| Baseline | 57.5% |
| After Phase 2 | 60-62% |
| After Phase 3 | 65-68% |

## Commands Reference

```bash
# Build
cd /Users/hmemcpy/git/scrolltunes/scripts/lrclib-extract
cargo build --release

# Run tests
cargo test

# Rebuild normalized index
./target/release/normalize-spotify \
  /Users/hmemcpy/git/music/spotify_clean.sqlite3 \
  /Users/hmemcpy/git/music/spotify_normalized.sqlite3

# Run extraction with stats
./target/release/lrclib-extract \
  /Users/hmemcpy/git/music/lrclib-db-dump-20251209T092057Z.sqlite3 \
  /Users/hmemcpy/git/music/lrclib-enriched.sqlite3 \
  --spotify /Users/hmemcpy/git/music/spotify_clean.sqlite3 \
  --spotify-normalized /Users/hmemcpy/git/music/spotify_normalized.sqlite3 \
  --audio-features /Users/hmemcpy/git/music/spotify_clean_audio_features.sqlite3 \
  --export-stats /tmp/extraction_stats.json
```

## Success Criteria

- [ ] All tests pass (`cargo test`)
- [ ] Match rate >= 65%
- [ ] Runtime <= 60 min
- [ ] Audit sample precision >= 95%
