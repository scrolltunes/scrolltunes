# LRCLIB-Spotify Enrichment v2 Specification

> Improving Spotify match rate through normalization, transliteration, and language-aware matching

**Last Updated:** January 2026
**Status:** Implemented (57.5% match rate achieved)

---

## Current Results

| Metric | Baseline | Current | Target |
|--------|----------|---------|--------|
| Match rate | 46.4% | **57.5%** | 65-72% |
| Unique groups | 4.1M | 3.84M | — |
| Extraction time | 45 min | **48 min** | 25-30 min |
| Output size | — | 1.1 GB | — |

### Improvements Implemented

| Change | Impact |
|--------|--------|
| Pre-normalized Spotify index | 4x faster extraction |
| Track number stripping | +1-2% |
| "The" prefix/suffix handling | +0.4% |
| Primary-artist fallback | +2.9% |
| `any_ascii` transliteration | +1.4% |
| Pop=0 fallback | +4.1% (~157K matches) |
| Hebrew/Russian artist aliases | ~150 hand-crafted mappings (cleaned) |
| Batched INSERTs | 10x faster writes |
| normalize-spotify optimization | 6x faster (90 min → 15 min) |

---

## Architecture

### Processing Pipeline

```
normalize-spotify (one-time, ~15 min)
    └─ Creates spotify_normalized.sqlite3 (54M keys, 56M rows)

lrclib-extract (~48 min)
    ├─ Read LRCLIB (12.2M → 10M valid tracks)
    ├─ Group by (title_norm, artist_norm) → 3.8M groups
    ├─ Match via indexed lookup + primary-artist fallback → 2.4M matches (53%)
    ├─ Pop=0 fallback for unmatched (283M tracks) → +157K matches
    ├─ Score and select canonical → 2.2M Spotify matches (57.5%)
    ├─ Batch-load audio features + album images
    └─ Write tracks + FTS index + failure logs
```

### Database Files

| File | Size | Purpose |
|------|------|---------|
| `lrclib-db-dump-*.sqlite3` | 77 GB | Source lyrics (12.2M tracks) |
| `spotify_clean.sqlite3` | 125 GB | Spotify catalog (64M track-artists) |
| `spotify_normalized.sqlite3` | 10 GB | Pre-normalized index (54M keys, 56M rows) |
| `spotify_clean_audio_features.sqlite3` | 41 GB | BPM, key, mode, time signature |
| `spotify_clean_track_files.sqlite3` | ~146 GB* | Language, original_title, versions |

*43 GB compressed, ~146 GB decompressed (estimated from 3.4x ratio)

---

## Normalization Rules

### Title Normalization

```
Input: "03 - Love You To Death (2011 Remaster) [Mono]"
Output: "love you to death"
```

**Patterns stripped:**
- Track numbers: `^\d{1,4}\s*[-–—._]\s*`
- Brackets: `\[[^\]]+\]$`, `\(remaster.*\)`, `\(feat\..*\)`
- Suffixes: `- remastered`, `(live)`, `[mono]`
- File extensions: `.mp3`, `.flac`
- Year suffixes: `(1964)`, `(2009)`
- URL suffixes: `.com`, `.net`

### Artist Normalization

```
Input: "The Beatles feat. Billy Preston"
Output: "beatles"
```

**Rules:**
- Strip "The " prefix and ", The" suffix
- Strip feat./ft./featuring and everything after
- Strip separators: `&`, `/`, `,`, `;`
- Apply `any_ascii` transliteration (Cyrillic → Latin)

### Primary-Artist Fallback

When exact match fails, extract first artist from multi-artist strings:
- "Mustard, Migos" → "mustard"
- "Duck Sauce, A-Trak & Armand Van Helden" → "duck sauce"

**Impact:** +2.9% match rate (~113K additional matches)

---

## Multilingual Support

### any_ascii Transliteration

```rust
fn fold_to_ascii(s: &str) -> String {
    let stripped: String = s.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect();
    any_ascii(&stripped).to_lowercase()
}
```

**Examples:**
- "Кино" → "kino"
- "Борис Николаевич Ельцин" → "boris nikolaevich el'tsin"
- "אברהם" → "'vrhm" (vowel-less, needs fallback)

### LRCLIB Non-Latin Content

| Script | Total Tracks | In Titles | In Artists |
|--------|-------------|-----------|------------|
| Cyrillic | 217,077 | 207,242 | 126,204 |
| Hebrew | 15,364 | 15,038 | 6,460 |

**Key insight:** Spotify stores most international artists in Latin script already (e.g., "Kino" not "Кино"). The `any_ascii` improvement is modest (+1.4%) because it mainly merges LRCLIB Cyrillic entries with existing Latin matches.

### Hand-Crafted Artist Mappings

~205 popular Russian/Hebrew artists with known transliterations:

| Language | Count | Coverage |
|----------|-------|----------|
| Russian | ~90 | Top rock bands, solo artists, pop artists |
| Hebrew | ~115 | Top LRCLIB artists by track count |

**Key artists:**
```rust
// Russian
ARTIST_TRANSLITERATIONS.insert("ддт", "ddt");
ARTIST_TRANSLITERATIONS.insert("кино", "kino");
ARTIST_TRANSLITERATIONS.insert("молчат дома", "molchat doma");

// Hebrew
ARTIST_TRANSLITERATIONS.insert("אייל גולן", "eyal golan");
ARTIST_TRANSLITERATIONS.insert("הדג נחש", "hadag nahash");
ARTIST_TRANSLITERATIONS.insert("עומר אדם", "omer adam");
```

**Why needed:** Hebrew lacks vowels in writing, so `any_ascii` produces consonant-only output (e.g., "אברהם" → "'vrhm") that won't match Latin transliterations ("Avraham"). The dictionary maps Hebrew artist names directly to their Spotify Latin equivalents.

**Lookup order:**
1. Check original (pre-fold) against dictionary (catches Hebrew/Cyrillic keys)
2. Apply `fold_to_ascii()`
3. Check folded result against dictionary (catches Cyrillic that folds to known keys)

---

## Match Failure Analysis

### Failure Distribution

| Reason | Count | % |
|--------|-------|---|
| `no_candidates` | ~1M | 74% |
| `all_rejected` | ~270K | 26% |

### Common Failure Patterns

| Pattern | Example | Fix |
|---------|---------|-----|
| Artist typos | "Everythig But The Girl" | Fuzzy matching (future) |
| Unstripped metadata | "Song (writing session, 2008)" | More patterns |
| Popularity 0 | Kumar Sanu tracks | Lower threshold or allow for exact matches |
| Script mismatch | Cyrillic vs Latin | `any_ascii` (implemented) |

### Sample Failures Investigated

1. **"Boxing And Pop Music"** - Artist typo ("Everythig" vs "Everything")
2. **"Sing It Out (writing session...)"** - Metadata not stripped
3. **"Kisi Ki Galli Mein"** - Exists in Spotify but popularity=0 (filtered)

---

## Scoring System

### Combined Score Formula

```
score = duration_score (0-100, graduated by diff)
      + artist_match (0-50)
      + lrclib_quality (-50 to +80)
      + clean_title_bonus (0 or +30)
      + spotify_popularity (0-10)
```

### Duration Scoring

| Difference | Score |
|------------|-------|
| 0-2s | 100 |
| 3-5s | 80 |
| 6-10s | 50 |
| 11-15s | 25 |
| 16-30s | 10 |
| >30s | Reject |

### Quality Factors

- **Album type:** Studio (+40) > Remaster (+25) > Compilation (+5) > Live (-20)
- **Garbage patterns:** Track numbers, artist-in-title (-40 to -50)
- **Duration proximity:** Closer to group median = higher score

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

**Mitigation:** None implemented. Relies on Spotify storing Latin aliases.

**Gap:** ~100K CJK entries in LRCLIB, estimated 30-40% could match with proper romanization.

### 3. Duration Mismatch Edge Cases

**Problem:** Same song can have legitimately different durations:
- Radio edit vs album version
- Fadeout differences
- Regional versions

**Current:** 30-second threshold rejects valid matches.

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

**Examples (Beatles failures):**
```
Original Title             | Normalized (Problem)
16 Eleanor Rigby           | 16 eleanor rigby (track# not stripped)
I call your name (1964)    | i call your name (1964) (year not stripped)
We Can Work It Out [RM1]   | we can work it out [rm1] (bracket not stripped)
She s Leaving Home         | she s leaving home (apostrophe issue)
Can?t Buy Me Love          | can?t buy me love (encoding issue)
Ask Me Why.flac            | ask me why.flac (extension not stripped)
```

**Gap:** ~30K entries with unusual metadata formats.

---

## Impractical Improvements

These improvements were evaluated and deemed not worth pursuing given effort vs impact.

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
**Estimated gain:** +3-5%

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

## Next Steps: Track Files Integration

### Source: `spotify_clean_track_files.sqlite3`

> **Note:** Schema from documentation. Must verify when file available.

### Key Fields

| Field | Use Case |
|-------|----------|
| `language_of_performance` | Language-aware fallback matching |
| `original_title` | Pre-cleaned title (no feat.) |
| `version_title` | Identify remasters/remixes |
| `sha256_original` | Detect byte-identical duplicates |
| `alternatives` | ISRC-equivalent track IDs |
| `artist_roles` | Distinguish main vs featured |

### Integration Plan

**Phase 1: Language-Aware Fallback**
- Build index of non-English tracks by language
- For unmatched Cyrillic/Hebrew LRCLIB entries, search by language + transliterated title
- Expected impact: +5-10% for RU/IL/CJK content

**Phase 2: Deduplication Enhancement**
- Use `sha256_original` for byte-identical grouping
- Use `version_title` to prefer studio versions
- Use `secondary_priority` as tiebreaker

### Script → Language Mapping

| LRCLIB Script | Languages | Filter |
|---------------|-----------|--------|
| Cyrillic (а-я) | ru, uk, bg | `language LIKE 'ru%'` |
| Hebrew (א-ת) | he | `language = 'he'` |
| CJK (一-龯) | zh, ja, ko | `language IN ('zh','ja','ko')` |

---

## Performance Optimization Guide

This section documents optimization techniques that reduced `normalize-spotify` from ~90 minutes to ~15 minutes (6x speedup). These patterns apply to any Rust + SQLite bulk processing pipeline.

### Results: normalize-spotify

| Phase | Time |
|-------|------|
| Read + normalize (64M rows) | ~8 min |
| Sort keys (53.6M) | 17s |
| Write (56M rows) | ~4 min |
| Create indexes | 73s |
| Analyze | ~30s |
| **Total** | **~15 min** |

---

### SQLite Optimizations

#### 1. Batch INSERTs with Multi-Value Syntax

**Before:** 1 INSERT per row = 64M round-trips
**After:** 6000 rows per INSERT = 10K round-trips

```rust
// Build once, reuse for all full batches
fn build_batch_sql(num_rows: usize) -> String {
    let mut sql = String::with_capacity(100 + num_rows * 12);
    sql.push_str("INSERT OR IGNORE INTO table (a,b,c,d,e) VALUES ");
    for i in 0..num_rows {
        if i > 0 { sql.push(','); }
        sql.push_str("(?,?,?,?,?)");
    }
    sql
}
```

**SQLite parameter limit:** `SQLITE_MAX_VARIABLE_NUMBER = 32766` (SQLite 3.32+)
- Max safe batch: 32766 / columns_per_row
- For 5 columns: 6553 rows max, use 6000 for safety

#### 2. INSERT OR IGNORE for Deduplication

**Before:** HashSet to track 64M seen keys + conditional INSERT
**After:** Let SQLite handle duplicates via `INSERT OR IGNORE`

```rust
// Before: O(1) lookup but 64M HashSet entries = ~2GB RAM
if !seen.contains(&key) {
    seen.insert(key.clone());
    insert_row(&key);
}

// After: SQLite B-tree handles it, no extra memory
// Just need UNIQUE constraint or PRIMARY KEY
INSERT OR IGNORE INTO table (key, ...) VALUES (?, ...)
```

#### 3. Sorted Key Insertion for B-tree Locality

**Before:** Random HashMap iteration = random B-tree page access
**After:** Sort keys before write = sequential page access

```rust
// Collect keys, sort, then iterate in order
let mut sorted_keys: Vec<_> = map.keys().cloned().collect();
sorted_keys.sort_unstable();

for key in sorted_keys {
    let values = map.get(&key).unwrap();
    // Sequential B-tree inserts are ~10x faster
}
```

#### 4. Defer Index Creation

Create indexes AFTER bulk loading, not before:

```rust
// Create table without indexes
conn.execute("CREATE TABLE t (key TEXT, value TEXT)", [])?;

// Bulk insert all data
for batch in data.chunks(BATCH_SIZE) {
    insert_batch(batch)?;
}

// Create indexes on populated table (faster)
conn.execute("CREATE INDEX idx_key ON t(key)", [])?;
conn.execute("ANALYZE", [])?;
```

#### 5. WAL Mode and Pragmas

```rust
conn.execute_batch("
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -64000;  -- 64MB cache
    PRAGMA temp_store = MEMORY;
")?;
```

---

### Rust Optimizations

#### 1. String Interning for Repeated Values

When processing 64M rows with repeated strings (artist names, normalized keys), intern them:

```rust
use std::sync::Arc;
use std::collections::HashMap;

struct StringInterner {
    cache: HashMap<String, Arc<str>>,
}

impl StringInterner {
    fn intern(&mut self, s: &str) -> Arc<str> {
        if let Some(existing) = self.cache.get(s) {
            existing.clone()  // Cheap Arc clone
        } else {
            let interned: Arc<str> = s.into();
            self.cache.insert(s.to_string(), interned.clone());
            interned
        }
    }
}

// Result: 24M unique strings saved 40M allocations
```

#### 2. Pre-allocated Collections

```rust
// Before: Vec grows dynamically, reallocating
let mut results = Vec::new();

// After: Pre-allocate based on expected size
let mut results = Vec::with_capacity(expected_count);

// For strings with known length
let mut sql = String::with_capacity(100 + num_rows * 12);
```

#### 3. Array Literals vs vec![] in flat_map

```rust
// Before: vec![] allocates on heap per iteration
rows.iter().flat_map(|r| vec![&r.a, &r.b, &r.c])

// After: Array literal, stack allocated
rows.iter().flat_map(|r| [&r.a, &r.b, &r.c])
```

#### 4. Streaming Reads with rusqlite

Process rows as they're read, don't collect into Vec first:

```rust
let mut stmt = conn.prepare("SELECT * FROM big_table")?;
let mut rows = stmt.query([])?;

while let Some(row) = rows.next()? {
    // Process immediately, don't collect
    process_row(row)?;
}
```

#### 5. Progress Reporting Without Allocation

```rust
// Report every N rows without string formatting overhead
if count % 500_000 == 0 {
    eprintln!("[READ] {}/{} ({:.1}%)",
        count, total, (count as f64 / total as f64) * 100.0);
}
```

---

### Useful Crates

| Crate | Purpose |
|-------|---------|
| `rusqlite` | SQLite bindings with `bundled` feature |
| `any_ascii` | Fast Unicode → ASCII transliteration |
| `unicode-normalization` | NFKD decomposition |
| `rayon` | Parallel iterators (not used here due to SQLite single-writer) |
| `indicatif` | Progress bars (alternative to manual logging) |

---

### Anti-Patterns to Avoid

1. **Individual INSERTs in a loop** - Always batch
2. **HashSet for deduplication at scale** - Use `INSERT OR IGNORE`
3. **Creating indexes before bulk load** - Defer index creation
4. **Collecting all rows into memory** - Stream and process
5. **Random key iteration for writes** - Sort for B-tree locality
6. **String allocation in hot loops** - Intern or use references

---

## Commands Reference

### Build

```bash
cd /Users/hmemcpy/git/scrolltunes/scripts/lrclib-extract
cargo build --release
```

### Pre-normalize Spotify (one-time after normalization changes)

```bash
./target/release/normalize-spotify \
  /Users/hmemcpy/git/music/spotify_clean.sqlite3 \
  /Users/hmemcpy/git/music/spotify_normalized.sqlite3 \
  --log-only
```

### Run Extraction

```bash
./target/release/lrclib-extract \
  /Users/hmemcpy/git/music/lrclib-db-dump-*.sqlite3 \
  /Users/hmemcpy/git/music/output.sqlite3 \
  --spotify /Users/hmemcpy/git/music/spotify_clean.sqlite3 \
  --spotify-normalized /Users/hmemcpy/git/music/spotify_normalized.sqlite3 \
  --audio-features /Users/hmemcpy/git/music/spotify_clean_audio_features.sqlite3 \
  --log-only
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

-- Cyrillic failures
SELECT * FROM match_failures
WHERE lrclib_artist_norm GLOB '*[а-я]*' LIMIT 50;
```

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
    -- Spotify enrichment (nullable)
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
    failure_reason TEXT NOT NULL,  -- 'no_candidates', 'all_rejected'
    spotify_candidates TEXT        -- JSON array of top candidates
);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title, artist,
    content='tracks',
    content_rowid='id',
    tokenize='porter'
);
```
