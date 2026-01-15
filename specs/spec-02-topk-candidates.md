# Spec 02: Top-K Candidates Index

> Store multiple candidates per (title, artist) key instead of single highest-popularity

## Problem Statement

Current `spotify_normalized.sqlite3` deduplicates to one rowid per `(title_norm, artist_norm)` key, selecting the highest popularity track. This causes `all_rejected` failures when:

1. The highest-popularity version has wrong duration (radio edit vs album)
2. The highest-popularity version is a different recording (live vs studio)
3. Multiple valid versions exist with different durations

**Example:** "Bohemian Rhapsody" exists in Spotify with durations ranging from 5:54 to 6:07. If LRCLIB has 6:07 but we indexed 5:54, the match is rejected.

## Requirements

### R2.1: New Schema

Replace current schema with multi-candidate storage:

```sql
-- OLD (remove)
CREATE TABLE normalized_artists (
    artist_norm TEXT NOT NULL,
    track_id TEXT NOT NULL,
    popularity INTEGER NOT NULL,
    PRIMARY KEY (artist_norm, track_id)
);

-- NEW
CREATE TABLE track_norm (
    title_norm   TEXT NOT NULL,
    artist_norm  TEXT NOT NULL,
    track_rowid  INTEGER NOT NULL,
    popularity   INTEGER NOT NULL,
    duration_ms  INTEGER NOT NULL,
    album_rowid  INTEGER,
    PRIMARY KEY (title_norm, artist_norm, track_rowid)
);

CREATE INDEX idx_track_norm_key ON track_norm(title_norm, artist_norm);
CREATE INDEX idx_track_norm_title ON track_norm(title_norm);
CREATE INDEX idx_track_norm_artist ON track_norm(artist_norm);
```

### R2.2: Candidate Retrieval

Replace single-candidate lookup:

```rust
// OLD
let track_id = stmt.query_row(
    &[&title_norm, &artist_norm],
    |row| row.get(0)
)?;

// NEW
let candidates: Vec<Candidate> = stmt.query_map(
    &[&title_norm, &artist_norm],
    |row| Ok(Candidate {
        track_rowid: row.get(0)?,
        popularity: row.get(1)?,
        duration_ms: row.get(2)?,
    })
)?.take(K).collect();  // K = 10-20
```

### R2.3: Scoring All Candidates

For each LRCLIB group:
1. Fetch up to K candidates per (title_norm, artist_norm) key
2. Score all candidates using existing scoring function
3. Select best candidate (highest score)
4. Track runner-up score for confidence margin

### R2.4: Deduplication Strategy

When building the index, include all tracks with popularity >= 0, but:
- Deduplicate by `(title_norm, artist_norm, duration_bucket)` where bucket = round(duration_ms / 5000)
- Keep highest popularity per bucket
- This limits variants while preserving duration diversity

## Implementation Notes

### normalize-spotify.rs Changes

```rust
// Build phase: collect all candidates
let mut candidates: HashMap<(String, String), Vec<CandidateRow>> = HashMap::new();

for row in track_artists_iter {
    let key = (title_norm.clone(), artist_norm.clone());
    candidates.entry(key).or_default().push(CandidateRow {
        track_rowid: row.track_rowid,
        popularity: row.popularity,
        duration_ms: row.duration_ms,
        album_rowid: row.album_rowid,
    });
}

// Dedupe by duration bucket, keep top by popularity
for (key, mut cands) in candidates {
    cands.sort_by(|a, b| b.popularity.cmp(&a.popularity));
    let mut seen_buckets = HashSet::new();
    for cand in cands {
        let bucket = cand.duration_ms / 5000;
        if seen_buckets.insert(bucket) {
            insert_candidate(&key, &cand);
        }
    }
}
```

### main.rs Changes

```rust
// Lookup phase
fn find_candidates(title_norm: &str, artist_norm: &str) -> Vec<Candidate> {
    let sql = r#"
        SELECT track_rowid, popularity, duration_ms, album_rowid
        FROM track_norm
        WHERE title_norm = ? AND artist_norm = ?
        ORDER BY popularity DESC
        LIMIT ?
    "#;
    // ... execute and collect
}

// Scoring phase
fn select_best_candidate(group: &Group, candidates: Vec<Candidate>) -> Option<Match> {
    let scored: Vec<_> = candidates
        .iter()
        .map(|c| (c, score_candidate(group, c)))
        .filter(|(_, score)| *score > THRESHOLD)
        .collect();

    scored.into_iter()
        .max_by_key(|(_, score)| *score)
        .map(|(c, score)| Match { candidate: c.clone(), score })
}
```

### Index Size Estimation

| Metric | Old | New (estimated) |
|--------|-----|-----------------|
| Rows | 54M | 150-200M |
| Size | 5 GB | 12-15 GB |
| Lookup time | ~same | ~same (indexed) |

## Acceptance Criteria

- [ ] New schema implemented in `normalize-spotify.rs`
- [ ] Index contains multiple candidates per key (up to K per duration bucket)
- [ ] `lrclib-extract` fetches and scores all candidates
- [ ] Match rate improves (target: +2-4%)
- [ ] `all_rejected` failures decrease
- [ ] Lookup performance remains acceptable (<100ms per group)

## Dependencies

- Spec 01: Normalization Unification (shared module)

## Estimated Impact

- **+2-4% match rate** from finding correct duration variants
- Significant reduction in `all_rejected` failures
