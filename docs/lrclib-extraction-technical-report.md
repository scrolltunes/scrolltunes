# LRCLIB-Spotify Extraction: Technical Report

> Complete documentation of the extraction process, methodology, results, and known limitations

**Date:** January 2026
**Final Match Rate:** 57.5% (2,203,300 / 3,834,157 unique groups)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Data Sources](#data-sources)
3. [Normalization Strategy](#normalization-strategy)
4. [Matching Pipeline](#matching-pipeline)
5. [Results Analysis](#results-analysis)
6. [Known Limitations](#known-limitations)
7. [Impractical Improvements](#impractical-improvements)
8. [Recommendations](#recommendations)

---

## Executive Summary

This extraction process matches LRCLIB lyrics entries to Spotify tracks, enriching the lyrics database with Spotify metadata (popularity, audio features, album artwork). The pipeline achieved a **57.5% match rate**, up from an initial 46.4% baseline.

### Key Metrics

| Metric | Value |
|--------|-------|
| LRCLIB source tracks | 12,203,742 |
| Valid tracks (with lyrics) | 9,980,351 |
| Unique (title, artist) groups | 3,834,157 |
| Spotify matches | 2,203,300 |
| Match rate | 57.5% |
| Unmatched groups | 1,630,857 |
| Output database size | 1.1 GB |
| Extraction time | ~48 minutes |

### Improvement Breakdown

| Optimization | Impact |
|--------------|--------|
| Pre-normalized Spotify index | 4x faster extraction |
| Track number stripping | +1-2% |
| "The" prefix/suffix handling | +0.4% |
| Primary-artist fallback | +2.9% |
| `any_ascii` transliteration | +1.4% |
| Pop=0 fallback (283M tracks) | +4.1% |
| Hebrew/Russian artist aliases | Cross-script matching |

---

## Data Sources

### LRCLIB Database

| Property | Value |
|----------|-------|
| File | `lrclib-db-dump-20251209T092057Z.sqlite3` |
| Size | 77 GB |
| Total tracks | 12,203,742 |
| Valid tracks | 9,980,351 (81.8%) |

**Excluded tracks:**
- No synced lyrics (`synced_lyrics IS NULL`)
- Empty titles or artists
- Duration ≤ 0

### Spotify Databases

| File | Size | Purpose |
|------|------|---------|
| `spotify_clean.sqlite3` | 125 GB | Main catalog (64M track-artists) |
| `spotify_normalized.sqlite3` | 5 GB | Pre-normalized index (54M keys) |
| `spotify_clean_audio_features.sqlite3` | 41 GB | BPM, key, mode, time signature |
| `spotify_clean_track_files.sqlite3` | ~146 GB | Language, version info (unused) |

### Normalized Index Structure

```sql
CREATE TABLE normalized_artists (
    artist_norm TEXT NOT NULL,
    track_id TEXT NOT NULL,
    popularity INTEGER NOT NULL,
    PRIMARY KEY (artist_norm, track_id)
);

CREATE TABLE normalized_titles (
    title_norm TEXT NOT NULL,
    track_id TEXT NOT NULL,
    PRIMARY KEY (title_norm, track_id)
);
```

---

## Normalization Strategy

### Title Normalization

```
Input:  "03 - Love You To Death (2011 Remaster) [Mono]"
Output: "love you to death"
```

**Patterns stripped (in order):**

1. **Track numbers:** `^\d{1,4}\s*[-–—._]\s*` (e.g., "01 - ", "03. ")
2. **Bracketed suffixes:** `\[[^\]]+\]$` (e.g., "[Mono]", "[Live]")
3. **Remaster tags:** `\(.*remaster.*\)`, `- remastered.*$`
4. **Feature tags:** `\(feat\..*\)`, `\(ft\..*\)`
5. **Live/version tags:** `\(live.*\)`, `\(acoustic.*\)`
6. **Year suffixes:** `\(\d{4}\)$`
7. **File extensions:** `\.mp3$`, `\.flac$`, `\.wav$`
8. **URL suffixes:** `\.com$`, `\.net$`, `\.org$`

### Artist Normalization

```
Input:  "The Beatles feat. Billy Preston"
Output: "beatles"
```

**Rules applied:**

1. Strip "The " prefix and ", The" suffix
2. Strip feat./ft./featuring and everything after
3. Strip separators: `&`, `/`, `,`, `;` (take first segment)
4. Apply Unicode NFKD decomposition
5. Apply `any_ascii` transliteration
6. Lowercase and trim

### Transliteration Pipeline

```rust
fn fold_to_ascii(s: &str) -> String {
    let stripped: String = s.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect();
    any_ascii(&stripped).to_lowercase()
}
```

**Examples:**
- "Кино" → "kino" (Cyrillic)
- "Björk" → "bjork" (Nordic)
- "Motörhead" → "motorhead" (Umlaut)
- "אייל גולן" → "'yyl gvln" (Hebrew - problematic, see limitations)

### Artist Alias Dictionary

~205 hand-crafted mappings for artists where transliteration fails:

**Russian (~90 entries):**
```rust
("кино", "kino"),
("ддт", "ddt"),
("молчат дома", "molchat doma"),
("сплин", "splin"),
("ленинград", "leningrad"),
```

**Hebrew (~115 entries):**
```rust
("אייל גולן", "eyal golan"),
("הדג נחש", "hadag nahash"),
("עומר אדם", "omer adam"),
("שלמה ארצי", "shlomo artzi"),
```

**Lookup order:**
1. Check original (pre-fold) against dictionary → catches Hebrew/Cyrillic keys
2. Apply `fold_to_ascii()`
3. Check folded result against dictionary → catches Cyrillic that folds to known keys

---

## Matching Pipeline

### Phase 1: Indexed Lookup (53.4%)

```
For each LRCLIB group (title_norm, artist_norm):
  1. Query normalized_artists WHERE artist_norm = ?
  2. Query normalized_titles WHERE title_norm = ?
  3. Intersect track_ids → candidates
  4. Filter by duration (±30 seconds)
  5. Score and rank candidates
```

**Result:** 2,434,018 matches (63.5% of groups)

### Phase 2: Primary-Artist Fallback (+6.5%)

When no candidates found, extract first artist from multi-artist strings:
- "Mustard, Migos" → try "mustard" alone
- "Duck Sauce, A-Trak & Armand Van Helden" → try "duck sauce" alone

**Result:** +250,287 matches via fallback

### Phase 3: Pop=0 Fallback (+4.1%)

For remaining unmatched groups, stream through 283M low-popularity tracks:

```sql
SELECT ta.track_id, ta.artist_name, t.name as title, t.duration_ms
FROM track_artists ta
JOIN tracks t ON ta.track_id = t.id
WHERE t.popularity = 0
```

**Result:** +156,957 matches from pop=0 tracks

### Phase 4: Canonical Selection

Score each candidate and select best match per group:

```
score = duration_score (0-100, graduated by diff)
      + artist_match (0-50)
      + lrclib_quality (-50 to +80)
      + clean_title_bonus (0 or +30)
      + spotify_popularity (0-10)
```

**Duration scoring:**
| Difference | Score |
|------------|-------|
| 0-2s | 100 |
| 3-5s | 80 |
| 6-10s | 50 |
| 11-15s | 25 |
| 16-30s | 10 |
| >30s | Reject |

**Final result:** 2,203,300 canonical matches (57.5%)

---

## Results Analysis

### Match Distribution by Category

| Category | Count | % of Matches |
|----------|-------|--------------|
| Exact artist match | ~1.95M | 88.5% |
| Primary-artist fallback | ~250K | 11.4% |
| Pop=0 fallback | ~157K | 7.1% |

*Note: Categories overlap; pop=0 matches may use primary-artist fallback*

### Failure Distribution

| Reason | Count | % |
|--------|-------|---|
| `no_candidates` | ~850K | 74% |
| `all_rejected` | ~300K | 26% |

**`no_candidates`:** No Spotify track found with matching (title_norm, artist_norm)
**`all_rejected`:** Candidates found but all failed duration filter (>30s diff)

### Quality Analysis of Unmatched

High-quality unmatched entries (LRCLIB quality ≥ 50):

| Pattern | Example | Approximate Count |
|---------|---------|-------------------|
| Regional/indie artists | Kumar Sanu, various Bollywood | ~200K |
| Typos in metadata | "Everythig But The Girl" | ~50K |
| Unstripped metadata | "Song (writing session, 2008)" | ~30K |
| Script mismatches | Japanese/Chinese/Korean | ~100K |
| Spotify gaps | Classical, obscure releases | ~150K |

---

## Known Limitations

### 1. Hebrew Transliteration Failure

**Problem:** Hebrew script lacks vowels in written form. `any_ascii` produces consonant-only output that cannot match Latin transliterations.

```
"אברהם" → any_ascii → "'vrhm"
Expected match: "avraham" or "abraham"
```

**Mitigation:** Hand-crafted dictionary for ~115 top Hebrew artists.

**Gap:** ~15,000 LRCLIB tracks with Hebrew text remain unmatched beyond dictionary coverage.

### 2. CJK Script Complexity

**Problem:** Chinese, Japanese, and Korean scripts have complex romanization rules:
- Chinese: Multiple romanization systems (Pinyin, Wade-Giles)
- Japanese: Kanji can have multiple readings (kun'yomi vs on'yomi)
- Korean: Revised Romanization vs McCune-Reischauer

**Example:**
```
"東京事変" (Tokyo Jihen) - romanization varies by system
```

**Mitigation:** None implemented. Relies on Spotify storing Latin aliases.

**Gap:** ~100K CJK entries in LRCLIB, estimated 30-40% could match with proper romanization.

### 3. Duration Mismatch Edge Cases

**Problem:** Same song can have legitimately different durations:
- Radio edit vs album version
- Fadeout differences
- Regional versions

**Current:** 30-second threshold rejects valid matches.

**Example:** "Bohemian Rhapsody" has versions ranging from 5:54 to 6:07.

**Gap:** ~50K potential matches lost to strict duration filtering.

### 4. Multi-Artist Attribution

**Problem:** LRCLIB and Spotify may credit artists differently:
- LRCLIB: "Elton John & Dua Lipa"
- Spotify: "Elton John, Dua Lipa" (separate artist entries)

**Mitigation:** Primary-artist fallback helps but misses cases where secondary artist is the lookup key.

**Gap:** ~30K entries with reversed or reordered artist credits.

### 5. Spelling Variants and Typos

**Problem:** No fuzzy matching implemented.

**Examples:**
```
LRCLIB: "Everythig But The Girl" (typo)
Spotify: "Everything but the Girl"

LRCLIB: "Guns 'n' Roses"
Spotify: "Guns N' Roses"
```

**Gap:** ~50K entries with minor spelling differences.

### 6. Metadata in Titles

**Problem:** Some title patterns not stripped by normalization.

**Examples:**
```
"Love Song (writing session, Abbey Road, 2008)"
"Track Name - From 'Album Name'"
"Song Title [Explicit]" where [Explicit] is part of actual title
```

**Gap:** ~30K entries with unusual metadata formats.

---

## Impractical Improvements

### 1. Fuzzy String Matching

**Why impractical:**
- Levenshtein distance over 3.8M × 54M comparisons = quadratic complexity
- Even with indexing (BK-trees, SimHash), false positive rate unacceptable
- Would need human review for borderline cases

**Estimated effort:** Months of engineering, ongoing curation
**Estimated gain:** +2-3%

### 2. ICU Transliteration for Hebrew

**Why impractical:**
- `rust_icu` requires system ICU library installation
- `ICU4X` transliteration is experimental (non-stable API)
- Hebrew transliteration is inherently ambiguous (vowels reconstructed from context)
- Would require language model for disambiguation

**Estimated effort:** Weeks of integration + ongoing maintenance
**Estimated gain:** +0.5-1% (limited Hebrew content in LRCLIB)

### 3. CJK Romanization

**Why impractical:**
- Each language needs separate romanization system
- Japanese requires dictionary-based kanji reading selection
- Chinese requires tone handling and dialect awareness
- Would need native speaker validation

**Estimated effort:** Months per language
**Estimated gain:** +1-2% per language

### 4. Machine Learning Matching

**Why impractical:**
- Requires labeled training data (expensive to create)
- Model would need continuous retraining as catalogs change
- Inference at scale (millions of comparisons) requires infrastructure
- Edge cases require human judgment

**Estimated effort:** 6+ months, ongoing maintenance
**Estimated gain:** +5-10% (speculative)

### 5. Spotify API Enrichment

**Why impractical:**
- Rate limits: 180 requests/minute
- 1.6M unmatched entries = 148 hours of API calls
- No batch search endpoint
- TOS concerns for bulk data extraction

**Estimated effort:** Infrastructure + weeks of runtime
**Estimated gain:** +3-5% (would find some missing tracks)

### 6. Manual Curation

**Why impractical:**
- 1.6M unmatched entries
- At 30 seconds per entry = 13,333 hours = 6+ person-years
- Would become stale as catalogs update

**Estimated effort:** Ongoing person-years
**Estimated gain:** +10-20% (diminishing returns)

---

## Recommendations

### Short-Term (Achievable)

1. **Expand artist alias dictionary** - Add more Hebrew/Russian/Arabic artists as encountered
2. **Loosen duration threshold for exact matches** - Allow 45s for perfect title+artist
3. **Add more title normalization patterns** - Handle emerging metadata formats

### Medium-Term (Moderate Effort)

1. **Build language-specific indexes** - Pre-filter by detected script for faster matching
2. **Implement phonetic indexing** - Soundex/Metaphone for English typo tolerance
3. **Add ISRC-based matching** - Where available in LRCLIB metadata

### Long-Term (Significant Investment)

1. **Community contribution system** - Allow users to submit/validate matches
2. **Incremental updates** - Process only new LRCLIB entries instead of full rebuilds
3. **Alternative data sources** - MusicBrainz, Discogs for additional metadata

---

## Appendix: Output Schema

```sql
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_sec INTEGER NOT NULL,
    title_norm TEXT NOT NULL,
    artist_norm TEXT NOT NULL,
    quality INTEGER NOT NULL,
    spotify_id TEXT,
    popularity INTEGER,
    tempo REAL,
    musical_key INTEGER,
    mode INTEGER,
    time_signature INTEGER,
    isrc TEXT,
    album_image_url TEXT
);

CREATE TABLE match_failures (
    id INTEGER PRIMARY KEY,
    lrclib_id INTEGER NOT NULL,
    lrclib_title TEXT NOT NULL,
    lrclib_artist TEXT NOT NULL,
    lrclib_title_norm TEXT NOT NULL,
    lrclib_artist_norm TEXT NOT NULL,
    lrclib_quality INTEGER NOT NULL,
    failure_reason TEXT NOT NULL,
    spotify_candidates TEXT
);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title, artist,
    content='tracks',
    content_rowid='id',
    tokenize='porter'
);
```

---

## Appendix: Commands Reference

### Build
```bash
cd /Users/hmemcpy/git/scrolltunes/scripts/lrclib-extract
cargo build --release
```

### Pre-normalize Spotify
```bash
./target/release/normalize-spotify \
  /path/to/spotify_clean.sqlite3 \
  /path/to/spotify_normalized.sqlite3
```

### Run Extraction
```bash
./target/release/lrclib-extract \
  /path/to/lrclib-db-dump-*.sqlite3 \
  /path/to/output.sqlite3 \
  --spotify /path/to/spotify_clean.sqlite3 \
  --spotify-normalized /path/to/spotify_normalized.sqlite3 \
  --audio-features /path/to/spotify_clean_audio_features.sqlite3
```

### Analyze Failures
```sql
-- Failure distribution
SELECT failure_reason, COUNT(*) FROM match_failures GROUP BY 1;

-- High-quality unmatched
SELECT lrclib_title, lrclib_artist, lrclib_quality
FROM match_failures
WHERE failure_reason = 'no_candidates' AND lrclib_quality >= 50
ORDER BY lrclib_quality DESC LIMIT 100;
```
