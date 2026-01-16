//! Pre-normalize Spotify database for faster extraction.
//! Creates spotify_normalized.sqlite3 with normalized title/artist keys.
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

use anyhow::Result;
use indicatif::{ProgressBar, ProgressDrawTarget, ProgressStyle};
use rusqlite::Connection;
use rustc_hash::FxHashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use crate::normalize::{normalize_artist, normalize_title};
use lrclib_extract::safety::validate_output_path;

/// Conditional logging macro - only prints when log_only is true.
/// Used for tail-friendly output in background runs.
macro_rules! log_only {
    ($log_only:expr, $($arg:tt)*) => {
        if $log_only {
            eprintln!($($arg)*);
        }
    };
}

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
const BATCH_SIZE: usize = 6_000;

/// Build a multi-value INSERT SQL statement for a given number of rows.
fn build_batch_sql(num_rows: usize) -> String {
    if num_rows == 0 {
        return String::new();
    }
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
fn execute_batch_insert(conn: &Connection, batch: &[CandidateRow], batch_sql: &str) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }

    let mut stmt = conn.prepare_cached(batch_sql)?;
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

/// Arguments for normalize-spotify mode
pub struct NormalizeSpotifyArgs {
    pub spotify_db: String,
    pub output_db: String,
    pub log_only: bool,
    pub skip_pop0_tracks: bool,
}

/// Run the normalize-spotify command
pub fn run(args: NormalizeSpotifyArgs) -> Result<()> {
    let spotify_db = &args.spotify_db;
    let output_db = &args.output_db;

    let log_only = args.log_only;
    let start = Instant::now();

    // Safety check: prevent accidentally deleting source databases
    let output_path = Path::new(output_db);
    let source_path = Path::new(spotify_db);
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
    let mut interner = StringInterner::new();

    // Map: (title_norm, artist_norm) -> Vec<RawCandidate>
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

    // Pre-build SQL for full batches
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

    // Write remaining batch
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

    // Phase 3: Build pop0_tracks_norm table (unless skipped)
    if !args.skip_pop0_tracks {
        build_pop0_tracks_index(&src_conn, &mut out_conn, log_only)?;
        // Phase 4: Build pop0_tracks with pre-joined artists (for fast extraction)
        build_pop0_enriched(&src_conn, &mut out_conn, log_only)?;
    }

    Ok(())
}

/// Build pop0_tracks_norm index for pop=0 fallback matching.
/// No artist join - fetches artist at query time for smaller index (~100M rows vs 180M).
fn build_pop0_tracks_index(
    src_conn: &Connection,
    out_conn: &mut Connection,
    log_only: bool,
) -> Result<()> {
    let phase_start = Instant::now();
    println!();
    println!("Building pop0_tracks_norm index for pop=0 fallback...");
    log_only!(
        log_only,
        "[POP0_TRACKS] Starting pop0_tracks_norm index build..."
    );

    // Create table WITHOUT PRIMARY KEY for faster bulk insert
    out_conn.execute(
        "CREATE TABLE IF NOT EXISTS pop0_tracks_norm (
            title_norm   TEXT NOT NULL,
            track_rowid  INTEGER NOT NULL,
            duration_ms  INTEGER NOT NULL,
            album_rowid  INTEGER NOT NULL
        )",
        [],
    )?;

    // Count rows for progress (all pop=0 tracks, no joins)
    let total: u64 = src_conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE popularity = 0",
        [],
        |row| row.get(0),
    )?;
    log_only!(
        log_only,
        "[POP0_TRACKS] Found {} pop=0 tracks to index",
        total
    );

    let pb = create_progress_bar(total, log_only);

    // Stream tracks and normalize titles
    let mut interner = StringInterner::new();

    let mut stmt = src_conn.prepare(
        "SELECT t.rowid, t.name, t.duration_ms, t.album_rowid
         FROM tracks t
         WHERE t.popularity = 0",
    )?;

    let mut rows = stmt.query([])?;
    let mut count = 0u64;

    // Collect rows for batch insert
    const POP0_BATCH_SIZE: usize = 6_000; // 6000 rows × 4 cols = 24K vars (under SQLite 32K limit)
    let mut batch: Vec<(Arc<str>, i64, i64, i64)> = Vec::with_capacity(POP0_BATCH_SIZE);
    let mut written = 0u64;

    // Single transaction with aggressive PRAGMAs for bulk insert
    out_conn.execute_batch(
        "PRAGMA synchronous = OFF;
         PRAGMA journal_mode = OFF;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -2000000;",
    )?;
    let tx = out_conn.transaction()?;

    while let Some(row) = rows.next()? {
        let track_rowid: i64 = row.get(0)?;
        let title: String = row.get(1)?;
        let duration_ms: i64 = row.get(2)?;
        let album_rowid: i64 = row.get(3)?;

        let title_norm = interner.intern(normalize_title(&title));

        batch.push((title_norm, track_rowid, duration_ms, album_rowid));

        if batch.len() >= POP0_BATCH_SIZE {
            write_pop0_batch(&tx, &batch)?;
            written += batch.len() as u64;
            batch.clear();
        }

        count += 1;
        if count % 100_000 == 0 {
            pb.set_position(count);
        }
        if count % 5_000_000 == 0 {
            log_only!(
                log_only,
                "[POP0_TRACKS] Inserted {}/{} ({:.1}%)",
                written,
                total,
                100.0 * written as f64 / total as f64
            );
        }
    }
    pb.finish_with_message("done");

    // Write remaining batch
    if !batch.is_empty() {
        write_pop0_batch(&tx, &batch)?;
        written += batch.len() as u64;
    }

    tx.commit()?;
    log_only!(log_only, "[POP0_TRACKS] Wrote {} rows", written);

    // Create index AFTER all inserts (much faster)
    println!("  Creating index on title_norm...");
    log_only!(
        log_only,
        "[POP0_TRACKS] Creating index idx_pop0_title on title_norm..."
    );
    out_conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pop0_title ON pop0_tracks_norm(title_norm)",
        [],
    )?;

    // Build pop0_title_counts for common-title guardrails
    println!("  Building pop0_title_counts table...");
    log_only!(
        log_only,
        "[POP0_TRACKS] Building pop0_title_counts table..."
    );
    out_conn.execute(
        "CREATE TABLE IF NOT EXISTS pop0_title_counts (
            title_norm TEXT PRIMARY KEY,
            cnt INTEGER NOT NULL
        )",
        [],
    )?;
    out_conn.execute(
        "INSERT INTO pop0_title_counts
         SELECT title_norm, COUNT(*) as cnt
         FROM pop0_tracks_norm
         GROUP BY title_norm
         HAVING cnt > 500",
        [],
    )?;
    let high_count_titles: i64 =
        out_conn.query_row("SELECT COUNT(*) FROM pop0_title_counts", [], |row| {
            row.get(0)
        })?;
    log_only!(
        log_only,
        "[POP0_TRACKS] Found {} titles with >500 tracks (common-title guardrail)",
        high_count_titles
    );

    // ANALYZE for query planner
    println!("  Running ANALYZE...");
    out_conn.execute("ANALYZE pop0_tracks_norm", [])?;
    out_conn.execute("ANALYZE pop0_title_counts", [])?;

    // Reset PRAGMAs to safer defaults
    out_conn.execute_batch(
        "PRAGMA synchronous = NORMAL;
         PRAGMA journal_mode = WAL;",
    )?;

    let elapsed = phase_start.elapsed();
    println!(
        "  pop0_tracks_norm complete: {} rows ({:.1}s)",
        written,
        elapsed.as_secs_f64()
    );
    log_only!(
        log_only,
        "[POP0_TRACKS] Complete: {} rows in {:.1}s",
        written,
        elapsed.as_secs_f64()
    );

    Ok(())
}

/// Write a batch of pop0_tracks_norm rows (title_norm, track_rowid, duration_ms, album_rowid).
fn write_pop0_batch(conn: &Connection, batch: &[(Arc<str>, i64, i64, i64)]) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }

    let mut sql = String::with_capacity(100 + batch.len() * 10);
    sql.push_str(
        "INSERT INTO pop0_tracks_norm (title_norm, track_rowid, duration_ms, album_rowid) VALUES ",
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
        .flat_map(|(t, r, d, a)| {
            [
                t as &dyn rusqlite::ToSql,
                r as &dyn rusqlite::ToSql,
                d as &dyn rusqlite::ToSql,
                a as &dyn rusqlite::ToSql,
            ]
        })
        .collect();

    stmt.execute(params.as_slice())?;
    Ok(())
}

/// Row for pop0_tracks enriched table
struct Pop0EnrichedRow {
    track_rowid: i64,
    title_norm: Arc<str>,
    duration_ms: i64,
    track_name: String,
    track_id: String,
    isrc: Option<String>,
    artists_json: String,
    album_rowid: i64,
    album_name: Option<String>,
    album_type: i32,
}

/// Build pop0_tracks table with pre-joined artists and album data.
/// This eliminates the expensive artist fetch step during extraction.
///
/// Uses SQL aggregation (group_concat) instead of in-memory caching to avoid OOM
/// with 100M+ tracks. Memory usage stays constant regardless of dataset size.
pub fn build_pop0_enriched(
    src_conn: &Connection,
    out_conn: &mut Connection,
    log_only: bool,
) -> Result<()> {
    let phase_start = Instant::now();
    println!();
    println!("Building pop0_tracks table with pre-joined artists (streaming)...");
    log_only!(
        log_only,
        "[POP0_ENRICHED] Starting pop0_tracks build with SQL aggregation..."
    );

    // Create table WITHOUT PRIMARY KEY for faster bulk insert
    out_conn.execute(
        "CREATE TABLE IF NOT EXISTS pop0_tracks (
            track_rowid INTEGER NOT NULL,
            title_norm TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            track_name TEXT NOT NULL,
            track_id TEXT NOT NULL,
            isrc TEXT,
            artists_json TEXT NOT NULL,
            album_rowid INTEGER NOT NULL,
            album_name TEXT,
            album_type INTEGER NOT NULL
        )",
        [],
    )?;

    // Count unique tracks for progress (GROUP BY reduces count)
    let total: u64 = src_conn.query_row(
        "SELECT COUNT(DISTINCT t.rowid)
         FROM tracks t
         JOIN track_artists ta ON ta.track_rowid = t.rowid
         WHERE t.popularity = 0",
        [],
        |row| row.get(0),
    )?;
    log_only!(
        log_only,
        "[POP0_ENRICHED] Found {} pop=0 tracks with artists to enrich",
        total
    );

    // Single streaming query that aggregates artists via group_concat + json_quote
    // This avoids building massive in-memory HashMap for 100M+ tracks
    // ORDER BY ta.rowid inside group_concat preserves Spotify credited order
    //
    // Note: group_concat with ORDER BY requires SQLite 3.44+ (2023-11-01)
    // For older versions, we rely on the outer ORDER BY + deterministic grouping
    println!("  Streaming tracks with aggregated artists...");
    log_only!(
        log_only,
        "[POP0_ENRICHED] Using SQL aggregation (no in-memory cache)..."
    );

    let pb = create_progress_bar(total, log_only);
    let mut interner = StringInterner::new();

    // Use a subquery to ensure artist ordering before aggregation
    // This works on all SQLite versions
    let mut stmt = src_conn.prepare(
        "SELECT
            sub.track_rowid,
            sub.track_name,
            sub.duration_ms,
            sub.album_rowid,
            sub.track_id,
            sub.isrc,
            sub.album_name,
            sub.album_type_int,
            '[' || group_concat(sub.artist_quoted, ',') || ']' AS artists_json
         FROM (
             SELECT
                 t.rowid AS track_rowid,
                 t.name AS track_name,
                 t.duration_ms,
                 t.album_rowid,
                 t.id AS track_id,
                 t.external_id_isrc AS isrc,
                 al.name AS album_name,
                 CASE al.album_type
                     WHEN 'album' THEN 0
                     WHEN 'single' THEN 1
                     WHEN 'compilation' THEN 2
                     ELSE 3
                 END AS album_type_int,
                 json_quote(a.name) AS artist_quoted,
                 ta.rowid AS ta_order
             FROM tracks t
             JOIN track_artists ta ON ta.track_rowid = t.rowid
             JOIN artists a ON a.rowid = ta.artist_rowid
             LEFT JOIN albums al ON al.rowid = t.album_rowid
             WHERE t.popularity = 0
             ORDER BY t.rowid, ta.rowid
         ) sub
         GROUP BY sub.track_rowid",
    )?;

    let mut rows = stmt.query([])?;
    let mut count = 0u64;

    // Batch insert settings
    // 10 columns per row: 32766 / 10 = 3276, use 3000 for safety
    const POP0_ENRICHED_BATCH_SIZE: usize = 3_000;
    let mut batch: Vec<Pop0EnrichedRow> = Vec::with_capacity(POP0_ENRICHED_BATCH_SIZE);
    let mut written = 0u64;

    out_conn.execute_batch(
        "PRAGMA synchronous = OFF;
         PRAGMA journal_mode = OFF;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -2000000;",
    )?;
    let tx = out_conn.transaction()?;

    while let Some(row) = rows.next()? {
        let track_rowid: i64 = row.get(0)?;
        let track_name: String = row.get(1)?;
        let duration_ms: i64 = row.get(2)?;
        let album_rowid: i64 = row.get(3)?;
        let track_id: String = row.get(4)?;
        let isrc: Option<String> = row.get(5)?;
        let album_name: Option<String> = row.get(6)?;
        let album_type: i32 = row.get(7)?;
        let artists_json: String = row.get(8)?;

        let title_norm = interner.intern(crate::normalize::normalize_title(&track_name));

        batch.push(Pop0EnrichedRow {
            track_rowid,
            title_norm,
            duration_ms,
            track_name,
            track_id,
            isrc,
            artists_json,
            album_rowid,
            album_name,
            album_type,
        });

        if batch.len() >= POP0_ENRICHED_BATCH_SIZE {
            write_pop0_enriched_batch(&tx, &batch)?;
            written += batch.len() as u64;
            batch.clear();
        }

        count += 1;
        if count % 100_000 == 0 {
            pb.set_position(count);
        }
        if count % 5_000_000 == 0 {
            log_only!(
                log_only,
                "[POP0_ENRICHED] Processed {}/{} ({:.1}%), written {}",
                count,
                total,
                100.0 * count as f64 / total as f64,
                written
            );
        }
    }
    pb.finish_with_message("done");

    // Write remaining batch
    if !batch.is_empty() {
        write_pop0_enriched_batch(&tx, &batch)?;
        written += batch.len() as u64;
    }

    tx.commit()?;
    log_only!(log_only, "[POP0_ENRICHED] Wrote {} rows", written);

    // Create compound index for efficient lookups
    println!("  Creating index on (title_norm, duration_ms)...");
    log_only!(
        log_only,
        "[POP0_ENRICHED] Creating index idx_pop0_title_duration..."
    );
    out_conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pop0_title_duration
         ON pop0_tracks(title_norm, duration_ms)",
        [],
    )?;

    // Also create index on track_rowid for potential lookups
    out_conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_pop0_track_rowid
         ON pop0_tracks(track_rowid)",
        [],
    )?;

    // ANALYZE for query planner
    println!("  Running ANALYZE...");
    out_conn.execute("ANALYZE pop0_tracks", [])?;

    let elapsed = phase_start.elapsed();
    println!(
        "  pop0_tracks complete: {} rows ({:.1}s)",
        written,
        elapsed.as_secs_f64()
    );
    log_only!(
        log_only,
        "[POP0_ENRICHED] Complete: {} rows in {:.1}s",
        written,
        elapsed.as_secs_f64()
    );

    Ok(())
}

/// Write a batch of pop0_tracks enriched rows.
fn write_pop0_enriched_batch(conn: &Connection, batch: &[Pop0EnrichedRow]) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }

    let mut sql = String::with_capacity(200 + batch.len() * 25);
    sql.push_str(
        "INSERT OR IGNORE INTO pop0_tracks
         (track_rowid, title_norm, duration_ms, track_name, track_id, isrc, artists_json, album_rowid, album_name, album_type)
         VALUES "
    );
    for i in 0..batch.len() {
        if i > 0 {
            sql.push(',');
        }
        sql.push_str("(?,?,?,?,?,?,?,?,?,?)");
    }

    let mut stmt = conn.prepare_cached(&sql)?;
    let params: Vec<&dyn rusqlite::ToSql> = batch
        .iter()
        .flat_map(|row| {
            [
                &row.track_rowid as &dyn rusqlite::ToSql,
                &row.title_norm as &dyn rusqlite::ToSql,
                &row.duration_ms as &dyn rusqlite::ToSql,
                &row.track_name as &dyn rusqlite::ToSql,
                &row.track_id as &dyn rusqlite::ToSql,
                &row.isrc as &dyn rusqlite::ToSql,
                &row.artists_json as &dyn rusqlite::ToSql,
                &row.album_rowid as &dyn rusqlite::ToSql,
                &row.album_name as &dyn rusqlite::ToSql,
                &row.album_type as &dyn rusqlite::ToSql,
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
            duration_ms: 180000,
        }];
        let result = dedupe_by_duration_bucket(candidates);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].track_rowid, 1);
    }

    #[test]
    fn test_dedupe_by_duration_bucket_same_bucket_keeps_highest_popularity() {
        let candidates = vec![
            RawCandidate {
                track_rowid: 1,
                popularity: 30,
                duration_ms: 180000,
            },
            RawCandidate {
                track_rowid: 2,
                popularity: 80,
                duration_ms: 181000,
            },
        ];
        let result = dedupe_by_duration_bucket(candidates);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].track_rowid, 2);
        assert_eq!(result[0].popularity, 80);
    }

    #[test]
    fn test_dedupe_by_duration_bucket_different_buckets() {
        let candidates = vec![
            RawCandidate {
                track_rowid: 1,
                popularity: 50,
                duration_ms: 180000,
            },
            RawCandidate {
                track_rowid: 2,
                popularity: 60,
                duration_ms: 220000,
            },
        ];
        let result = dedupe_by_duration_bucket(candidates);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].track_rowid, 2);
        assert_eq!(result[1].track_rowid, 1);
    }

    #[test]
    fn test_dedupe_by_duration_bucket_max_limit() {
        let candidates: Vec<RawCandidate> = (0..30)
            .map(|i| RawCandidate {
                track_rowid: i as i64,
                popularity: (100 - i),
                duration_ms: i as i64 * 10000,
            })
            .collect();

        let result = dedupe_by_duration_bucket(candidates);
        assert_eq!(result.len(), MAX_CANDIDATES_PER_KEY);
        assert_eq!(result[0].popularity, 100);
        assert_eq!(result[19].popularity, 81);
    }
}
