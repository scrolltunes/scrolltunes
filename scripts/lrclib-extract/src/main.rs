use anyhow::{Context, Result};
use clap::Parser;
use indicatif::{ProgressBar, ProgressStyle};
use once_cell::sync::Lazy;
use rayon::prelude::*;
use regex::Regex;
use rusqlite::{params, Connection};
use rustc_hash::{FxHashMap, FxHashSet};
use std::path::PathBuf;
use std::time::Instant;

/// Extract deduplicated LRCLIB search index with optional Spotify enrichment.
///
/// LRCLIB is the source of truth. Tracks are only included if they have synced lyrics.
/// Spotify data (BPM, popularity, album art) is enrichment metadata — nullable and optional.
#[derive(Parser)]
#[command(name = "lrclib-extract")]
#[command(about = "Extract deduplicated LRCLIB search index with optional Spotify enrichment")]
struct Args {
    /// Path to LRCLIB SQLite dump (source of truth)
    source: PathBuf,

    /// Path to output SQLite database
    output: PathBuf,

    /// Path to spotify_clean.sqlite3 (optional, for enrichment)
    #[arg(long)]
    spotify: Option<PathBuf>,

    /// Path to spotify_clean_audio_features.sqlite3 (optional, requires --spotify)
    #[arg(long)]
    audio_features: Option<PathBuf>,

    /// Minimum Spotify popularity to include in lookup index (0-100)
    #[arg(long, default_value = "1")]
    min_popularity: i32,

    #[arg(long, default_value = "0")]
    workers: usize,

    #[arg(long)]
    test: Option<String>,

    /// Filter by artist names (comma-separated, case-insensitive)
    #[arg(long)]
    artists: Option<String>,
}

const WRITE_BATCH_SIZE: usize = 10_000;

#[derive(Clone, Debug)]
struct Track {
    id: i64,
    title: String,
    artist: String,
    album: Option<String>,
    duration_sec: i64,
}

#[derive(Clone, Debug)]
struct ScoredTrack {
    track: Track,
    title_norm: String,
    artist_norm: String,
    quality: i32,
}

/// Spotify track info for matching
#[derive(Clone, Debug)]
struct SpotifyTrack {
    id: String,              // Spotify track ID (e.g., "2takcwOaAZWiXQijPHIx7B")
    #[allow(dead_code)]
    name: String,            // Original title (kept for debugging)
    #[allow(dead_code)]
    artist: String,          // Primary artist (kept for debugging)
    duration_ms: i64,
    popularity: i32,         // 0-100
    isrc: Option<String>,    // For Deezer album art lookup
    album_rowid: i64,        // For album_images lookup
}

/// Audio features from Spotify
#[derive(Clone, Debug)]
struct AudioFeatures {
    tempo: Option<f64>,           // BPM
    key: Option<i32>,             // -1 to 11 (pitch class)
    mode: Option<i32>,            // 0=minor, 1=major
    time_signature: Option<i32>,  // 3-7
}

/// Final enriched track for output.
/// LRCLIB fields are always present (source of truth).
/// Spotify fields are nullable (enrichment, NULL if no match).
#[derive(Clone, Debug)]
struct EnrichedTrack {
    // From LRCLIB (source of truth, always present)
    lrclib_id: i64,
    title: String,
    artist: String,
    album: Option<String>,
    duration_sec: i64,
    title_norm: String,
    artist_norm: String,
    quality: i32,

    // From Spotify (enrichment, all nullable)
    spotify_id: Option<String>,
    popularity: Option<i32>,         // NULL if no match (not 0)
    tempo: Option<f64>,
    musical_key: Option<i32>,
    mode: Option<i32>,
    time_signature: Option<i32>,
    isrc: Option<String>,
    album_image_url: Option<String>, // Medium (300px) Spotify CDN URL
}

static TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\s*[-–—]\s*(?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)").unwrap(),
        Regex::new(r"(?i)\s*[\(\[](?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[\(\[](?:live(?:\s+(?:at|from|in)\s+[^)\]]+)?|acoustic(?:\s+version)?|unplugged)[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[-–—]\s*(?:live(?:\s+(?:at|from|in)\s+.+)?|acoustic(?:\s+version)?)").unwrap(),
        Regex::new(r"(?i)\s*[\(\[](?:deluxe|super\s+deluxe|expanded|anniversary|bonus\s+track(?:s)?|special|collector'?s?)(?:\s+edition)?[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[\(\[](?:radio\s+edit|single\s+version|album\s+version|extended(?:\s+(?:mix|version))?|original\s+mix|mono|stereo)[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[\(\[](?:explicit|clean|censored|instrumental|karaoke)[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[\(\[](?:demo(?:\s+version)?|alternate(?:\s+(?:take|version))?|outtake)[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[-–—]\s*\d{4}(?:\s+(?:version|mix|edit))?$").unwrap(),
        Regex::new(r"(?i)\s*[\(\[](?:feat\.?|ft\.?|featuring)\s+[^)\]]+[\)\]]").unwrap(),
    ]
});

static ARTIST_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\s+(?:feat\.?|ft\.?|featuring|with|&|,|;|/)\s+.*").unwrap(),
        Regex::new(r"(?i)\s+(?:band|orchestra|ensemble|quartet|trio)$").unwrap(),
    ]
});

static LIVE_REMIX_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\blive\b").unwrap(),
        Regex::new(r"(?i)\bacoustic\b").unwrap(),
        Regex::new(r"(?i)\bunplugged\b").unwrap(),
        Regex::new(r"(?i)\bremix\b").unwrap(),
        Regex::new(r"(?i)\bremixed\b").unwrap(),
        Regex::new(r"(?i)\bcover\b").unwrap(),
        Regex::new(r"(?i)\btribute\b").unwrap(),
        Regex::new(r"(?i)\bkaraoke\b").unwrap(),
        Regex::new(r"(?i)\binstrumental\b").unwrap(),
        Regex::new(r"(?i)\bdemo\b").unwrap(),
        Regex::new(r"(?i)\bouttake\b").unwrap(),
        Regex::new(r"(?i)\balternate\b").unwrap(),
        Regex::new(r"(?i)\bbootleg\b").unwrap(),
        Regex::new(r"(?i)\bmedley\b").unwrap(),
    ]
});

// Patterns for garbage titles (track numbers, artist name in title, etc.)
static GARBAGE_TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        // Track numbers at start: "01. Song", "01 - Song", "0958 - Artist - Song", "93_34 Artist - Song"
        Regex::new(r"(?i)^\d{1,4}\s*[-–—._]\s*").unwrap(),
        // Artist name embedded in title: "Artist - Song"
        Regex::new(r"(?i)^[^-–—]+ - [^-–—]+ - ").unwrap(),
        // Numbered prefixes like "01.", "12 -"
        Regex::new(r"(?i)^\d{1,2}\.\s+").unwrap(),
        // Artist name in quotes: "Artist 'Song'" or 'Artist "Song"'
        Regex::new(r#"(?i)^[^'"]+\s+['"][^'"]+['"]$"#).unwrap(),
        // "Artist - Song" format (artist hyphen title)
        Regex::new(r"(?i)^[A-Za-z0-9\s]+ - [A-Za-z0-9\s]+$").unwrap(),
        // Cover attribution: "Song (Original Artist)" - capitalized words in parens at end
        Regex::new(r"(?i)\s+\([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)+\)$").unwrap(),
    ]
});

static LOW_QUALITY_ALBUMS: Lazy<Vec<&str>> = Lazy::new(|| {
    vec![
        "-", ".", "null", "unknown", "drumless", "karaoke", "tribute",
        "instrumental", "cover", "made famous", "in the style of",
        "backing track", "minus one",
    ]
});

// Patterns for titles to skip entirely (not just penalize)
static SKIP_TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        // "(Paused)" versions - incomplete/broken lyrics
        Regex::new(r"(?i)\(paused\)").unwrap(),
    ]
});

// Cyrillic/Hebrew to Latin artist name mappings for deduplication
static ARTIST_TRANSLITERATIONS: Lazy<FxHashMap<&str, &str>> = Lazy::new(|| {
    let mut m = FxHashMap::default();
    // Russian bands with both Cyrillic and Latin spellings
    m.insert("ддт", "ddt");
    m.insert("кино", "kino");
    m.insert("аквариум", "aquarium");
    m.insert("ария", "aria");
    m.insert("алиса", "alisa");
    m.insert("сплин", "splin");
    m.insert("мумий тролль", "mumiy troll");
    m.insert("би-2", "bi-2");
    m.insert("би2", "bi-2");
    m.insert("земфира", "zemfira");
    m.insert("ленинград", "leningrad");
    m.insert("король и шут", "korol i shut");
    m.insert("киш", "korol i shut");
    m.insert("aria", "aria"); // Latin spelling maps to itself for consistency
    m.insert("машина времени", "mashina vremeni");
    m.insert("наутилус помпилиус", "nautilus pompilius");
    m.insert("пикник", "piknik");
    m.insert("секрет", "sekret");
    m.insert("чайф", "chaif");
    m.insert("агата кристи", "agata kristi");
    m.insert("любэ", "lyube");
    m.insert("сектор газа", "sektor gaza");
    // Hebrew bands with both Hebrew and Latin spellings
    m.insert("היהודים", "hayehudim");
    m.insert("משינה", "mashina");
    m.insert("אתניקס", "ethnix");
    m.insert("כוורת", "kaveret");
    m.insert("טיפקס", "tipex");
    m.insert("שלום חנוך", "shalom hanoch");
    m.insert("אריק איינשטיין", "arik einstein");
    m.insert("עידן רייכל", "idan raichel");
    m.insert("שלמה ארצי", "shlomo artzi");
    m.insert("יהודה פוליקר", "yehuda poliker");
    m.insert("רמי קלינשטיין", "rami kleinstein");
    m.insert("אביב גפן", "aviv geffen");
    m.insert("עברי לידר", "ivri lider");
    m.insert("סטטיק ובן אל תבורי", "static and ben el");
    m.insert("נועה קירל", "noa kirel");
    m.insert("עומר אדם", "omer adam");
    m
});

fn should_skip_title(title: &str) -> bool {
    SKIP_TITLE_PATTERNS.iter().any(|p| p.is_match(title))
}

fn normalize_title(title: &str) -> String {
    let mut result = title.to_string();
    for pattern in TITLE_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }
    result.trim().to_lowercase()
}

fn normalize_artist(artist: &str) -> String {
    let mut result = artist.to_string();
    for pattern in ARTIST_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }
    let normalized = result.trim().to_lowercase();
    
    // Apply transliteration for known Cyrillic artists
    ARTIST_TRANSLITERATIONS
        .get(normalized.as_str())
        .map(|&s| s.to_string())
        .unwrap_or(normalized)
}

fn is_garbage_album(album: &Option<String>) -> bool {
    match album {
        None => false,
        Some(a) => {
            let lower = a.to_lowercase();
            LOW_QUALITY_ALBUMS.iter().any(|&lq| lower.contains(lq))
        }
    }
}

#[derive(Debug, PartialEq)]
enum AlbumType {
    Studio,
    Remaster,
    Deluxe,
    Compilation,
    Live,
    Soundtrack,
}

fn classify_album(album: &Option<String>) -> AlbumType {
    match album {
        None => AlbumType::Studio,
        Some(a) => {
            let lower = a.to_lowercase();
            if lower.contains("live") || lower.contains("concert") || lower.contains("tour") || lower.contains("unplugged") {
                AlbumType::Live
            } else if lower.contains("greatest hits") || lower.contains("best of") || lower.contains("collection") || lower.contains("anthology") || lower.contains("essential") {
                AlbumType::Compilation
            } else if lower.contains("soundtrack") || lower.contains("ost") || lower.contains("motion picture") {
                AlbumType::Soundtrack
            } else if lower.contains("remaster") || lower.contains("reissue") {
                AlbumType::Remaster
            } else if lower.contains("deluxe") || lower.contains("expanded") || lower.contains("anniversary") || lower.contains("special") || lower.contains("collector") {
                AlbumType::Deluxe
            } else {
                AlbumType::Studio
            }
        }
    }
}

fn has_live_remix_pattern(text: &str) -> bool {
    LIVE_REMIX_PATTERNS.iter().any(|p| p.is_match(text))
}

fn has_garbage_title_pattern(title: &str) -> bool {
    GARBAGE_TITLE_PATTERNS.iter().any(|p| p.is_match(title))
}

fn title_contains_artist(title: &str, artist: &str) -> bool {
    let title_lower = title.to_lowercase();
    let artist_lower = artist.to_lowercase();
    
    // Skip if artist is too short (avoid false positives like "a" or "the")
    if artist_lower.len() < 3 {
        return false;
    }
    
    // Check if title contains the artist name
    title_lower.contains(&artist_lower)
}

fn compute_quality_score(track: &Track, median_duration: Option<i64>) -> i32 {
    let mut score: i32 = 0;

    match classify_album(&track.album) {
        AlbumType::Studio => score += 40,
        AlbumType::Remaster => score += 25,
        AlbumType::Deluxe => score += 15,
        AlbumType::Compilation => score += 5,
        AlbumType::Soundtrack => score -= 10,
        AlbumType::Live => score -= 20,
    }

    let title_has_pattern = has_live_remix_pattern(&track.title);
    let album_has_pattern = track.album.as_ref().map_or(false, |a| has_live_remix_pattern(a));
    if title_has_pattern || album_has_pattern {
        score -= 30;
    }

    // Penalize garbage titles (track numbers, artist embedded in title)
    if has_garbage_title_pattern(&track.title) {
        score -= 50;
    }
    
    // Penalize titles that contain the artist name (e.g., "Foo Fighters - Everlong")
    if title_contains_artist(&track.title, &track.artist) {
        score -= 40;
    }

    if let Some(median) = median_duration {
        let diff = (track.duration_sec - median).abs();
        if diff <= 2 {
            score += 30;
        } else if diff <= 5 {
            score += 20;
        } else if diff <= 10 {
            score += 10;
        }
    }

    if !is_garbage_album(&track.album) {
        score += 10;
    }

    score
}

fn select_canonical(tracks: Vec<Track>) -> Option<ScoredTrack> {
    if tracks.is_empty() {
        return None;
    }

    let median_duration = if !tracks.is_empty() {
        let mut durations: Vec<i64> = tracks.iter().map(|t| t.duration_sec).collect();
        durations.sort();
        Some(durations[durations.len() / 2])
    } else {
        None
    };

    let title_norm = normalize_title(&tracks[0].title);
    let artist_norm = normalize_artist(&tracks[0].artist);

    tracks
        .into_iter()
        .map(|t| {
            let quality = compute_quality_score(&t, median_duration);
            ScoredTrack {
                track: t,
                title_norm: title_norm.clone(),
                artist_norm: artist_norm.clone(),
                quality,
            }
        })
        .max_by(|a, b| {
            // Primary: quality score (higher is better)
            // Tiebreaker: lower ID (older = more likely canonical)
            a.quality.cmp(&b.quality).then_with(|| b.track.id.cmp(&a.track.id))
        })
}

fn create_progress_bar(len: u64, msg: &str) -> ProgressBar {
    let pb = ProgressBar::new(len);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{msg} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({per_sec}, ETA: {eta})")
            .unwrap()
            .progress_chars("=> "),
    );
    pb.set_message(msg.to_string());
    pb
}

fn create_spinner(msg: &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::default_spinner()
            .template("{msg} {spinner} [{elapsed_precise}]")
            .unwrap(),
    );
    pb.set_message(msg.to_string());
    pb.enable_steady_tick(std::time::Duration::from_millis(100));
    pb
}

fn read_tracks(conn: &Connection, artist_filter: Option<&Vec<String>>) -> Result<Vec<Track>> {
    let (count_sql, select_sql) = if let Some(artists) = artist_filter {
        let placeholders: Vec<String> = artists.iter().map(|_| "LOWER(t.artist_name) LIKE ?".to_string()).collect();
        let where_clause = placeholders.join(" OR ");
        (
            format!(
                "SELECT COUNT(*) FROM tracks t
                 WHERE t.last_lyrics_id IN (SELECT id FROM lyrics WHERE has_synced_lyrics = 1)
                   AND t.duration > 45 AND t.duration < 600
                   AND ({})", where_clause
            ),
            format!(
                "SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
                 FROM tracks t
                 WHERE t.last_lyrics_id IN (SELECT id FROM lyrics WHERE has_synced_lyrics = 1)
                   AND t.duration > 45 AND t.duration < 600
                   AND ({})", where_clause
            ),
        )
    } else {
        (
            "SELECT COUNT(*) FROM tracks t
             WHERE t.last_lyrics_id IN (SELECT id FROM lyrics WHERE has_synced_lyrics = 1)
               AND t.duration > 45 AND t.duration < 600".to_string(),
            "SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
             FROM tracks t
             WHERE t.last_lyrics_id IN (SELECT id FROM lyrics WHERE has_synced_lyrics = 1)
               AND t.duration > 45 AND t.duration < 600".to_string(),
        )
    };

    let count: i64 = if let Some(artists) = artist_filter {
        let patterns: Vec<String> = artists.iter().map(|a| format!("%{}%", a.to_lowercase())).collect();
        let mut stmt = conn.prepare(&count_sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = patterns.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        stmt.query_row(params.as_slice(), |row| row.get(0))?
    } else {
        conn.query_row(&count_sql, [], |row| row.get(0))?
    };

    let pb = create_progress_bar(count as u64, "Phase 1: Reading tracks");

    let mut stmt = conn.prepare(&select_sql)?;

    let mut tracks = Vec::with_capacity(count as usize);
    let mut rows = if let Some(artists) = artist_filter {
        let patterns: Vec<String> = artists.iter().map(|a| format!("%{}%", a.to_lowercase())).collect();
        let params: Vec<&dyn rusqlite::ToSql> = patterns.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        stmt.query(params.as_slice())?
    } else {
        stmt.query([])?
    };

    while let Some(row) = rows.next()? {
        let album: Option<String> = row.get(3)?;
        let duration_float: f64 = row.get(4)?;
        let track = Track {
            id: row.get(0)?,
            title: row.get(1)?,
            artist: row.get(2)?,
            album: album.clone(),
            duration_sec: duration_float.round() as i64,
        };

        // Skip garbage albums and "(Paused)" titles
        if !is_garbage_album(&track.album) && !should_skip_title(&track.title) {
            tracks.push(track);
        }
        pb.inc(1);
    }

    pb.finish_with_message(format!("Phase 1: Read {} valid tracks", tracks.len()));
    Ok(tracks)
}

fn group_tracks(tracks: Vec<Track>) -> FxHashMap<(String, String), Vec<Track>> {
    let mut groups: FxHashMap<(String, String), Vec<Track>> = FxHashMap::default();

    for track in tracks {
        let key = (normalize_title(&track.title), normalize_artist(&track.artist));
        groups.entry(key).or_default().push(track);
    }

    groups
}

fn process_groups(groups: FxHashMap<(String, String), Vec<Track>>) -> Vec<ScoredTrack> {
    let pb = create_progress_bar(groups.len() as u64, "Phase 2: Selecting canonical");

    let groups_vec: Vec<_> = groups.into_iter().collect();
    let results: Vec<ScoredTrack> = groups_vec
        .into_par_iter()
        .filter_map(|(_, tracks)| {
            let result = select_canonical(tracks);
            pb.inc(1);
            result
        })
        .collect();

    pb.finish_with_message(format!("Phase 2: Selected {} canonical tracks", results.len()));
    results
}

fn build_fts_index(conn: &Connection) -> Result<()> {
    let spinner = create_spinner("Phase 4: Building FTS index");

    conn.execute(
        "INSERT INTO tracks_fts(tracks_fts) VALUES('rebuild')",
        [],
    )?;

    spinner.finish_with_message("Phase 4: FTS index built");
    Ok(())
}

fn optimize_database(conn: &Connection) -> Result<()> {
    let spinner = create_spinner("Phase 5: Optimizing database");

    conn.execute_batch("VACUUM; ANALYZE;")?;

    spinner.finish_with_message("Phase 5: Database optimized");
    Ok(())
}

// ============================================================================
// Spotify Enrichment Functions
// ============================================================================

/// Build LRCLIB index for streaming Spotify matching.
/// Returns FxHashMap: (title_norm, artist_norm) → Vec<index into canonical_tracks>
fn build_lrclib_index(canonical_tracks: &[ScoredTrack]) -> FxHashMap<(String, String), Vec<usize>> {
    println!("[LRCLIB] Building lookup index for {} canonical tracks...", canonical_tracks.len());
    let mut index: FxHashMap<(String, String), Vec<usize>> = FxHashMap::default();
    for (idx, t) in canonical_tracks.iter().enumerate() {
        let key = (t.title_norm.clone(), t.artist_norm.clone());
        index.entry(key).or_default().push(idx);
    }
    println!("[LRCLIB] Index built with {} unique (title, artist) keys", index.len());
    index
}

/// Stream Spotify tracks and match against LRCLIB index on-the-fly.
/// Returns Vec<Option<SpotifyTrack>> aligned with canonical_tracks indices.
/// This avoids loading 45M+ Spotify tracks into memory.
fn stream_match_spotify(
    conn: &Connection,
    min_popularity: i32,
    canonical_tracks: &[ScoredTrack],
    lrclib_index: &FxHashMap<(String, String), Vec<usize>>,
) -> Result<Vec<Option<SpotifyTrack>>> {
    println!("[SPOTIFY] Streaming tracks with popularity >= {} and matching on-the-fly...", min_popularity);

    // Get count for progress bar
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE popularity >= ?",
        [min_popularity],
        |row| row.get(0),
    )?;

    let pb = create_progress_bar(count as u64, "Streaming Spotify & matching");

    // Join tracks + artists using correlated subquery for primary artist
    let sql = r#"
        SELECT
            t.id,
            t.name,
            a.name as artist_name,
            t.duration_ms,
            t.popularity,
            t.external_id_isrc,
            t.album_rowid
        FROM tracks t
        JOIN artists a ON a.rowid = (
            SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
        )
        WHERE t.popularity >= ?
    "#;

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([min_popularity])?;

    // One slot per canonical LRCLIB track - stores best Spotify match
    let mut best_matches: Vec<Option<SpotifyTrack>> = vec![None; canonical_tracks.len()];
    let mut scanned_count: u64 = 0;
    let mut match_count: u64 = 0;

    while let Some(row) = rows.next()? {
        let spotify_track = SpotifyTrack {
            id: row.get(0)?,
            name: row.get(1)?,
            artist: row.get(2)?,
            duration_ms: row.get(3)?,
            popularity: row.get(4)?,
            isrc: row.get(5)?,
            album_rowid: row.get(6)?,
        };

        // Normalize and lookup in LRCLIB index
        let title_norm = normalize_title(&spotify_track.name);
        let artist_norm = normalize_artist(&spotify_track.artist);
        let key = (title_norm, artist_norm);

        if let Some(lrclib_indices) = lrclib_index.get(&key) {
            let spotify_duration_sec = spotify_track.duration_ms / 1000;

            for &idx in lrclib_indices {
                let lrclib = &canonical_tracks[idx];

                // Duration filter: ±10 seconds
                if (lrclib.track.duration_sec - spotify_duration_sec).abs() > 10 {
                    continue;
                }

                // Keep best match by popularity
                match &best_matches[idx] {
                    Some(current) if current.popularity >= spotify_track.popularity => {}
                    _ => {
                        if best_matches[idx].is_none() {
                            match_count += 1;
                        }
                        best_matches[idx] = Some(spotify_track.clone());
                    }
                }
            }
        }

        scanned_count += 1;
        pb.inc(1);
    }

    let match_rate = if !canonical_tracks.is_empty() {
        100.0 * match_count as f64 / canonical_tracks.len() as f64
    } else {
        0.0
    };

    pb.finish_with_message(format!(
        "[SPOTIFY] Scanned {} tracks, matched {} LRCLIB tracks ({:.1}%)",
        scanned_count, match_count, match_rate
    ));

    Ok(best_matches)
}

/// Load audio features into FxHashMap, filtered to only needed track IDs.
/// This avoids loading 40M+ rows - only keeps features for matched tracks.
fn load_audio_features_filtered(
    conn: &Connection,
    needed_ids: &FxHashSet<String>,
) -> Result<FxHashMap<String, AudioFeatures>> {
    println!("[AUDIO] Loading audio features (filtered to {} needed IDs)...", needed_ids.len());

    let count: i64 =
        conn.query_row("SELECT COUNT(*) FROM track_audio_features", [], |row| row.get(0))?;
    let pb = create_progress_bar(count as u64, "Streaming audio features");

    // Actual schema: track_audio_features with track_id (Spotify ID string), tempo is INTEGER
    let sql = "SELECT track_id, tempo, key, mode, time_signature FROM track_audio_features";
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;

    let mut lookup: FxHashMap<String, AudioFeatures> = FxHashMap::default();

    while let Some(row) = rows.next()? {
        let track_id: String = row.get(0)?;
        
        // Only keep if in our needed set
        if !needed_ids.contains(&track_id) {
            pb.inc(1);
            continue;
        }

        // tempo is REAL in actual schema
        let features = AudioFeatures {
            tempo: row.get(1)?,
            key: row.get(2)?,
            mode: row.get(3)?,
            time_signature: row.get(4)?,
        };
        lookup.insert(track_id, features);
        pb.inc(1);
    }

    pb.finish_with_message(format!(
        "[AUDIO] Loaded {} audio features (filtered from {} total)",
        lookup.len(),
        count
    ));
    Ok(lookup)
}

/// Collect needed Spotify track IDs and album rowids from best matches
fn collect_needed_ids(best_matches: &[Option<SpotifyTrack>]) -> (FxHashSet<String>, FxHashSet<i64>) {
    let mut track_ids: FxHashSet<String> = FxHashSet::default();
    let mut album_rowids: FxHashSet<i64> = FxHashSet::default();
    
    for m in best_matches {
        if let Some(s) = m {
            track_ids.insert(s.id.clone());
            album_rowids.insert(s.album_rowid);
        }
    }
    
    println!("[COLLECT] Need {} track IDs and {} album rowids", track_ids.len(), album_rowids.len());
    (track_ids, album_rowids)
}

/// Load album image URLs filtered to only needed album rowids.
/// We select medium size (~300px) for optimal mobile display.
fn load_album_images_filtered(
    conn: &Connection,
    needed_album_rowids: &FxHashSet<i64>,
) -> Result<FxHashMap<i64, String>> {
    println!("[IMAGES] Loading album images (filtered to {} albums)...", needed_album_rowids.len());

    // Select images closest to 300px (medium size)
    let sql = r#"
        SELECT album_rowid, url
        FROM album_images
        WHERE height BETWEEN 250 AND 350
        ORDER BY album_rowid, ABS(height - 300)
    "#;
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;

    let mut lookup: FxHashMap<i64, String> = FxHashMap::default();

    while let Some(row) = rows.next()? {
        let album_rowid: i64 = row.get(0)?;
        
        // Only keep if in our needed set
        if !needed_album_rowids.contains(&album_rowid) {
            continue;
        }
        
        let url: String = row.get(1)?;
        // Only keep first (closest to 300px) per album
        lookup.entry(album_rowid).or_insert(url);
    }

    println!("[IMAGES] Loaded {} album image URLs", lookup.len());
    Ok(lookup)
}

/// Enrich canonical LRCLIB tracks with pre-matched Spotify data.
/// LRCLIB is the source of truth — Spotify data is nullable enrichment.
fn enrich_tracks_with_matches(
    canonical: Vec<ScoredTrack>,
    best_matches: Vec<Option<SpotifyTrack>>,
    audio_lookup: &FxHashMap<String, AudioFeatures>,
    image_lookup: &FxHashMap<i64, String>,
) -> Vec<EnrichedTrack> {
    let pb = create_progress_bar(canonical.len() as u64, "Enriching with Spotify");

    let enriched: Vec<EnrichedTrack> = canonical
        .into_iter()
        .zip(best_matches.into_iter())
        .map(|(lrclib, spotify_match)| {
            let enrichment = match spotify_match {
                Some(ref s) => {
                    let features = audio_lookup.get(&s.id);
                    let album_image = image_lookup.get(&s.album_rowid).cloned();

                    (
                        Some(s.id.clone()),
                        Some(s.popularity),
                        features.and_then(|f| f.tempo),
                        features.and_then(|f| f.key),
                        features.and_then(|f| f.mode),
                        features.and_then(|f| f.time_signature),
                        s.isrc.clone(),
                        album_image,
                    )
                }
                None => (None, None, None, None, None, None, None, None),
            };

            pb.inc(1);

            EnrichedTrack {
                // LRCLIB (source of truth, always present)
                lrclib_id: lrclib.track.id,
                title: lrclib.track.title,
                artist: lrclib.track.artist,
                album: lrclib.track.album,
                duration_sec: lrclib.track.duration_sec,
                title_norm: lrclib.title_norm,
                artist_norm: lrclib.artist_norm,
                quality: lrclib.quality,
                // Spotify (enrichment, nullable)
                spotify_id: enrichment.0,
                popularity: enrichment.1,
                tempo: enrichment.2,
                musical_key: enrichment.3,
                mode: enrichment.4,
                time_signature: enrichment.5,
                isrc: enrichment.6,
                album_image_url: enrichment.7,
            }
        })
        .collect();

    let matched_count = enriched.iter().filter(|t| t.spotify_id.is_some()).count();
    let match_rate = if !enriched.is_empty() {
        100.0 * matched_count as f64 / enriched.len() as f64
    } else {
        0.0
    };

    pb.finish_with_message(format!(
        "Enriched {} tracks ({} with Spotify match, {:.1}%)",
        enriched.len(),
        matched_count,
        match_rate
    ));

    enriched
}

/// Convert ScoredTrack to EnrichedTrack with NULL Spotify fields
fn convert_to_enriched_without_spotify(tracks: Vec<ScoredTrack>) -> Vec<EnrichedTrack> {
    tracks
        .into_iter()
        .map(|t| EnrichedTrack {
            // LRCLIB (source of truth)
            lrclib_id: t.track.id,
            title: t.track.title,
            artist: t.track.artist,
            album: t.track.album,
            duration_sec: t.track.duration_sec,
            title_norm: t.title_norm,
            artist_norm: t.artist_norm,
            quality: t.quality,
            // Spotify (all NULL when no enrichment)
            spotify_id: None,
            popularity: None,
            tempo: None,
            musical_key: None,
            mode: None,
            time_signature: None,
            isrc: None,
            album_image_url: None,
        })
        .collect()
}

/// Write enriched tracks to output database
fn write_enriched_output(conn: &mut Connection, tracks: &[EnrichedTrack]) -> Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -64000;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE tracks (
            -- LRCLIB (source of truth, always present)
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT,
            duration_sec INTEGER NOT NULL,
            title_norm TEXT NOT NULL,
            artist_norm TEXT NOT NULL,
            quality INTEGER NOT NULL,

            -- Spotify enrichment (all nullable, NULL = no match)
            spotify_id TEXT,
            popularity INTEGER,
            tempo REAL,
            musical_key INTEGER,
            mode INTEGER,
            time_signature INTEGER,
            isrc TEXT,
            album_image_url TEXT
        );

        CREATE INDEX idx_tracks_spotify_id ON tracks(spotify_id);

        CREATE VIRTUAL TABLE tracks_fts USING fts5(
            title, artist,
            content='tracks',
            content_rowid='id',
            tokenize='porter'
        );",
    )?;

    let pb = create_progress_bar(tracks.len() as u64, "Phase 3: Writing enriched tracks");

    for chunk in tracks.chunks(WRITE_BATCH_SIZE) {
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO tracks (
                    id, title, artist, album, duration_sec,
                    title_norm, artist_norm, quality,
                    spotify_id, popularity, tempo, musical_key, mode, time_signature,
                    isrc, album_image_url
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            )?;

            for t in chunk {
                stmt.execute(params![
                    // LRCLIB (source of truth)
                    t.lrclib_id,
                    t.title,
                    t.artist,
                    t.album,
                    t.duration_sec,
                    t.title_norm,
                    t.artist_norm,
                    t.quality,
                    // Spotify (enrichment, nullable)
                    t.spotify_id,
                    t.popularity,
                    t.tempo,
                    t.musical_key,
                    t.mode,
                    t.time_signature,
                    t.isrc,
                    t.album_image_url,
                ])?;
                pb.inc(1);
            }
        }
        tx.commit()?;
    }

    pb.finish_with_message(format!("Phase 3: Wrote {} enriched tracks", tracks.len()));
    Ok(())
}

/// Test search with enrichment data display
fn test_search_enriched(conn: &Connection, query: &str) -> Result<()> {
    println!("\nSearch results for '{}':", query);
    println!("{:-<100}", "");

    let mut stmt = conn.prepare(
        "SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality,
                t.tempo, t.musical_key, t.mode, t.popularity
         FROM tracks_fts fts
         JOIN tracks t ON fts.rowid = t.id
         WHERE tracks_fts MATCH ?1
         ORDER BY COALESCE(t.popularity, 0) DESC, t.quality DESC
         LIMIT 10",
    )?;

    let mut rows = stmt.query([query])?;
    let mut count = 0;

    while let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        let title: String = row.get(1)?;
        let artist: String = row.get(2)?;
        let album: Option<String> = row.get(3)?;
        let duration: i64 = row.get(4)?;
        let quality: i32 = row.get(5)?;
        let tempo: Option<f64> = row.get(6)?;
        let musical_key: Option<i32> = row.get(7)?;
        let mode: Option<i32> = row.get(8)?;
        let popularity: Option<i32> = row.get(9)?;

        // Format key if available
        let key_str = match (musical_key, mode) {
            (Some(k), Some(m)) if k >= 0 && k <= 11 => {
                let pitch_classes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
                let mode_str = if m == 1 { "major" } else { "minor" };
                format!("key={} {}", pitch_classes[k as usize], mode_str)
            }
            _ => String::new(),
        };

        // Format tempo if available
        let tempo_str = tempo.map_or(String::new(), |t| format!("tempo={:.1}", t));

        // Format popularity if available
        let pop_str = popularity.map_or("no match".to_string(), |p| format!("pop={}", p));

        println!(
            "[{}] {} - {} ({}) [{}s] quality={} {} {} {}",
            id,
            artist,
            title,
            album.unwrap_or_else(|| "Unknown".to_string()),
            duration,
            quality,
            tempo_str,
            key_str,
            pop_str
        );
        count += 1;
    }

    if count == 0 {
        println!("No results found.");
    }

    Ok(())
}

fn main() -> Result<()> {
    let args = Args::parse();

    if args.workers > 0 {
        rayon::ThreadPoolBuilder::new()
            .num_threads(args.workers)
            .build_global()
            .context("Failed to set thread pool size")?;
    }

    let start = Instant::now();

    // Phase 1: Read LRCLIB tracks (source of truth)
    println!("Opening source database: {:?}", args.source);
    let source_conn = Connection::open(&args.source)
        .context("Failed to open source database")?;

    source_conn.execute_batch(
        "PRAGMA mmap_size = 8589934592;
         PRAGMA cache_size = -1000000;
         PRAGMA temp_store = MEMORY;",
    )?;

    let artist_filter: Option<Vec<String>> = args.artists.map(|s| {
        s.split(',').map(|a| a.trim().to_string()).collect()
    });

    if let Some(ref artists) = artist_filter {
        println!("Filtering by artists: {:?}", artists);
    }

    let tracks = read_tracks(&source_conn, artist_filter.as_ref())?;
    drop(source_conn);

    // Phase 2: Group & select canonical (before Spotify to build index)
    let groups = group_tracks(tracks);
    println!("\nFound {} unique (title, artist) groups", groups.len());

    let canonical_tracks = process_groups(groups);

    // Phase 3: Spotify enrichment (streaming approach)
    let enriched_tracks = if let Some(ref spotify_path) = args.spotify {
        // Build LRCLIB index for streaming match
        let lrclib_index = build_lrclib_index(&canonical_tracks);

        // Open Spotify DB with read-only optimizations
        println!("\nOpening Spotify database: {:?}", spotify_path);
        let spotify_conn = Connection::open(spotify_path)
            .context("Failed to open Spotify database")?;
        spotify_conn.execute_batch(
            "PRAGMA query_only = 1;
             PRAGMA journal_mode = OFF;
             PRAGMA synchronous = OFF;
             PRAGMA temp_store = MEMORY;
             PRAGMA cache_size = -500000;
             PRAGMA mmap_size = 8589934592;
             PRAGMA locking_mode = EXCLUSIVE;",
        )?;

        // Stream Spotify and match on-the-fly (doesn't load all 45M into memory)
        let best_matches = stream_match_spotify(
            &spotify_conn,
            args.min_popularity,
            &canonical_tracks,
            &lrclib_index,
        )?;

        // Collect IDs we actually need for audio features and images
        let (needed_track_ids, needed_album_rowids) = collect_needed_ids(&best_matches);

        // Load audio features filtered to matched tracks only
        let audio_lookup = if let Some(ref af_path) = args.audio_features {
            println!("\nOpening audio features database: {:?}", af_path);
            let af_conn = Connection::open(af_path)
                .context("Failed to open audio features database")?;
            af_conn.execute_batch(
                "PRAGMA query_only = 1;
                 PRAGMA journal_mode = OFF;
                 PRAGMA synchronous = OFF;
                 PRAGMA temp_store = MEMORY;
                 PRAGMA cache_size = -500000;
                 PRAGMA mmap_size = 8589934592;
                 PRAGMA locking_mode = EXCLUSIVE;",
            )?;
            load_audio_features_filtered(&af_conn, &needed_track_ids)?
        } else {
            FxHashMap::default()
        };

        // Load album images filtered to matched albums only
        let image_lookup = load_album_images_filtered(&spotify_conn, &needed_album_rowids)?;

        // Enrich using pre-matched data
        println!("\nEnriching with Spotify data...");
        enrich_tracks_with_matches(canonical_tracks, best_matches, &audio_lookup, &image_lookup)
    } else {
        // No Spotify data: convert to EnrichedTrack with NULL Spotify fields
        convert_to_enriched_without_spotify(canonical_tracks)
    };

    // Phase 3: Write output
    if args.output.exists() {
        std::fs::remove_file(&args.output)
            .context("Failed to remove existing output file")?;
    }

    println!("\nCreating output database: {:?}", args.output);
    let mut output_conn = Connection::open(&args.output)
        .context("Failed to create output database")?;

    write_enriched_output(&mut output_conn, &enriched_tracks)?;

    // Phase 4-5: FTS & optimize
    build_fts_index(&output_conn)?;
    optimize_database(&output_conn)?;

    let elapsed = start.elapsed();
    let file_size = std::fs::metadata(&args.output)?.len();

    // Calculate match statistics
    let matched_count = enriched_tracks.iter().filter(|t| t.spotify_id.is_some()).count();
    let match_rate = if !enriched_tracks.is_empty() {
        100.0 * matched_count as f64 / enriched_tracks.len() as f64
    } else {
        0.0
    };

    println!("\n{:=<60}", "");
    println!("Extraction complete!");
    println!("  Tracks: {}", enriched_tracks.len());
    if args.spotify.is_some() {
        println!("  Spotify matches: {} ({:.1}%)", matched_count, match_rate);
    }
    println!("  Output size: {:.2} MB", file_size as f64 / 1_048_576.0);
    println!("  Elapsed: {:.2}s", elapsed.as_secs_f64());
    println!("{:=<60}", "");

    if let Some(query) = args.test {
        test_search_enriched(&output_conn, &query)?;
    }

    Ok(())
}
