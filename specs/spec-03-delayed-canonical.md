# Spec 03: Delayed Canonical Selection

## Overview

Select canonical track AFTER Spotify matching instead of before. This allows matching against all LRCLIB variants for a song, improving match rate.

## Problem

Current flow:
1. Group LRCLIB tracks by (title_norm, artist_norm)
2. Select ONE canonical per group (quality-based)
3. Match canonical against Spotify

This fails when the "best quality" LRCLIB entry has wrong duration but another variant has correct duration.

Example: "Love You to Death" by Type O Negative
- Entry 22573993: Clean title, 414s (15s off from Spotify's 429s) - selected as canonical
- Entry 16913662: "03 - Love You to Death", 429s (matches Spotify) - discarded

## Solution

New flow:
1. Group LRCLIB tracks by (title_norm, artist_norm)
2. Keep ALL variants per group
3. Stream Spotify, score against ALL variants
4. Select canonical = variant with best combined score
5. Fallback: if no Spotify match, use quality-only selection

## Changes Required

### 1. Update Data Structures

```rust
/// Group of LRCLIB tracks sharing (title_norm, artist_norm)
struct LrclibGroup {
    key: (String, String),  // (title_norm, artist_norm) stored ONCE
    tracks: Vec<ScoredTrack>,
    best_match: Option<(usize, SpotifyTrack, i32)>,  // (track_idx, spotify, score)
}

/// Scored track without redundant normalized strings
struct ScoredTrack {
    track: Track,
    quality: i32,  // LRCLIB-only quality score
    // NOTE: title_norm and artist_norm NOT stored here (in group key)
}
```

### 2. Build Groups with All Variants

```rust
fn build_groups_and_index(tracks: Vec<Track>) -> Result<(Vec<LrclibGroup>, LrclibIndex)> {
    let mut temp_groups: FxHashMap<(String, String), Vec<ScoredTrack>> = FxHashMap::default();

    for track in tracks {
        let title_norm = normalize_title_with_artist(&track.title, &track.artist);
        let artist_norm = normalize_artist(&track.artist);
        let quality = compute_quality_score(&track, None);

        let scored = ScoredTrack { track, quality };
        temp_groups.entry((title_norm, artist_norm)).or_default().push(scored);
    }

    let mut groups: Vec<LrclibGroup> = Vec::with_capacity(temp_groups.len());
    let mut index: LrclibIndex = FxHashMap::default();

    for (key, tracks) in temp_groups {
        let group_idx = groups.len();
        index.insert(key.clone(), group_idx);
        groups.push(LrclibGroup {
            key,
            tracks,
            best_match: None,
        });
    }

    Ok((groups, index))
}
```

### 3. Update Spotify Matching

```rust
fn stream_and_match_spotify(
    conn: &Connection,
    min_popularity: i32,
    groups: &mut [LrclibGroup],
    index: &LrclibIndex,
) -> Result<()> {
    // For each Spotify track:
    for spotify in stream_spotify_tracks(conn, min_popularity)? {
        let title_norm = normalize_title(&spotify.name);
        let artist_norm = normalize_artist(&spotify.artist);

        if let Some(&group_idx) = index.get(&(title_norm, artist_norm)) {
            let group = &mut groups[group_idx];

            // Score against ALL variants
            for (track_idx, lrclib) in group.tracks.iter().enumerate() {
                let score = combined_score(&lrclib.track, lrclib.quality, &spotify, &group.key.1);

                if score > group.best_match.as_ref().map(|(_, _, s)| *s).unwrap_or(i32::MIN) {
                    group.best_match = Some((track_idx, spotify.clone(), score));
                }
            }
        }
    }
}
```

### 4. Select Final Canonical

```rust
fn select_canonical_and_enrich(
    groups: Vec<LrclibGroup>,
    audio_lookup: &FxHashMap<String, AudioFeatures>,
    image_lookup: &FxHashMap<i64, String>,
) -> Vec<EnrichedTrack> {
    groups.into_iter().map(|group| {
        match group.best_match {
            Some((track_idx, spotify, _score)) => {
                // Use variant that matched Spotify
                let lrclib = &group.tracks[track_idx];
                enrich_with_spotify(lrclib, &group.key, &spotify, audio_lookup, image_lookup)
            }
            None => {
                // Fallback: best quality variant
                let best = group.tracks.iter().max_by_key(|t| t.quality).unwrap();
                enrich_without_spotify(best, &group.key)
            }
        }
    }).collect()
}
```

## Memory Optimization

By storing `(title_norm, artist_norm)` ONCE in `LrclibGroup.key` instead of per-track:
- 12.3M tracks × ~24 bytes saved = ~295 MB reduction
- Peak memory stays under 2.5 GB target

## Index Structure

```rust
// Title-only index for initial filtering (before artist lookup)
type TitleOnlyIndex = FxHashMap<String, Vec<usize>>;

// Full index for exact matching
type LrclibIndex = FxHashMap<(String, String), usize>;
```

## Validation

```sql
-- After extraction, verify Type O Negative case is fixed
SELECT id, title, title_norm, duration_sec, spotify_id, popularity
FROM tracks
WHERE artist_norm = 'type o negative'
  AND title_norm = 'love you to death';
-- Should show spotify_id = '58RDwkonFMOkoytBtIQetc', popularity = 64
```

## Done When

- [ ] All variants kept per group (not just best quality)
- [ ] Spotify matching scores all variants
- [ ] Canonical selected after matching
- [ ] Type O Negative test case passes
- [ ] No regression in overall match rate
