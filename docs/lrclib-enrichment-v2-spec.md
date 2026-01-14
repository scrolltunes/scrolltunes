# LRCLIB-Spotify Enrichment v2 Specification

> Improving Spotify match rate through normalization, transliteration, and language-aware matching

**Last Updated:** January 2026
**Status:** Partially Implemented (53.3% match rate achieved)

---

## Current Results

| Metric | Baseline | Current | Target |
|--------|----------|---------|--------|
| Match rate | 46.4% | **53.3%** | 65-72% |
| Unique groups | 4.1M | 3.84M | — |
| Extraction time | 45 min | **20 min** | 25-30 min |
| Output size | — | 1.1 GB | — |

### Improvements Implemented

| Change | Impact |
|--------|--------|
| Pre-normalized Spotify index | 4x faster extraction |
| Track number stripping | +1-2% |
| "The" prefix/suffix handling | +0.4% |
| Primary-artist fallback | +2.9% |
| `any_ascii` transliteration | +1.4% |
| Batched INSERTs | 10x faster writes |

---

## Architecture

### Processing Pipeline

```
normalize-spotify (one-time, ~11 min)
    └─ Creates spotify_normalized.sqlite3 (54M keys)

lrclib-extract (~20 min)
    ├─ Read LRCLIB (12.2M → 10M valid tracks)
    ├─ Group by (title_norm, artist_norm) → 3.8M groups
    ├─ Match via indexed lookup + primary-artist fallback
    ├─ Score and select canonical → 2M Spotify matches
    ├─ Batch-load audio features + album images
    └─ Write tracks + FTS index + failure logs
```

### Database Files

| File | Size | Purpose |
|------|------|---------|
| `lrclib-db-dump-*.sqlite3` | 77 GB | Source lyrics (12.2M tracks) |
| `spotify_clean.sqlite3` | 125 GB | Spotify catalog (64M track-artists) |
| `spotify_normalized.sqlite3` | 5 GB | Pre-normalized index (54M keys) |
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
