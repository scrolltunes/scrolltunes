//! Pre-normalize Spotify database for faster extraction
//! Creates spotify_normalized.sqlite3 with normalized title/artist keys
//!
//! Usage: normalize-spotify [OPTIONS] <spotify_clean.sqlite3> [output.sqlite3]
//!
//! Options:
//!   --log-only      Disable progress bars, use log output only
//!
//! NOTE: Do not create output files in the project directory.
//! Use a separate location like /Users/hmemcpy/git/music/
//!
//! ## Schema (spec-02)
//!
//! Stores multiple candidates per (title_norm, artist_norm) key to handle
//! duration variants (radio edit vs album version, etc.). Uses duration bucketing
//! to deduplicate while preserving diversity.
//!
//! ```sql
//! CREATE TABLE track_norm (
//!     title_norm   TEXT NOT NULL,
//!     artist_norm  TEXT NOT NULL,
//!     track_rowid  INTEGER NOT NULL,
//!     popularity   INTEGER NOT NULL,
//!     duration_ms  INTEGER NOT NULL,
//!     PRIMARY KEY (title_norm, artist_norm, track_rowid)
//! );
//! ```

/// Conditional logging macro - only prints when log_only is true.
/// Used for tail-friendly output in background runs.
macro_rules! log_only {
    ($log_only:expr, $($arg:tt)*) => {
        if $log_only {
            eprintln!($($arg)*);
        }
    };
}

use anyhow::Result;
use indicatif::{ProgressBar, ProgressDrawTarget, ProgressStyle};
use rusqlite::Connection;
use rustc_hash::FxHashMap;
use std::sync::Arc;
use std::time::Instant;

// Import from shared library
use lrclib_extract::normalize::{normalize_artist, normalize_title};
use lrclib_extract::safety::validate_output_path;

/// Type alias for normalized key → (track_rowid, duration_ms) candidates map.
type NormCandidatesMap = FxHashMap<(Arc<str>, Arc<str>), Vec<(i64, i64)>>;

/// String interner for deduplicating normalized strings.
/// Reduces memory usage significantly when many tracks share the same artist/title.
struct StringInterner {
    strings: FxHashMap<Arc<str>, Arc<str>>,
}

impl StringInterner {
    fn new() -> Self {
        Self {
            strings: FxHashMap::default(),
        }
    }

    /// Intern a string, returning a shared reference to the deduplicated version.
    fn intern(&mut self, s: String) -> Arc<str> {
        if let Some(existing) = self.strings.get(s.as_str()) {
            Arc::clone(existing)
        } else {
            let arc: Arc<str> = Arc::from(s);
            self.strings.insert(Arc::clone(&arc), Arc::clone(&arc));
            arc
        }
    }
}

/// Candidate row for batch insert (spec-02 top-K schema)
#[derive(Clone)]
struct CandidateRow {
    track_rowid: i64,
    title_norm: Arc<str>,
    artist_norm: Arc<str>,
    popularity: i32,
    duration_ms: i64,
}

/// Duration bucket size in milliseconds (5 seconds).
/// Candidates within the same bucket are deduplicated to the highest popularity.
const DURATION_BUCKET_MS: i64 = 5000;

/// Maximum candidates to keep per (title_norm, artist_norm) key.
/// This limits index size while preserving duration diversity.
const MAX_CANDIDATES_PER_KEY: usize = 20;

/// Batch size for INSERT operations.
/// Larger batches = fewer round-trips = faster writes.
/// SQLite limit: SQLITE_MAX_VARIABLE_NUMBER = 32766 (tested).
/// Max rows = 32766 / 5 = 6553. Using 6000 for safety margin.
const BATCH_SIZE: usize = 6_000;

/// Build a multi-value INSERT SQL statement for a given number of rows.
/// Pre-building avoids repeated string allocation during batch writes.
fn build_batch_sql(num_rows: usize) -> String {
    if num_rows == 0 {
        return String::new();
    }
    // Pre-allocate: "(?,?,?,?,?)," is 12 chars, times num_rows, plus the prefix
    let mut sql = String::with_capacity(100 + num_rows * 12);
    sql.push_str("INSERT OR IGNORE INTO track_norm (title_norm, artist_norm, track_rowid, popularity, duration_ms) VALUES ");
    for i in 0..num_rows {
        if i > 0 {
            sql.push(',');
        }
        sql.push_str("(?,?,?,?,?)");
    }
    sql
}

/// Execute a batched INSERT statement using pre-built SQL.
/// Uses a flat parameter array to avoid per-row allocations.
fn execute_batch_insert(conn: &Connection, batch: &[CandidateRow], batch_sql: &str) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }

    let mut stmt = conn.prepare_cached(batch_sql)?;

    // Build flat parameter array without per-row Vec allocations
    // Using rusqlite's params_from_iter with references
    let params: Vec<&dyn rusqlite::ToSql> = batch
        .iter()
        .flat_map(|row| {
            [
                &row.title_norm as &dyn rusqlite::ToSql,
                &row.artist_norm as &dyn rusqlite::ToSql,
                &row.track_rowid as &dyn rusqlite::ToSql,
                &row.popularity as &dyn rusqlite::ToSql,
                &row.duration_ms as &dyn rusqlite::ToSql,
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

/// Intermediate candidate for duration bucket deduplication (spec-02 R2.4)
struct RawCandidate {
    track_rowid: i64,
    popularity: i32,
    duration_ms: i64,
}

/// Deduplicate candidates by duration bucket, keeping highest popularity per bucket (spec-02 R2.4).
/// Returns up to MAX_CANDIDATES_PER_KEY candidates sorted by popularity DESC.
fn dedupe_by_duration_bucket(candidates: Vec<RawCandidate>) -> Vec<RawCandidate> {
    if candidates.is_empty() {
        return vec![];
    }

    // Group by duration bucket, keep highest popularity per bucket
    let mut bucket_map: FxHashMap<i64, RawCandidate> = FxHashMap::default();

    for cand in candidates {
        let bucket = cand.duration_ms / DURATION_BUCKET_MS;

        match bucket_map.get(&bucket) {
            Some(existing) if existing.popularity >= cand.popularity => {}
            _ => {
                bucket_map.insert(bucket, cand);
            }
        }
    }

    // Sort by popularity DESC and limit to MAX_CANDIDATES_PER_KEY
    let mut result: Vec<RawCandidate> = bucket_map.into_values().collect();
    result.sort_by(|a, b| b.popularity.cmp(&a.popularity));
    result.truncate(MAX_CANDIDATES_PER_KEY);

    result
}

/// Parsed command-line arguments
struct Args {
    spotify_db: String,
    output_db: String,
    log_only: bool,
    skip_pop0_albums: bool,
}

fn parse_args() -> Result<Args> {
    let args: Vec<String> = std::env::args().collect();

    // Parse flags
    let log_only = args.iter().any(|a| a == "--log-only");
    let skip_pop0_albums = args.iter().any(|a| a == "--skip-pop0-albums");

    // Filter out flags
    let args_filtered: Vec<&String> = args
        .iter()
        .filter(|a| !matches!(a.as_str(), "--log-only" | "--skip-pop0-albums"))
        .collect();

    if args_filtered.len() < 2 {
        eprintln!(
            "Usage: normalize-spotify [OPTIONS] <spotify_clean.sqlite3> [spotify_normalized.sqlite3]"
        );
        eprintln!();
        eprintln!("Options:");
        eprintln!(
            "  --log-only           Disable progress bars, use log output only (for background runs)"
        );
        eprintln!("  --skip-pop0-albums   Skip building pop0_albums_norm table (built by default)");
        eprintln!();
        eprintln!("Creates a normalized lookup table with multiple candidates per key (spec-02).");
        eprintln!(
            "Schema: track_norm(title_norm, artist_norm, track_rowid, popularity, duration_ms)"
        );
        eprintln!("Uses duration bucketing to preserve variants while limiting index size.");
        std::process::exit(1);
    }

    let spotify_db = args_filtered[1].clone();
    let output_db = args_filtered
        .get(2)
        .map(|s| s.to_string())
        .unwrap_or_else(|| "spotify_normalized.sqlite3".to_string());

    Ok(Args {
        spotify_db,
        output_db,
        log_only,
        skip_pop0_albums,
    })
}

fn main() -> Result<()> {
    let args = parse_args()?;

    let spotify_db = &args.spotify_db;
    let output_db = &args.output_db;

    let log_only = args.log_only;
    let start = Instant::now();

    // Safety check: prevent accidentally deleting source databases
    let output_path = std::path::Path::new(output_db);
    let source_path = std::path::Path::new(spotify_db);
    validate_output_path(output_path, "normalized", &[source_path])?;

    // Remove existing output file to avoid corruption from previous runs
    if output_path.exists() {
        println!("Removing existing output file: {:?}", output_db);
        std::fs::remove_file(output_db)?;
    }

    // Open source database
    println!("Opening Spotify database: {:?}", spotify_db);
    let src_conn = Connection::open(spotify_db)?;

    // Count tracks for progress bar (pop>=1 for fast index, pop=0 handled via fallback)
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

    // Create table with spec-02 schema (multiple candidates per key)
    out_conn.execute(
        "CREATE TABLE IF NOT EXISTS track_norm (
            title_norm   TEXT NOT NULL,
            artist_norm  TEXT NOT NULL,
            track_rowid  INTEGER NOT NULL,
            popularity   INTEGER NOT NULL,
            duration_ms  INTEGER NOT NULL,
            PRIMARY KEY (title_norm, artist_norm, track_rowid)
        )",
        [],
    )?;

    // Phase 1: Stream and collect all candidates per (title_norm, artist_norm) key
    println!("Phase 1: Normalizing tracks and collecting candidates...");
    log_only!(
        log_only,
        "[PHASE1] Starting normalization of {} tracks...",
        total
    );
    let pb = create_progress_bar(total, log_only);

    // String interner for deduplicating normalized strings
    // Reduces memory usage significantly (many tracks share the same artist)
    let mut interner = StringInterner::new();

    // Map: (title_norm, artist_norm) -> Vec<RawCandidate>
    // Using Arc<str> keys for efficient memory sharing
    let mut candidates_map: FxHashMap<(Arc<str>, Arc<str>), Vec<RawCandidate>> =
        FxHashMap::default();

    let mut stmt = src_conn.prepare(
        "SELECT t.rowid, t.name, a.name, t.popularity, t.duration_ms
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
        let duration_ms: i64 = row.get(4)?;

        // Intern normalized strings to reduce memory allocations
        let title_norm = interner.intern(normalize_title(&title));
        let artist_norm = interner.intern(normalize_artist(&artist));
        let key = (Arc::clone(&title_norm), Arc::clone(&artist_norm));

        candidates_map.entry(key).or_default().push(RawCandidate {
            track_rowid,
            popularity,
            duration_ms,
        });

        count += 1;
        if count % 100_000 == 0 {
            pb.set_position(count);
        }
        // Tail-friendly logging (only in log-only mode)
        if count % 500_000 == 0 {
            log_only!(
                log_only,
                "[READ] {}/{} ({:.1}%)",
                count,
                total,
                100.0 * count as f64 / total as f64
            );
        }
    }
    pb.set_position(count);
    pb.finish_with_message("done");
    log_only!(log_only, "[READ] {}/{} (100.0%)", count, total);

    // Report interner stats
    let interned_strings = interner.strings.len();
    let unique_keys = candidates_map.len();
    println!(
        "  Interned {} unique strings (saved {} allocations)",
        interned_strings,
        count.saturating_sub(interned_strings as u64)
    );
    println!(
        "  {} unique (title, artist) keys from {} rows",
        unique_keys, count
    );

    // Phase 2: Sort keys, deduplicate by duration bucket, and write
    // Sorting keys improves B-tree insertion locality for ~2x speedup
    println!(
        "Phase 2: Sorting {} keys for optimal write order...",
        unique_keys
    );
    log_only!(log_only, "[PHASE2] Sorting {} keys...", unique_keys);

    let sort_start = Instant::now();
    let mut sorted_keys: Vec<(Arc<str>, Arc<str>)> = candidates_map.keys().cloned().collect();
    sorted_keys.sort_unstable();
    let sort_elapsed = sort_start.elapsed();
    println!("  Sorted in {:.2}s", sort_elapsed.as_secs_f64());
    log_only!(
        log_only,
        "[PHASE2] Sort complete in {:.2}s",
        sort_elapsed.as_secs_f64()
    );

    println!(
        "Phase 2b: Deduplicating and writing ({}ms buckets, max {} per key, batch {})...",
        DURATION_BUCKET_MS, MAX_CANDIDATES_PER_KEY, BATCH_SIZE
    );
    log_only!(
        log_only,
        "[PHASE2] Writing with batch size {}...",
        BATCH_SIZE
    );

    let pb_dedup = create_progress_bar(unique_keys as u64, log_only);

    let mut keys_processed = 0u64;

    // Pre-build SQL for full batches (avoids repeated string allocation)
    let batch_sql = build_batch_sql(BATCH_SIZE);
    let mut batch: Vec<CandidateRow> = Vec::with_capacity(BATCH_SIZE);
    let mut written = 0u64;

    let tx = out_conn.transaction()?;

    // Iterate in sorted order for sequential B-tree inserts
    for key in sorted_keys {
        let candidates = candidates_map.remove(&key).unwrap();
        let (title_norm, artist_norm) = key;
        let deduped = dedupe_by_duration_bucket(candidates);

        for cand in deduped {
            batch.push(CandidateRow {
                track_rowid: cand.track_rowid,
                title_norm: Arc::clone(&title_norm),
                artist_norm: Arc::clone(&artist_norm),
                popularity: cand.popularity,
                duration_ms: cand.duration_ms,
            });

            if batch.len() >= BATCH_SIZE {
                execute_batch_insert(&tx, &batch, &batch_sql)?;
                written += batch.len() as u64;
                batch.clear();

                if written % 1_000_000 == 0 {
                    log_only!(
                        log_only,
                        "[WRITE] {} rows ({:.1}% of keys)",
                        written,
                        100.0 * keys_processed as f64 / unique_keys as f64
                    );
                }
            }
        }

        keys_processed += 1;
        if keys_processed % 100_000 == 0 {
            pb_dedup.set_position(keys_processed);
        }
    }

    // Write remaining batch (may be smaller than BATCH_SIZE)
    if !batch.is_empty() {
        let remaining_sql = build_batch_sql(batch.len());
        execute_batch_insert(&tx, &batch, &remaining_sql)?;
        written += batch.len() as u64;
    }

    pb_dedup.finish_with_message("done");
    log_only!(log_only, "[WRITE] {} total rows written", written);

    tx.commit()?;

    println!(
        "  {} total candidate rows (avg {:.2} per key)",
        written,
        written as f64 / unique_keys.max(1) as f64
    );

    // Create indexes (spec-02 R2.1)
    println!("Creating indexes...");
    log_only!(
        log_only,
        "[INDEX] Creating index on (title_norm, artist_norm)..."
    );
    let idx_start = Instant::now();

    out_conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_track_norm_key ON track_norm(title_norm, artist_norm)",
        [],
    )?;

    log_only!(log_only, "[INDEX] Creating index on title_norm only...");
    out_conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_track_norm_title ON track_norm(title_norm)",
        [],
    )?;

    let idx_elapsed = idx_start.elapsed().as_secs_f64();
    println!("  Indexes created in {:.2}s", idx_elapsed);
    log_only!(log_only, "[INDEX] Complete in {:.2}s", idx_elapsed);

    // Optimize
    println!("Optimizing database...");
    log_only!(log_only, "[ANALYZE] Running ANALYZE...");
    out_conn.execute("ANALYZE", [])?;
    log_only!(log_only, "[ANALYZE] Complete");

    // Get file size
    let metadata = std::fs::metadata(output_db)?;
    let size_mb = metadata.len() as f64 / 1024.0 / 1024.0;

    let elapsed = start.elapsed();
    println!();
    println!("============================================================");
    println!("Normalization complete! (spec-02 top-K schema)");
    println!("  Input rows: {}", total);
    println!("  Unique keys: {}", unique_keys);
    println!("  Total candidate rows: {}", written);
    println!(
        "  Avg candidates per key: {:.2}",
        written as f64 / unique_keys.max(1) as f64
    );
    println!("  Duration bucket size: {}ms", DURATION_BUCKET_MS);
    println!("  Max candidates per key: {}", MAX_CANDIDATES_PER_KEY);
    println!("  Output size: {:.2} MB", size_mb);
    println!("  Elapsed: {:.2}s", elapsed.as_secs_f64());
    println!("============================================================");

    // Phase 3: Build pop0_albums_norm table (unless skipped)
    if !args.skip_pop0_albums {
        build_pop0_albums_index(&src_conn, &mut out_conn, log_only)?;
    }

    Ok(())
}

/// Build pop0_albums_norm index for album upgrade pass.
/// Contains pop=0 tracks from albums (not singles/compilations) for promoting
/// existing matches from Single/Compilation to Album releases.
///
/// Schema:
/// ```sql
/// CREATE TABLE pop0_albums_norm (
///     title_norm   TEXT NOT NULL,
///     artist_norm  TEXT NOT NULL,
///     track_rowid  INTEGER NOT NULL,
///     duration_ms  INTEGER NOT NULL,
///     PRIMARY KEY (title_norm, artist_norm, track_rowid)
/// );
/// ```
fn build_pop0_albums_index(
    src_conn: &Connection,
    out_conn: &mut Connection,
    log_only: bool,
) -> Result<()> {
    let phase_start = Instant::now();
    println!();
    println!("Building pop0_albums_norm index for album upgrade pass...");
    log_only!(
        log_only,
        "[POP0_ALBUMS] Starting pop0_albums_norm index build..."
    );

    // Create table
    out_conn.execute(
        "CREATE TABLE IF NOT EXISTS pop0_albums_norm (
            title_norm   TEXT NOT NULL,
            artist_norm  TEXT NOT NULL,
            track_rowid  INTEGER NOT NULL,
            duration_ms  INTEGER NOT NULL,
            PRIMARY KEY (title_norm, artist_norm, track_rowid)
        )",
        [],
    )?;

    // Count rows for progress
    let total: u64 = src_conn.query_row(
        "SELECT COUNT(*) FROM tracks t
         JOIN track_artists ta ON ta.track_rowid = t.rowid
         JOIN albums al ON al.rowid = t.album_rowid
         WHERE t.popularity = 0 AND al.album_type = 'album'",
        [],
        |row| row.get(0),
    )?;
    log_only!(
        log_only,
        "[POP0_ALBUMS] Found {} pop=0 album tracks to index",
        total
    );

    let pb = create_progress_bar(total, log_only);

    // Stream and collect candidates
    let mut interner = StringInterner::new();
    let mut candidates_map: NormCandidatesMap = FxHashMap::default();

    let mut stmt = src_conn.prepare(
        "SELECT t.rowid, t.name, a.name, t.duration_ms
         FROM tracks t
         JOIN track_artists ta ON ta.track_rowid = t.rowid
         JOIN artists a ON a.rowid = ta.artist_rowid
         JOIN albums al ON al.rowid = t.album_rowid
         WHERE t.popularity = 0 AND al.album_type = 'album'",
    )?;

    let mut rows = stmt.query([])?;
    let mut count = 0u64;

    while let Some(row) = rows.next()? {
        let track_rowid: i64 = row.get(0)?;
        let title: String = row.get(1)?;
        let artist: String = row.get(2)?;
        let duration_ms: i64 = row.get(3)?;

        let title_norm = interner.intern(normalize_title(&title));
        let artist_norm = interner.intern(normalize_artist(&artist));
        let key = (Arc::clone(&title_norm), Arc::clone(&artist_norm));

        candidates_map
            .entry(key)
            .or_default()
            .push((track_rowid, duration_ms));

        count += 1;
        if count % 100_000 == 0 {
            pb.set_position(count);
        }
        if count % 1_000_000 == 0 {
            log_only!(
                log_only,
                "[POP0_ALBUMS] Read {}/{} ({:.1}%)",
                count,
                total,
                100.0 * count as f64 / total as f64
            );
        }
    }
    pb.finish_with_message("done");
    log_only!(
        log_only,
        "[POP0_ALBUMS] Read {} rows, {} unique keys",
        count,
        candidates_map.len()
    );

    // Sort keys for sequential B-tree inserts
    let mut sorted_keys: Vec<(Arc<str>, Arc<str>)> = candidates_map.keys().cloned().collect();
    sorted_keys.sort_unstable();

    // Write to table using batch inserts
    println!("  Writing {} unique keys...", sorted_keys.len());
    let tx = out_conn.transaction()?;

    // Use smaller batch size for 4-column table
    const POP0_BATCH_SIZE: usize = 8000;
    let mut batch: Vec<(Arc<str>, Arc<str>, i64, i64)> = Vec::with_capacity(POP0_BATCH_SIZE);
    let mut written = 0u64;

    for key in sorted_keys {
        let entries = candidates_map.remove(&key).unwrap();
        let (title_norm, artist_norm) = key;

        for (track_rowid, duration_ms) in entries {
            batch.push((
                Arc::clone(&title_norm),
                Arc::clone(&artist_norm),
                track_rowid,
                duration_ms,
            ));

            if batch.len() >= POP0_BATCH_SIZE {
                write_pop0_batch(&tx, &batch)?;
                written += batch.len() as u64;
                batch.clear();
            }
        }
    }

    // Write remaining batch
    if !batch.is_empty() {
        write_pop0_batch(&tx, &batch)?;
        written += batch.len() as u64;
    }

    tx.commit()?;
    log_only!(log_only, "[POP0_ALBUMS] Wrote {} rows", written);

    // Create index
    println!("  Creating index...");
    log_only!(
        log_only,
        "[POP0_ALBUMS] Creating index on (title_norm, artist_norm)..."
    );
    out_conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pop0_albums_key ON pop0_albums_norm(title_norm, artist_norm)",
        [],
    )?;

    out_conn.execute("ANALYZE pop0_albums_norm", [])?;

    let elapsed = phase_start.elapsed();
    println!(
        "  pop0_albums_norm complete: {} rows, {} unique keys ({:.1}s)",
        written,
        candidates_map.len(),
        elapsed.as_secs_f64()
    );
    log_only!(
        log_only,
        "[POP0_ALBUMS] Complete: {} rows in {:.1}s",
        written,
        elapsed.as_secs_f64()
    );

    Ok(())
}

/// Write a batch of pop0_albums_norm rows.
fn write_pop0_batch(conn: &Connection, batch: &[(Arc<str>, Arc<str>, i64, i64)]) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }

    // Build multi-value INSERT
    let mut sql = String::with_capacity(100 + batch.len() * 10);
    sql.push_str(
        "INSERT OR IGNORE INTO pop0_albums_norm (title_norm, artist_norm, track_rowid, duration_ms) VALUES ",
    );
    for i in 0..batch.len() {
        if i > 0 {
            sql.push(',');
        }
        sql.push_str("(?,?,?,?)");
    }

    let mut stmt = conn.prepare_cached(&sql)?;
    let params: Vec<&dyn rusqlite::ToSql> = batch
        .iter()
        .flat_map(|(t, a, r, d)| {
            [
                t as &dyn rusqlite::ToSql,
                a as &dyn rusqlite::ToSql,
                r as &dyn rusqlite::ToSql,
                d as &dyn rusqlite::ToSql,
            ]
        })
        .collect();

    stmt.execute(params.as_slice())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dedupe_by_duration_bucket_empty() {
        let result = dedupe_by_duration_bucket(vec![]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_dedupe_by_duration_bucket_single() {
        let candidates = vec![RawCandidate {
            track_rowid: 1,
            popularity: 50,
            duration_ms: 180000, // 3 minutes
        }];
        let result = dedupe_by_duration_bucket(candidates);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].track_rowid, 1);
    }

    #[test]
    fn test_dedupe_by_duration_bucket_same_bucket_keeps_highest_popularity() {
        // Two candidates in the same 5-second bucket - should keep the higher popularity one
        let candidates = vec![
            RawCandidate {
                track_rowid: 1,
                popularity: 30,
                duration_ms: 180000, // bucket 36
            },
            RawCandidate {
                track_rowid: 2,
                popularity: 80,      // Higher popularity
                duration_ms: 181000, // same bucket 36
            },
        ];
        let result = dedupe_by_duration_bucket(candidates);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].track_rowid, 2);
        assert_eq!(result[0].popularity, 80);
    }

    #[test]
    fn test_dedupe_by_duration_bucket_different_buckets() {
        // Two candidates in different buckets - should keep both
        let candidates = vec![
            RawCandidate {
                track_rowid: 1,
                popularity: 50,
                duration_ms: 180000, // bucket 36 (3:00)
            },
            RawCandidate {
                track_rowid: 2,
                popularity: 60,
                duration_ms: 220000, // bucket 44 (3:40)
            },
        ];
        let result = dedupe_by_duration_bucket(candidates);
        assert_eq!(result.len(), 2);
        // Sorted by popularity DESC
        assert_eq!(result[0].track_rowid, 2); // Higher popularity first
        assert_eq!(result[1].track_rowid, 1);
    }

    #[test]
    fn test_dedupe_by_duration_bucket_max_limit() {
        // Create more candidates than MAX_CANDIDATES_PER_KEY in different buckets
        let candidates: Vec<RawCandidate> = (0..30)
            .map(|i| RawCandidate {
                track_rowid: i as i64,
                popularity: (100 - i),         // Decreasing popularity
                duration_ms: i as i64 * 10000, // Different buckets (10s apart)
            })
            .collect();

        let result = dedupe_by_duration_bucket(candidates);
        // Should be limited to MAX_CANDIDATES_PER_KEY (20)
        assert_eq!(result.len(), MAX_CANDIDATES_PER_KEY);
        // Should keep the highest popularity ones (first 20)
        assert_eq!(result[0].popularity, 100);
        assert_eq!(result[19].popularity, 81);
    }

    #[test]
    fn test_dedupe_by_duration_bucket_radio_edit_vs_album() {
        // Realistic scenario: radio edit (3:30) vs album version (4:00)
        let candidates = vec![
            RawCandidate {
                track_rowid: 1,
                popularity: 70,
                duration_ms: 210000, // 3:30 - radio edit
            },
            RawCandidate {
                track_rowid: 2,
                popularity: 85,
                duration_ms: 240000, // 4:00 - album version
            },
        ];
        let result = dedupe_by_duration_bucket(candidates);
        // Different buckets (42 vs 48), so both should be kept
        assert_eq!(result.len(), 2);
        // Higher popularity first
        assert_eq!(result[0].duration_ms, 240000);
    }
}
