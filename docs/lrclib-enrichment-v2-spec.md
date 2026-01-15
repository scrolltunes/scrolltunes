# LRCLIB-Spotify Enrichment v2 Specification

> Improving Spotify match rate through normalization, transliteration, fuzzy matching, and multi-pass rescue strategies

**Last Updated:** January 15, 2026
**Status:** Complete (71.6% match rate achieved, exceeds target)

---

## Current Results

| Metric | Baseline | Previous | **Current** | Target |
|--------|----------|----------|-------------|--------|
| Match rate | 46.4% | 57.5% | **71.6%** | 65-72% ✓ |
| Unique groups | 4.1M | 3.84M | 3.79M | — |
| Extraction time | 45 min | 48 min | **~44 min** | — |
| Output size | — | 1.1 GB | **~980 MB** | — |

### Match Rate by Phase

| Phase | Rate | Matches | Added |
|-------|------|---------|-------|
| MAIN (exact match) | 58.2% | 2,203,178 | — |
| MAIN (primary-artist fallback) | 63.0% | +181,473 | +4.8% |
| RESCUE (title-first) | 64.5% | +56,266 | +1.5% |
| FUZZY (Levenshtein ≥0.85) | 68.5% | +151,027 | +4.0% |
| POP0 (popularity=0 tracks) | 68.3% | +119,438 | +3.2% |
| **Final (after scoring)** | **71.6%** | **2,711,390** | — |

### Timing Breakdown

| Phase | Time | Details |
|-------|------|---------|
| READ | 1.6m | Load 12.2M → 10.0M filtered tracks |
| GROUP | 1.4m | Parallel normalization + string interning |
| MATCH | 4.8m | Indexed lookup → 63.0% (2.46M candidates) |
| FETCH | 2.5m | Load 2.78M track details |
| RESCUE | 1.6m | Title-first rescue → 64.5% (+56K) |
| FUZZY | 2.7m | Streaming (1.6m) + Levenshtein (46s) → 68.5% (+151K) |
| POP0 | 27.6m | Streaming scan 284M pop=0 tracks → +119K matches |
| AUDIO/IMAGES | ~1m | Load BPM, key, album art |
| WRITE | ~1m | Write 3.79M tracks |
| FTS + OPTIMIZE | ~13s | Build full-text search index |
| **Total** | **~44 min** | |

### Improvements Implemented

| Change | Impact |
|--------|--------|
| Pre-normalized Spotify index | 4x faster extraction |
| Track number stripping | +1-2% |
| "The" prefix/suffix handling | +0.4% |
| Primary-artist fallback | +4.8% (~181K matches) |
| `any_ascii` transliteration | +1.4% |
| **Title-first rescue (NEW)** | +1.5% (~56K matches) |
| **Fuzzy title matching (NEW)** | +4.0% (~151K matches) |
| **Pop=0 fallback (NEW)** | +3.2% (~119K matches) |
| Hebrew/Russian artist aliases | ~150 hand-crafted mappings |
| Batched INSERTs | 10x faster writes |
| normalize-spotify optimization | 6x faster (90 min → 15 min) |
| Parallel GROUP normalization | Uses rayon for 10M tracks |
| String interning | Saves ~8.6M allocations |
| FUZZY streaming approach | Reads 54M pairs once vs batch queries |

---

## Architecture

### Processing Pipeline

```
normalize-spotify (one-time, ~15 min)
    └─ Creates spotify_normalized.sqlite3 (54M keys, pop≥1)

lrclib-extract (~48 min)
    ├─ READ: Load LRCLIB (12.2M → 10.0M filtered tracks)
    ├─ GROUP: Deduplicate by (title_norm, artist_norm) → 3.79M groups
    ├─ MATCH: Indexed lookup + primary-artist fallback → 63.0% (2.38M)
    ├─ FETCH: Load track details for candidates (2.78M)
    ├─ RESCUE: Title-first rescue for no_candidates → 64.5% (+56K)
    ├─ FUZZY: Levenshtein similarity ≥0.85 → 68.5% (+151K)
    ├─ POP0: Streaming scan 284M pop=0 tracks → 71.6% (+119K)
    ├─ SCORE: Select best candidate per group → 71.6% (2.71M)
    ├─ ENRICH: Batch-load audio features + album images
    └─ WRITE: Output tracks + FTS index + failure logs
```

### New Matching Phases (v2)

**RESCUE (Title-First):**
- For groups with `no_candidates`, search by title only
- Verifies artist similarity ≥0.6 (normalized Jaccard)
- Skips common titles ("Love", "Home") to avoid false positives
- Impact: +56K matches (+1.5%)

**FUZZY (Levenshtein):**
- For remaining unmatched where artist exists in Spotify
- Streams all 54M (artist, title) pairs, filters to matching artists
- Computes Levenshtein similarity between LRCLIB and Spotify titles
- Accepts matches with similarity ≥0.85
- Parallel computation using rayon
- Impact: +151K matches (+4.0%)

**POP0 (Popularity Zero):**
- Searches 284M tracks with popularity=0 (excluded from main index for size)
- Streams all rows with title pre-filter index for efficiency
- Impact: +119K matches (+3.2%), ~29 min runtime

### Database Files

| File | Size | Purpose |
|------|------|---------|
| `lrclib-db-dump-*.sqlite3` | 77 GB | Source lyrics (12.2M tracks) |
| `spotify_clean.sqlite3` | 125 GB | Spotify catalog (64M track-artists) |
| `spotify_normalized.sqlite3` | 10 GB | Pre-normalized index (54M keys, pop≥1) |
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

### Failure Distribution (After All Phases)

| Reason | Count | % |
|--------|-------|---|
| `no_candidates` | 645,487 | 60% |
| `all_rejected` | 58,462 | 5% |
| **Total unmatched** | **1,074,128** | **28.4%** |

**Improvement:** Failures reduced from ~1.6M (42.5%) to ~1.07M (28.4%)

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

### 5. Spelling Variants and Typos ✓ ADDRESSED

**Problem:** ~~No fuzzy matching implemented.~~ **Now implemented via FUZZY phase.**

**Examples now matched:**
```
LRCLIB: "Enter Sand Man" → Spotify: "Enter Sandman" (Metallica)
LRCLIB: "Nothing Else Matte" → Spotify: "Nothing Else Matters" (Metallica)
LRCLIB: "BIRDS OF A FEATHE" → Spotify: "BIRDS OF A FEATHER" (Billie Eilish)
```

**Remaining gap:** ~20K entries with <85% similarity or artist mismatch.

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

## Previously "Impractical" Improvements - Now Implemented

### 1. Fuzzy String Matching ✓ IMPLEMENTED

**Previous assessment:** "Impractical - quadratic complexity"

**Actual implementation:**
- Stream-based approach: Read 54M pairs once, filter in memory
- Only compare titles for artists that exist in both databases
- Parallel Levenshtein computation using rayon (55 seconds for 1.3M comparisons)
- Threshold ≥0.85 similarity keeps false positive rate low

**Actual effort:** 1 day of engineering
**Actual gain:** +4.0% (+151K matches)

**Key insight:** The quadratic complexity fear was unfounded because:
1. Artist pre-filtering reduces comparisons from 3.8M × 54M to ~1.3M × ~500 avg
2. Streaming approach avoids memory issues
3. Parallel computation makes it tractable

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

### Completed ✓

1. ~~**Implement fuzzy title matching**~~ → +4.0% (+151K matches)
2. ~~**Title-first rescue pass**~~ → +1.5% (+56K matches)
3. ~~**Pop=0 fallback search**~~ → +3.2% (+119K matches)
4. ~~**Parallel GROUP normalization**~~ → 1.5m (was sequential)
5. ~~**Streaming FUZZY approach**~~ → Avoids memory issues with 54M pairs

### Potential Future Improvements (Diminishing Returns)

1. **Expand artist alias dictionary** - Add more Hebrew/Russian/Arabic artists as encountered
2. **Loosen duration threshold** - Currently 30s max, could allow 45s for perfect matches
3. **Phonetic indexing** - Soundex/Metaphone for English typo tolerance (~50K potential)
4. **ISRC-based matching** - Where available in LRCLIB metadata
5. **Language-specific romanization** - CJK scripts (~100K potential, high effort)

### Not Recommended

1. **Lower fuzzy threshold below 0.85** - False positive rate increases significantly
2. **Machine learning matching** - Effort/maintenance outweighs ~5% potential gain

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
| `rayon` | Parallel iterators (GROUP normalization, FUZZY Levenshtein) |
| `strsim` | Levenshtein similarity for fuzzy title matching |
| `rustc-hash` | FxHashMap/FxHashSet for faster hashing |
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
# Builds spotify_normalized.sqlite3 (~15 min)
./target/release/normalize-spotify \
  ~/git/music/spotify_clean.sqlite3 \
  ~/git/music/spotify_normalized.sqlite3 \
  --log-only
```

### Run Extraction

```bash
# Full extraction (~48 min)
./target/release/lrclib-extract \
  ~/git/music/lrclib-db-dump-*.sqlite3 \
  ~/git/music/output.sqlite3 \
  --spotify ~/git/music/spotify_clean.sqlite3 \
  --spotify-normalized ~/git/music/spotify_normalized.sqlite3 \
  --audio-features ~/git/music/spotify_clean_audio_features.sqlite3 \
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

## Database Verification (January 15, 2026)

### Summary

| Check | Result |
|-------|--------|
| Total tracks | 3,785,510 |
| Spotify matches | 2,711,382 (71.6%) |
| Unmatched | 1,074,128 (28.4%) |
| With album art | 2,707,401 (99.8% of matched) |
| With tempo/BPM | 2,700,246 |
| Database integrity | OK |
| File size | 1.08 GB |

### Failure Breakdown

| Reason | Count |
|--------|-------|
| `no_candidates` | 645,487 |
| `all_rejected` | 58,462 |

### Popularity Distribution (Matched Tracks)

| Range | Count |
|-------|-------|
| High (≥80) | 4,489 |
| Medium (50-79) | 220,526 |
| Low (<50) | 2,486,367 |

### FTS Search Verification

```sql
-- Bohemian Rhapsody: Queen (pop 81)
-- Metallica: Enter Sandman (pop 81), Nothing Else Matters (pop 80)
-- Taylor Swift: Cruel Summer (pop 89)
-- Daft Punk: Starboy (pop 89, tempo 186)
```

### Sample Unmatched (High Quality)

Remaining unmatched tracks are mostly:
- Non-Latin characters (Chinese 馮曦妤, Japanese エリック・クラプトン, Thai คาราบาว)
- Non-standard artist separators (`;`, `/`, `&` variations)
- Obscure artists not in Spotify catalog

---

## Testing Strategies

This section provides SQL queries for validating the enriched database. Run these after each extraction to verify correctness.

### 1. Basic Integrity Checks

```sql
-- Total counts and match rate
SELECT
    COUNT(*) as total,
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    ROUND(100.0 * SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as match_rate
FROM tracks;

-- Database integrity
PRAGMA integrity_check;

-- FTS index sync (should return 0)
SELECT COUNT(*) FROM tracks_fts WHERE rowid NOT IN (SELECT id FROM tracks);
```

### 2. Hebrew Artist Matching

Validates the hand-crafted Hebrew→Latin artist dictionary.

```sql
-- Top Hebrew artists should have Spotify matches
SELECT t.artist, t.title, t.spotify_id, t.popularity
FROM tracks t
WHERE t.artist IN (
    'עומר אדם',      -- Omer Adam
    'אייל גולן',     -- Eyal Golan
    'הדג נחש',       -- Hadag Nahash
    'שלמה ארצי',     -- Shlomo Artzi
    'משינה',         -- Mashina
    'אריק איינשטיין' -- Arik Einstein
)
AND t.spotify_id IS NOT NULL
LIMIT 20;

-- Count Hebrew matches vs unmatched
SELECT
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    SUM(CASE WHEN spotify_id IS NULL THEN 1 ELSE 0 END) as unmatched
FROM tracks
WHERE artist GLOB '*[א-ת]*';

-- Sample unmatched Hebrew (identify dictionary gaps)
SELECT artist, title, artist_norm
FROM tracks
WHERE artist GLOB '*[א-ת]*' AND spotify_id IS NULL
GROUP BY artist_norm
ORDER BY COUNT(*) DESC
LIMIT 20;
```

### 3. Cyrillic/Russian Artist Matching

Validates `any_ascii` transliteration and Russian artist dictionary.

```sql
-- Top Russian artists should have Spotify matches
SELECT t.artist, t.title, t.spotify_id, t.popularity
FROM tracks t
WHERE t.artist IN (
    'Кино',           -- Kino
    'ДДТ',            -- DDT
    'Ария',           -- Aria
    'Молчат Дома',    -- Molchat Doma
    'Земфира',        -- Zemfira
    'Би-2'            -- Bi-2
)
AND t.spotify_id IS NOT NULL
LIMIT 20;

-- Count Cyrillic matches vs unmatched
SELECT
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    SUM(CASE WHEN spotify_id IS NULL THEN 1 ELSE 0 END) as unmatched
FROM tracks
WHERE artist GLOB '*[а-яА-Я]*';

-- Verify transliteration worked (should see Latin spotify matches)
SELECT artist, artist_norm, spotify_id
FROM tracks
WHERE artist GLOB '*[а-яА-Я]*' AND spotify_id IS NOT NULL
LIMIT 10;
```

### 4. High-Popularity Track Matching

Popular tracks should have high match rates - low rates indicate problems.

```sql
-- Top artists by Spotify popularity (sanity check)
SELECT artist, title, popularity, spotify_id
FROM tracks
WHERE popularity >= 80
ORDER BY popularity DESC
LIMIT 20;

-- Artists with most high-popularity matches
SELECT artist, COUNT(*) as tracks, MAX(popularity) as max_pop
FROM tracks
WHERE popularity >= 70
GROUP BY artist
ORDER BY tracks DESC
LIMIT 20;

-- Verify specific popular songs exist
SELECT title, artist, popularity, tempo
FROM tracks
WHERE title_norm IN (
    'bohemian rhapsody',
    'stairway to heaven',
    'smells like teen spirit',
    'hotel california',
    'imagine'
)
ORDER BY popularity DESC;
```

### 5. Deduplication Validation

Ensures (title_norm, artist_norm) groups are properly deduplicated.

```sql
-- Should return 0 (no duplicate normalized keys with different spotify_ids)
SELECT title_norm, artist_norm, COUNT(DISTINCT spotify_id) as spotify_ids
FROM tracks
WHERE spotify_id IS NOT NULL
GROUP BY title_norm, artist_norm
HAVING COUNT(DISTINCT spotify_id) > 1
LIMIT 10;

-- Track count should roughly equal unique (title_norm, artist_norm) pairs
SELECT
    COUNT(*) as total_tracks,
    COUNT(DISTINCT title_norm || '|' || artist_norm) as unique_groups
FROM tracks;

-- Check for variant consolidation (multiple LRCLIB entries → 1 best match)
SELECT title_norm, artist_norm, COUNT(*) as variants
FROM tracks
GROUP BY title_norm, artist_norm
HAVING COUNT(*) > 1
LIMIT 10;
```

### 6. Fuzzy Matching Validation

Verify FUZZY phase caught spelling variants.

```sql
-- Known fuzzy matches (typos that should be corrected)
SELECT title, artist, title_norm, spotify_id
FROM tracks
WHERE title_norm LIKE '%sandman%' AND artist_norm LIKE '%metallica%';

-- Check near-miss titles were matched
SELECT title, title_norm, spotify_id IS NOT NULL as matched
FROM tracks
WHERE title LIKE '%Remaster%' OR title LIKE '%Live%' OR title LIKE '%Edit%'
LIMIT 20;
```

### 7. Audio Features Enrichment

Validates tempo/BPM and musical key data loaded correctly.

```sql
-- Audio feature coverage
SELECT
    COUNT(*) as total_matched,
    SUM(CASE WHEN tempo IS NOT NULL THEN 1 ELSE 0 END) as with_tempo,
    SUM(CASE WHEN musical_key IS NOT NULL THEN 1 ELSE 0 END) as with_key,
    ROUND(100.0 * SUM(CASE WHEN tempo IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as tempo_pct
FROM tracks
WHERE spotify_id IS NOT NULL;

-- Tempo distribution (sanity check - should be 60-200 BPM mostly)
SELECT
    CASE
        WHEN tempo < 60 THEN 'Very slow (<60)'
        WHEN tempo < 90 THEN 'Slow (60-89)'
        WHEN tempo < 120 THEN 'Medium (90-119)'
        WHEN tempo < 150 THEN 'Fast (120-149)'
        ELSE 'Very fast (150+)'
    END as tempo_range,
    COUNT(*) as count
FROM tracks
WHERE tempo IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;

-- Verify specific songs have expected tempos
SELECT title, artist, tempo, musical_key
FROM tracks
WHERE title_norm IN ('billie jean', 'take on me', 'enter sandman')
AND spotify_id IS NOT NULL;
```

### 8. Album Art Coverage

```sql
-- Album art coverage (should be 99%+ of matched)
SELECT
    SUM(CASE WHEN album_image_url IS NOT NULL THEN 1 ELSE 0 END) as with_art,
    COUNT(*) as matched,
    ROUND(100.0 * SUM(CASE WHEN album_image_url IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as art_pct
FROM tracks
WHERE spotify_id IS NOT NULL;

-- Sample album art URLs (verify format)
SELECT title, artist, album_image_url
FROM tracks
WHERE album_image_url IS NOT NULL
LIMIT 5;
```

### 9. FTS Search Quality

Test full-text search returns relevant results.

```sql
-- Basic FTS search
SELECT title, artist, popularity
FROM tracks_fts
JOIN tracks ON tracks_fts.rowid = tracks.id
WHERE tracks_fts MATCH 'bohemian rhapsody'
ORDER BY popularity DESC
LIMIT 5;

-- Multi-word search
SELECT title, artist, popularity
FROM tracks_fts
JOIN tracks ON tracks_fts.rowid = tracks.id
WHERE tracks_fts MATCH 'nothing else matters'
ORDER BY popularity DESC
LIMIT 5;

-- Artist search
SELECT title, artist, popularity
FROM tracks_fts
JOIN tracks ON tracks_fts.rowid = tracks.id
WHERE tracks_fts MATCH 'metallica'
ORDER BY popularity DESC
LIMIT 10;

-- Verify BM25 ranking works
SELECT title, artist, bm25(tracks_fts) as score
FROM tracks_fts
JOIN tracks ON tracks_fts.rowid = tracks.id
WHERE tracks_fts MATCH 'love'
ORDER BY bm25(tracks_fts)
LIMIT 10;
```

### 10. Edge Cases and Regressions

```sql
-- "The" prefix handling (Beatles vs The Beatles)
SELECT artist, artist_norm, COUNT(*) as tracks
FROM tracks
WHERE artist LIKE '%Beatles%'
GROUP BY artist_norm;

-- Multi-artist tracks (feat., &, with)
SELECT artist, artist_norm, spotify_id IS NOT NULL as matched
FROM tracks
WHERE artist LIKE '%feat.%' OR artist LIKE '%&%'
LIMIT 20;

-- Track number stripping (should not have leading numbers in norm)
SELECT title, title_norm
FROM tracks
WHERE title GLOB '[0-9]*[-–.]*'
LIMIT 10;

-- Year suffix stripping
SELECT title, title_norm
FROM tracks
WHERE title GLOB '*([0-9][0-9][0-9][0-9])*'
LIMIT 10;

-- Remaster suffix stripping
SELECT title, title_norm
FROM tracks
WHERE title LIKE '%remaster%' OR title LIKE '%Remaster%'
LIMIT 10;
```

### 11. Match Failures Analysis (if --log-failures used)

```sql
-- Only available if extraction run with --log-failures flag

-- Failure distribution
SELECT failure_reason, COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as pct
FROM match_failures
GROUP BY failure_reason;

-- High-quality unmatched (prioritize for dictionary additions)
SELECT lrclib_artist, COUNT(*) as tracks, MAX(lrclib_quality) as max_quality
FROM match_failures
WHERE failure_reason = 'no_candidates'
GROUP BY lrclib_artist_norm
ORDER BY tracks DESC
LIMIT 20;

-- Unmatched Hebrew artists (dictionary candidates)
SELECT lrclib_artist, lrclib_artist_norm, COUNT(*) as tracks
FROM match_failures
WHERE lrclib_artist GLOB '*[א-ת]*'
GROUP BY lrclib_artist_norm
ORDER BY tracks DESC
LIMIT 20;

-- Unmatched Cyrillic artists (dictionary candidates)
SELECT lrclib_artist, lrclib_artist_norm, COUNT(*) as tracks
FROM match_failures
WHERE lrclib_artist GLOB '*[а-яА-Я]*'
GROUP BY lrclib_artist_norm
ORDER BY tracks DESC
LIMIT 20;

-- Near-misses (had candidates but all rejected)
SELECT lrclib_title, lrclib_artist, spotify_candidates
FROM match_failures
WHERE failure_reason = 'all_rejected'
    AND spotify_candidates IS NOT NULL
LIMIT 10;
```

### Quick Validation Script

Run all critical checks in one go:

```bash
sqlite3 output.sqlite3 <<'EOF'
.mode column
.headers on

-- 1. Match rate
SELECT COUNT(*) as total,
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    ROUND(100.0 * SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) || '%' as rate
FROM tracks;

-- 2. Hebrew coverage
SELECT 'Hebrew' as script,
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    COUNT(*) as total
FROM tracks WHERE artist GLOB '*[א-ת]*';

-- 3. Cyrillic coverage
SELECT 'Cyrillic' as script,
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    COUNT(*) as total
FROM tracks WHERE artist GLOB '*[а-яА-Я]*';

-- 4. Top popularity check
SELECT title, artist, popularity FROM tracks
WHERE popularity >= 85 ORDER BY popularity DESC LIMIT 5;

-- 5. FTS sanity
SELECT title, artist FROM tracks_fts
JOIN tracks ON tracks_fts.rowid = tracks.id
WHERE tracks_fts MATCH 'queen' LIMIT 3;

-- 6. Integrity
PRAGMA integrity_check;
EOF
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lrclib_id INTEGER NOT NULL,
    lrclib_title TEXT NOT NULL,
    lrclib_artist TEXT NOT NULL,
    lrclib_album TEXT,
    lrclib_duration_sec INTEGER NOT NULL,
    lrclib_title_norm TEXT NOT NULL,
    lrclib_artist_norm TEXT NOT NULL,
    lrclib_quality INTEGER NOT NULL,
    group_variant_count INTEGER NOT NULL,
    failure_reason TEXT NOT NULL,  -- 'no_candidates', 'all_rejected'
    best_score INTEGER,
    spotify_candidates TEXT,       -- JSON array of top 5 candidates
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title, artist,
    content='tracks',
    content_rowid='id',
    tokenize='porter'
);
```
