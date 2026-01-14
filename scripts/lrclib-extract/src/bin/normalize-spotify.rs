//! Pre-normalize Spotify database for faster extraction
//! Creates spotify_normalized.sqlite3 with normalized title/artist keys
//!
//! Usage: normalize-spotify [--log-only] <spotify_clean.sqlite3> [output.sqlite3]
//!
//! NOTE: Do not create output files in the project directory.
//! Use a separate location like /Users/hmemcpy/git/music/

use anyhow::Result;
use any_ascii::any_ascii;
use indicatif::{ProgressBar, ProgressDrawTarget, ProgressStyle};
use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::Connection;
use rustc_hash::FxHashMap;
use std::time::Instant;
use unicode_normalization::UnicodeNormalization;

// ============================================================================
// NORMALIZATION (same as main.rs)
// ============================================================================

static TRACK_NUMBER_PREFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(?:track\s*)?\d{1,4}\s*[-–—._]\s*").unwrap()
});

static TRACK_NUMBER_SPACE_PREFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(?:0[1-9]|[1-9]\d?)\s+([A-Z])").unwrap()
});

static BRACKET_SUFFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\s*\[[^\]]+\]\s*$").unwrap()
});

static FILE_EXTENSION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\.(flac|mp3|wav|m4a|ogg|aac)$").unwrap()
});

static YEAR_SUFFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\s*\(\d{4}\)\s*$").unwrap()
});

static MOJIBAKE_SUFFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"[\u{FFFD}]+$").unwrap()
});

static TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\s*[\(\[](feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[\(\[].*?(remaster|remix|mix|edit|version|live|acoustic|radio|single|album|deluxe|bonus|instrumental|demo|mono|stereo|extended|original|official|explicit|clean|censored|uncensored).*?[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*-\s*(remaster|remix|remastered|live|acoustic|radio edit|single version|album version|bonus track|instrumental|demo).*$").unwrap(),
        Regex::new(r"(?i)\s*/\s*(remaster|remix|live|acoustic).*$").unwrap(),
    ]
});

static ARTIST_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\s*[\(\[](feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]").unwrap(),
        Regex::new(r"(?i),?\s*(feat\.?|ft\.?|featuring)\s+.*$").unwrap(),
        Regex::new(r"(?i)\s*;\s*.*$").unwrap(),
        Regex::new(r"(?i)\s*/\s*.*$").unwrap(),
        Regex::new(r"(?i)\s*&\s*.*$").unwrap(),
    ]
});

fn is_combining_mark(c: char) -> bool {
    matches!(c, '\u{0300}'..='\u{036F}' | '\u{1AB0}'..='\u{1AFF}' |
             '\u{1DC0}'..='\u{1DFF}' | '\u{20D0}'..='\u{20FF}' |
             '\u{FE20}'..='\u{FE2F}')
}

fn fold_to_ascii(s: &str) -> String {
    // First strip diacritics via NFKD decomposition
    let stripped: String = s.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect();
    // Then transliterate any remaining non-ASCII (Cyrillic, Hebrew, CJK, etc.)
    any_ascii(&stripped).to_lowercase()
}

fn normalize_punctuation(s: &str) -> String {
    s.replace(['\u{2018}', '\u{2019}'], "'")
        .replace(['\u{201C}', '\u{201D}'], "\"")
        .replace(['\u{00B4}', '\u{0060}'], "'")
        .replace(" & ", " and ")
        .replace("?t ", "'t ")
        .replace("?s ", "'s ")
        .replace("?ll ", "'ll ")
        .replace("?re ", "'re ")
        .replace("?ve ", "'ve ")
        .replace("?d ", "'d ")
        .replace("?m ", "'m ")
        .replace(" s ", "'s ")
        .replace(" t ", "'t ")
        .replace(" ll ", "'ll ")
        .replace(" re ", "'re ")
        .replace(" ve ", "'ve ")
        .replace(" d ", "'d ")
        .replace(" m ", "'m ")
}

fn normalize_title(title: &str) -> String {
    let mut s = title.to_string();

    // Strip file extensions
    s = FILE_EXTENSION.replace_all(&s, "").to_string();

    // Strip year suffix like (1964)
    s = YEAR_SUFFIX.replace_all(&s, "").to_string();

    // Strip bracket suffix like [Mono], [RM1]
    s = BRACKET_SUFFIX.replace_all(&s, "").to_string();

    // Strip track number prefix with separator
    s = TRACK_NUMBER_PREFIX.replace(&s, "").to_string();

    // Strip track number prefix without separator (e.g., "16 Eleanor Rigby")
    if let Some(caps) = TRACK_NUMBER_SPACE_PREFIX.captures(&s) {
        if let Some(letter) = caps.get(1) {
            s = format!("{}{}", letter.as_str(), &s[caps.get(0).unwrap().end()..]);
        }
    }

    // Strip mojibake
    s = MOJIBAKE_SUFFIX.replace(&s, "").to_string();

    // Normalize punctuation
    s = normalize_punctuation(&s);

    // Fold diacritics
    s = fold_to_ascii(&s);

    // Apply title patterns
    for pattern in TITLE_PATTERNS.iter() {
        s = pattern.replace_all(&s, "").to_string();
    }

    s.to_lowercase().trim().to_string()
}

fn normalize_artist(artist: &str) -> String {
    let mut s = normalize_punctuation(artist);
    s = fold_to_ascii(&s);

    for pattern in ARTIST_PATTERNS.iter() {
        s = pattern.replace_all(&s, "").to_string();
    }

    let mut normalized = s.to_lowercase().trim().to_string();

    // Strip "the " prefix (e.g., "The Beatles" → "beatles")
    if normalized.starts_with("the ") {
        normalized = normalized[4..].to_string();
    }

    normalized
}

/// Execute a batched INSERT statement for better performance
fn execute_batch_insert(
    conn: &Connection,
    batch: &[(String, String, i64)],
) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }

    // Build multi-value INSERT: INSERT INTO track_norm VALUES (?, ?, ?), (?, ?, ?), ...
    let placeholders: Vec<&str> = (0..batch.len()).map(|_| "(?, ?, ?)").collect();
    let sql = format!(
        "INSERT INTO track_norm (track_rowid, title_norm, artist_norm) VALUES {}",
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare_cached(&sql)?;

    // Flatten batch into parameter list
    let params: Vec<&dyn rusqlite::ToSql> = batch
        .iter()
        .flat_map(|(title, artist, rowid)| {
            vec![
                rowid as &dyn rusqlite::ToSql,
                title as &dyn rusqlite::ToSql,
                artist as &dyn rusqlite::ToSql,
            ]
        })
        .collect();

    stmt.execute(params.as_slice())?;
    Ok(())
}

/// Create a progress bar, optionally hidden for log-only mode
fn create_progress_bar(len: u64, log_only: bool) -> ProgressBar {
    let pb = ProgressBar::new(len);
    if log_only {
        pb.set_draw_target(ProgressDrawTarget::hidden());
    } else {
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({per_sec}, ETA: {eta})")
                .unwrap()
                .progress_chars("#>-"),
        );
    }
    pb
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();

    // Parse --log-only flag
    let log_only = args.iter().any(|a| a == "--log-only");
    let args_filtered: Vec<&String> = args.iter().filter(|a| *a != "--log-only").collect();

    if args_filtered.len() < 2 {
        eprintln!("Usage: normalize-spotify [--log-only] <spotify_clean.sqlite3> [spotify_normalized.sqlite3]");
        eprintln!();
        eprintln!("Options:");
        eprintln!("  --log-only  Disable progress bars, use log output only (for background runs)");
        eprintln!();
        eprintln!("Creates a normalized lookup table for faster extraction.");
        eprintln!("The output file will contain track_rowid, title_norm, artist_norm");
        eprintln!("with an index on (title_norm, artist_norm) for O(1) lookups.");
        std::process::exit(1);
    }

    let spotify_db = args_filtered[1];
    let output_db = args_filtered.get(2).map(|s| s.as_str()).unwrap_or("spotify_normalized.sqlite3");

    let start = Instant::now();

    // Remove existing output file to avoid corruption from previous runs
    if std::path::Path::new(output_db).exists() {
        println!("Removing existing output file: {:?}", output_db);
        std::fs::remove_file(output_db)?;
    }

    // Open source database
    println!("Opening Spotify database: {:?}", spotify_db);
    let src_conn = Connection::open(spotify_db)?;

    // Count tracks for progress bar
    let total: u64 = src_conn.query_row(
        "SELECT COUNT(*) FROM tracks t
         JOIN track_artists ta ON ta.track_rowid = t.rowid
         WHERE t.popularity >= 1",
        [],
        |row| row.get(0),
    )?;
    println!("Found {} tracks to normalize", total);

    // Create output database
    println!("Creating output database: {:?}", output_db);
    let mut out_conn = Connection::open(output_db)?;

    // Optimize for bulk insert
    out_conn.execute_batch(
        "PRAGMA journal_mode = OFF;
         PRAGMA synchronous = OFF;
         PRAGMA cache_size = -512000;
         PRAGMA temp_store = MEMORY;",
    )?;

    // Create table
    out_conn.execute(
        "CREATE TABLE IF NOT EXISTS track_norm (
            track_rowid INTEGER NOT NULL,
            title_norm TEXT NOT NULL,
            artist_norm TEXT NOT NULL
        )",
        [],
    )?;

    // Stream and normalize, deduplicating by keeping highest popularity per key
    println!("Phase 1: Normalizing and deduplicating (keeping highest popularity per key)...");
    eprintln!("[PHASE1] Starting normalization of {} tracks...", total);
    let pb = create_progress_bar(total, log_only);

    // Map: (title_norm, artist_norm) -> (track_rowid, popularity)
    let mut dedup_map: FxHashMap<(String, String), (i64, i32)> = FxHashMap::default();

    let mut stmt = src_conn.prepare(
        "SELECT t.rowid, t.name, a.name, t.popularity
         FROM tracks t
         JOIN track_artists ta ON ta.track_rowid = t.rowid
         JOIN artists a ON a.rowid = ta.artist_rowid
         WHERE t.popularity >= 1",
    )?;

    let mut rows = stmt.query([])?;
    let mut count = 0u64;

    while let Some(row) = rows.next()? {
        let track_rowid: i64 = row.get(0)?;
        let title: String = row.get(1)?;
        let artist: String = row.get(2)?;
        let popularity: i32 = row.get(3)?;

        let title_norm = normalize_title(&title);
        let artist_norm = normalize_artist(&artist);
        let key = (title_norm, artist_norm);

        // Keep track with highest popularity
        match dedup_map.get(&key) {
            Some((_, existing_pop)) if *existing_pop >= popularity => {}
            _ => {
                dedup_map.insert(key, (track_rowid, popularity));
            }
        }

        count += 1;
        if count % 100_000 == 0 {
            pb.set_position(count);
        }
        // Tail-friendly logging
        if count % 500_000 == 0 {
            eprintln!("[READ] {}/{} ({:.1}%)", count, total, 100.0 * count as f64 / total as f64);
        }
    }
    pb.set_position(count);
    pb.finish_with_message("done");
    eprintln!("[READ] {}/{} (100.0%)", count, total);

    let unique_keys = dedup_map.len();
    println!("  {} unique keys from {} rows ({:.1}% dedup ratio)",
             unique_keys, count, 100.0 * (1.0 - unique_keys as f64 / count as f64));

    // Write deduplicated entries using batched INSERTs
    const BATCH_SIZE: usize = 1000;
    let total_batches = (unique_keys + BATCH_SIZE - 1) / BATCH_SIZE;
    println!("Phase 2: Writing {} entries in {} batches (batch size: {})...", unique_keys, total_batches, BATCH_SIZE);
    eprintln!("[PHASE2] Starting write of {} entries...", unique_keys);

    let pb2 = create_progress_bar(unique_keys as u64, log_only);

    let tx = out_conn.transaction()?;
    {
        let mut written = 0u64;
        let mut batch: Vec<(String, String, i64)> = Vec::with_capacity(BATCH_SIZE);

        for ((title_norm, artist_norm), (track_rowid, _)) in dedup_map {
            batch.push((title_norm, artist_norm, track_rowid));

            if batch.len() >= BATCH_SIZE {
                execute_batch_insert(&tx, &batch)?;
                written += batch.len() as u64;
                batch.clear();
                pb2.set_position(written);

                // Also log for tail-friendly output
                if written % 500_000 == 0 {
                    eprintln!("[WRITE] {}/{} ({:.1}%)", written, unique_keys, 100.0 * written as f64 / unique_keys as f64);
                }
            }
        }

        // Write remaining entries
        if !batch.is_empty() {
            execute_batch_insert(&tx, &batch)?;
            written += batch.len() as u64;
            pb2.set_position(written);
        }

        eprintln!("[WRITE] {}/{} (100.0%)", written, unique_keys);
    }
    tx.commit()?;
    pb2.finish_with_message("done");

    // Create indexes
    println!("Creating indexes...");
    eprintln!("[INDEX] Creating primary index on (title_norm, artist_norm)...");
    let idx_start = Instant::now();

    out_conn.execute(
        "CREATE INDEX idx_norm_key ON track_norm(title_norm, artist_norm)",
        [],
    )?;
    let idx_elapsed = idx_start.elapsed().as_secs_f64();
    println!("  Primary index created in {:.2}s", idx_elapsed);
    eprintln!("[INDEX] Complete in {:.2}s", idx_elapsed);

    // Optimize
    println!("Optimizing database...");
    eprintln!("[ANALYZE] Running ANALYZE...");
    out_conn.execute("ANALYZE", [])?;
    eprintln!("[ANALYZE] Complete");

    // Get file size
    let metadata = std::fs::metadata(output_db)?;
    let size_mb = metadata.len() as f64 / 1024.0 / 1024.0;

    let elapsed = start.elapsed();
    println!();
    println!("============================================================");
    println!("Normalization complete!");
    println!("  Input rows: {}", total);
    println!("  Unique keys: {}", unique_keys);
    println!("  Output size: {:.2} MB", size_mb);
    println!("  Elapsed: {:.2}s", elapsed.as_secs_f64());
    println!("============================================================");

    Ok(())
}
