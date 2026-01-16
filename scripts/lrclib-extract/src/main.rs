mod normalize;

use anyhow::{Context, Result};
use clap::Parser;
use indicatif::{ProgressBar, ProgressStyle};
use lrclib_extract::safety::validate_output_path;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use regex::Regex;
use rusqlite::Connection;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use strsim::normalized_levenshtein;

use normalize::{
    extract_primary_artist, normalize_artist, normalize_title, normalize_title_with_artist,
};

// ============================================================================
// String Interning for Memory Optimization
// ============================================================================

/// String interner for deduplicating normalized strings during grouping.
/// Reduces memory usage when many tracks share the same artist/title.
/// Similar to normalize-spotify optimization that saved 40M allocations.
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

    /// Number of unique strings interned.
    fn len(&self) -> usize {
        self.strings.len()
    }
}

// ============================================================================
// Timing Helper
// ============================================================================

/// Format duration in human-readable format
fn format_duration(d: std::time::Duration) -> String {
    let secs = d.as_secs_f64();
    if secs < 60.0 {
        format!("{:.1}s", secs)
    } else {
        let mins = secs / 60.0;
        format!("{:.1}m", mins)
    }
}

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

    /// Path to spotify_clean.sqlite3 (for enrichment, requires --audio-features)
    #[arg(long, requires = "audio_features")]
    spotify: Option<PathBuf>,

    /// Path to spotify_normalized.sqlite3 (pre-normalized Spotify data for faster matching)
    /// If provided, uses inverted lookup: LRCLIB → Spotify instead of streaming Spotify
    #[arg(long)]
    spotify_normalized: Option<PathBuf>,

    /// Path to spotify_clean_audio_features.sqlite3 (required with --spotify for tempo/key/mode)
    #[arg(long, requires = "spotify")]
    audio_features: Option<PathBuf>,

    /// Minimum Spotify popularity (0-100). Default 0 = include all.
    /// Popularity used for ranking, not filtering - all LRCLIB entries should be enriched.
    #[arg(long, default_value = "0")]
    min_popularity: i32,

    #[arg(long, default_value = "0")]
    workers: usize,

    #[arg(long)]
    test: Option<String>,

    /// Filter by artist names (comma-separated, case-insensitive)
    #[arg(long)]
    artists: Option<String>,

    /// Disable progress bars, use log output only (for background runs)
    #[arg(long)]
    log_only: bool,

    /// Export stats to JSON file (spec-07 instrumentation)
    #[arg(long)]
    export_stats: Option<PathBuf>,

    /// Log match failures to match_failures table (adds ~100MB to output)
    #[arg(long)]
    log_failures: bool,
}

#[allow(dead_code)]
const WRITE_BATCH_SIZE: usize = 10_000; // Legacy, replaced by ENRICHED_BATCH_SIZE

// Score thresholds for combined scoring (spec-04)
const ACCEPT_THRESHOLD: i32 = 80; // Minimum score to accept a match
#[allow(dead_code)]
const LOW_CONFIDENCE_THRESHOLD: i32 = 120; // Below this, log as low-confidence

// ============================================================================
// Instrumentation Framework (spec-07)
// ============================================================================

/// Per-phase matching statistics for instrumentation (spec-07).
/// Tracks counts and rates for each matching phase to measure improvements.
#[derive(Default, Debug, Clone, Serialize)]
pub struct MatchingStats {
    // Phase 1: Main index lookup
    pub main_exact_matches: usize,
    pub main_primary_artist_fallback: usize,
    pub main_no_candidates: usize,
    pub main_all_rejected: usize,

    // Phase 2: Title-first rescue pass (spec-06)
    pub rescue_attempted: usize,
    pub rescue_skipped_common_title: usize,
    pub rescue_matches: usize,
    pub rescue_rejected_low_similarity: usize,
    pub rescue_rejected_duration: usize,

    // Phase 2b: Fuzzy title matching (new)
    pub fuzzy_title_attempted: usize,
    pub fuzzy_title_matches: usize,
    pub fuzzy_title_no_artist: usize, // Artist not found in Spotify
    pub fuzzy_title_no_close_match: usize, // No title with >=90% similarity

    // Phase 2c: Album upgrade pass (promote Single/Compilation to Album)
    pub album_upgrade_candidates: usize, // Groups with non-Album match and score >= 80
    pub album_upgrades: usize,           // Groups upgraded to Album release

    // Phase 3: Pop=0 fallback (spec-04: includes previously-rejected groups)
    pub pop0_eligible: usize,
    pub pop0_from_no_candidates: usize, // Groups that never had candidates
    pub pop0_from_rejected: usize,      // Groups that had candidates but all rejected
    pub pop0_matches: usize,

    // Duration statistics
    pub duration_matches_0_to_2: usize,
    pub duration_matches_3_to_5: usize,
    pub duration_matches_6_to_10: usize,
    pub duration_matches_11_to_15: usize,
    pub duration_matches_16_to_30: usize,

    // Adaptive duration relaxation (spec-05)
    pub duration_relaxed_31_to_45: usize,
    pub duration_relaxed_46_to_60: usize,
    pub duration_relaxed_61_plus: usize,

    // Multi-artist verification (spec-03)
    pub multi_artist_rescues: usize, // Matches where secondary artist matched

    // Final totals
    pub total_groups: usize,
    pub total_matches: usize,
    pub total_failures: usize,

    // Timing
    pub elapsed_seconds: f64,
}

impl MatchingStats {
    /// Calculate match rate as a percentage
    pub fn match_rate(&self) -> f64 {
        if self.total_groups == 0 {
            0.0
        } else {
            100.0 * self.total_matches as f64 / self.total_groups as f64
        }
    }

    /// Log stats to stderr in JSON format
    pub fn log_phase(&self, phase: &str) {
        if let Ok(json) = serde_json::to_string_pretty(self) {
            eprintln!("[STATS:{}]\n{}", phase, json);
        }
    }

    /// Write stats to a JSON file
    pub fn write_to_file(&self, path: &std::path::Path) -> anyhow::Result<()> {
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)?;
        Ok(())
    }

    /// Record duration bucket for a match based on duration diff in seconds
    pub fn record_duration_bucket(&mut self, diff_sec: i64) {
        match diff_sec.abs() {
            0..=2 => self.duration_matches_0_to_2 += 1,
            3..=5 => self.duration_matches_3_to_5 += 1,
            6..=10 => self.duration_matches_6_to_10 += 1,
            11..=15 => self.duration_matches_11_to_15 += 1,
            16..=30 => self.duration_matches_16_to_30 += 1,
            31..=45 => self.duration_relaxed_31_to_45 += 1,
            46..=60 => self.duration_relaxed_46_to_60 += 1,
            _ => self.duration_relaxed_61_plus += 1,
        }
    }

    /// Returns total count of relaxed duration matches (>30s diff)
    pub fn total_relaxed_matches(&self) -> usize {
        self.duration_relaxed_31_to_45
            + self.duration_relaxed_46_to_60
            + self.duration_relaxed_61_plus
    }
}

#[derive(Clone, Debug)]
struct Track {
    id: i64,
    title: String,
    artist: String,
    album: Option<String>,
    duration_sec: i64,
}

/// Scored track with precomputed normalized strings (used by old pipeline).
/// Kept for backward compatibility. New pipeline uses LrclibGroup + LrclibVariant.
#[allow(dead_code)]
#[derive(Clone, Debug)]
struct ScoredTrack {
    track: Track,
    title_norm: String,
    artist_norm: String,
    quality: i32,
}

/// Group of LRCLIB tracks sharing (title_norm, artist_norm).
/// Used for delayed canonical selection - keeps all variants until Spotify matching.
#[derive(Clone, Debug)]
struct LrclibGroup {
    key: (String, String), // (title_norm, artist_norm) stored ONCE per group
    tracks: Vec<LrclibVariant>,
    best_match: Option<(usize, SpotifyTrack, i32)>, // (track_idx, spotify_track, score)
}

/// LRCLIB track variant within a group (without redundant normalized strings).
/// title_norm and artist_norm are stored once in the parent LrclibGroup.key.
#[derive(Clone, Debug)]
struct LrclibVariant {
    track: Track,
    quality: i32, // LRCLIB-only quality score
}

/// Index mapping (title_norm, artist_norm) to group index in Vec<LrclibGroup>
type LrclibIndex = FxHashMap<(String, String), usize>;

/// Title-only index for initial filtering before artist lookup (2-phase matching)
type TitleOnlyIndex = FxHashMap<String, Vec<usize>>;

/// Spotify album type for preferring canonical releases over compilations.
/// Used as primary ranking dimension when selecting among viable match candidates.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpotifyAlbumType {
    Album,
    Single,
    Compilation,
    Unknown,
}

impl SpotifyAlbumType {
    /// Rank for sorting: lower is better (album < single < compilation < unknown)
    pub fn rank(self) -> i32 {
        match self {
            SpotifyAlbumType::Album => 0,
            SpotifyAlbumType::Single => 1,
            SpotifyAlbumType::Compilation => 2,
            SpotifyAlbumType::Unknown => 3,
        }
    }
}

impl From<Option<&str>> for SpotifyAlbumType {
    fn from(s: Option<&str>) -> Self {
        match s {
            Some("album") => SpotifyAlbumType::Album,
            Some("single") => SpotifyAlbumType::Single,
            Some("compilation") => SpotifyAlbumType::Compilation,
            _ => SpotifyAlbumType::Unknown,
        }
    }
}

/// Minimum match score threshold for album_type preference to apply.
/// Candidates below this threshold are considered non-viable and won't benefit
/// from album_type preference over viable candidates.
const MIN_VIABLE_MATCH_SCORE: i32 = 80;

/// Check if a new candidate beats the current best using album_type-aware ranking.
///
/// Selection logic (DBA spec Section 6.2 + 7):
/// 1. Viable candidates (score >= MIN_VIABLE_MATCH_SCORE) always beat non-viable ones
/// 2. Among viable candidates: prefer lower album_type.rank(), then higher score
/// 3. Among non-viable candidates: prefer higher score (fallback behavior)
///
/// Returns true if the new candidate should replace the current best.
fn is_better_match(
    new_score: i32,
    new_album_type: SpotifyAlbumType,
    current_score: i32,
    current_album_type: SpotifyAlbumType,
) -> bool {
    let new_viable = new_score >= MIN_VIABLE_MATCH_SCORE;
    let current_viable = current_score >= MIN_VIABLE_MATCH_SCORE;

    match (new_viable, current_viable) {
        // New is viable, current is not -> new wins
        (true, false) => true,
        // Current is viable, new is not -> current wins
        (false, true) => false,
        // Both viable -> compare by (album_type.rank(), -score)
        (true, true) => {
            let new_rank = new_album_type.rank();
            let current_rank = current_album_type.rank();
            if new_rank != current_rank {
                new_rank < current_rank // Lower rank is better
            } else {
                new_score > current_score // Higher score is better
            }
        }
        // Neither viable -> compare by score only (fallback)
        (false, false) => new_score > current_score,
    }
}

/// Spotify track info for matching
#[derive(Clone, Debug)]
struct SpotifyTrack {
    id: String, // Spotify track ID (e.g., "2takcwOaAZWiXQijPHIx7B")
    #[allow(dead_code)]
    name: String, // Original title (kept for debugging)
    #[allow(dead_code)]
    artist: String, // Primary artist (kept for debugging)
    artists: Vec<String>, // All credited artists (spec-03 multi-artist verification)
    duration_ms: i64,
    popularity: i32,              // 0-100
    isrc: Option<String>,         // For Deezer album art lookup
    album_rowid: i64,             // For album_images lookup
    album_type: SpotifyAlbumType, // For preferring albums over compilations
}

/// Partial Spotify track (before artist lookup) for 2-phase matching.
/// Used in optimized streaming: Phase A fetches tracks only, Phase B batch-fetches artists.
/// Note: Not yet used in current implementation but kept for future optimization.
#[allow(dead_code)]
#[derive(Clone, Debug)]
struct SpotifyTrackPartial {
    rowid: i64,   // SQLite rowid for artist lookup
    id: String,   // Spotify track ID
    name: String, // Original title
    duration_ms: i64,
    popularity: i32,      // 0-100
    isrc: Option<String>, // For Deezer album art lookup
    album_rowid: i64,     // For album_images lookup
}

/// Audio features from Spotify
#[derive(Clone, Debug)]
struct AudioFeatures {
    tempo: Option<f64>,          // BPM
    key: Option<i32>,            // -1 to 11 (pitch class)
    mode: Option<i32>,           // 0=minor, 1=major
    time_signature: Option<i32>, // 3-7
}

/// Spotify candidate for failure logging (spec-05).
/// Serialized to JSON for storage in match_failures table.
#[derive(Clone, Debug, Serialize)]
struct SpotifyCandidate {
    spotify_id: String,
    spotify_name: String,
    spotify_artist: String,
    spotify_duration_ms: i64,
    spotify_popularity: i32,
    duration_diff_sec: i64,
    score: i32,
    reject_reason: Option<String>,
}

/// Failure reason for match_failures logging (spec-05).
/// The fields in variants are metadata for debugging/analysis, not directly used in serialization.
#[derive(Clone, Debug)]
#[allow(dead_code)]
enum FailureReason {
    /// No Spotify tracks found for this (title_norm, artist_norm) key
    NoSpotifyCandidates,
    /// Spotify candidates found but all scored below threshold
    AllCandidatesRejected {
        candidate_count: usize,
        best_score: i32,
        primary_reject_reason: String,
    },
    /// Match accepted but score is marginal (between ACCEPT_THRESHOLD and LOW_CONFIDENCE_THRESHOLD)
    LowConfidenceMatch { accepted_score: i32, threshold: i32 },
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
    popularity: Option<i32>, // NULL if no match (not 0)
    tempo: Option<f64>,
    musical_key: Option<i32>,
    mode: Option<i32>,
    time_signature: Option<i32>,
    isrc: Option<String>,
    album_image_url: Option<String>, // Medium (300px) Spotify CDN URL
}

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
        "-",
        ".",
        "null",
        "unknown",
        "drumless",
        "karaoke",
        "tribute",
        "instrumental",
        "cover",
        "made famous",
        "in the style of",
        "backing track",
        "minus one",
    ]
});

// Patterns for titles to skip entirely (not just penalize)
static SKIP_TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        // "(Paused)" versions - incomplete/broken lyrics
        Regex::new(r"(?i)\(paused\)").unwrap(),
    ]
});

fn should_skip_title(title: &str) -> bool {
    SKIP_TITLE_PATTERNS.iter().any(|p| p.is_match(title))
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
            if lower.contains("live")
                || lower.contains("concert")
                || lower.contains("tour")
                || lower.contains("unplugged")
            {
                AlbumType::Live
            } else if lower.contains("greatest hits")
                || lower.contains("best of")
                || lower.contains("collection")
                || lower.contains("anthology")
                || lower.contains("essential")
            {
                AlbumType::Compilation
            } else if lower.contains("soundtrack")
                || lower.contains("ost")
                || lower.contains("motion picture")
            {
                AlbumType::Soundtrack
            } else if lower.contains("remaster") || lower.contains("reissue") {
                AlbumType::Remaster
            } else if lower.contains("deluxe")
                || lower.contains("expanded")
                || lower.contains("anniversary")
                || lower.contains("special")
                || lower.contains("collector")
            {
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

/// Graduated duration score (spec-04, spec-05).
/// Replaces hard ±10s cutoff with graduated scoring.
/// Extended in spec-05 to handle relaxed matches (31-60s) with very low scores.
/// Note: Exposed for unit tests and used internally by combined_score().
#[cfg_attr(not(test), allow(dead_code))]
fn duration_score(lrclib_sec: i64, spotify_ms: i64) -> i32 {
    let diff = (lrclib_sec - spotify_ms / 1000).abs();
    match diff {
        0..=2 => 100,  // Near-perfect
        3..=5 => 80,   // Excellent
        6..=10 => 50,  // Good
        11..=15 => 25, // Acceptable
        16..=30 => 10, // Poor but possible
        31..=45 => 5,  // Relaxed - very low (spec-05)
        46..=60 => 2,  // Relaxed - minimal (spec-05)
        _ => -1000,    // Hard reject beyond 60s
    }
}

/// Compute similarity between two normalized artist names (0.0 to 1.0).
/// Uses Jaccard similarity on word tokens.
fn compute_artist_similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }

    // Tokenize and compute Jaccard similarity
    let tokens_a: FxHashSet<&str> = a.split_whitespace().collect();
    let tokens_b: FxHashSet<&str> = b.split_whitespace().collect();

    if tokens_a.is_empty() || tokens_b.is_empty() {
        return 0.0;
    }

    let intersection = tokens_a.intersection(&tokens_b).count();
    let union = tokens_a.union(&tokens_b).count();

    intersection as f64 / union as f64
}

/// Multi-artist matching result (spec-03).
/// Returns the best similarity score across all credited artists, plus whether it was an exact match
/// Result includes best similarity score and whether it was an exact match.
#[derive(Debug, Clone)]
struct MultiArtistMatchResult {
    best_similarity: f64,
    is_exact: bool,
}

/// Score LRCLIB artist against all credited Spotify artists (spec-03 R3.2).
/// Uses max-over-artists to find the best match.
fn score_artist_multi(
    lrclib_artist_norm: &str,
    spotify_artists: &[String],
) -> MultiArtistMatchResult {
    if spotify_artists.is_empty() {
        return MultiArtistMatchResult {
            best_similarity: 0.0,
            is_exact: false,
        };
    }

    let mut best_similarity: f64 = 0.0;
    let mut best_is_exact = false;

    for artist in spotify_artists.iter() {
        let artist_norm = normalize_artist(artist);

        if artist_norm == lrclib_artist_norm {
            // Exact match found - this is the best possible
            return MultiArtistMatchResult {
                best_similarity: 1.0,
                is_exact: true,
            };
        }

        let similarity = compute_artist_similarity(&artist_norm, lrclib_artist_norm);
        if similarity > best_similarity {
            best_similarity = similarity;
            best_is_exact = false;
        }
    }

    MultiArtistMatchResult {
        best_similarity,
        is_exact: best_is_exact,
    }
}

/// Confidence level for matching (spec-05).
/// Determines duration tolerance based on title and artist match quality.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MatchConfidence {
    High,   // Exact title AND artist match
    Medium, // Exact title OR exact artist (not both)
    Low,    // Partial matches only
}

/// Calculate maximum duration tolerance based on confidence level (spec-05).
/// Higher confidence allows more relaxed duration matching.
fn max_duration_tolerance(confidence: MatchConfidence, track_duration_sec: i64) -> i64 {
    let base = match confidence {
        MatchConfidence::High => 60,   // High confidence: allow 60s
        MatchConfidence::Medium => 45, // Medium confidence: allow 45s
        MatchConfidence::Low => 30,    // Low confidence: keep strict
    };

    // For tracks > 5 min, allow up to 10% variance (spec-05 R5.2)
    let ratio_based = (track_duration_sec as f64 * 0.10) as i64;

    // Use larger of base or ratio-based, but cap at 90s
    base.max(ratio_based).min(90)
}

/// Combined scoring with guardrails against false positives (spec-04, spec-05, spec-03).
/// Returns score >= ACCEPT_THRESHOLD for acceptable matches, or negative for rejections.
///
/// Spec-03 changes:
/// - Multi-artist verification: score against ALL credited Spotify artists using max-over-artists
/// - Track when match came from secondary artist for stats
///
/// Spec-05 changes:
/// - Confidence-based duration tolerance (high confidence = 60s, medium = 45s, low = 30s)
/// - Graduated scoring continues beyond 30s for high-confidence matches
/// - Relaxed matches (>30s) require exact artist match
fn combined_score(
    lrclib: &Track,
    lrclib_quality: i32,
    spotify: &SpotifyTrack,
    group_artist_norm: &str,
) -> i32 {
    let spotify_duration_sec = spotify.duration_ms / 1000;
    let duration_diff = (lrclib.duration_sec - spotify_duration_sec).abs();

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Calculate artist match quality using multi-artist verification (spec-03)
    // Score LRCLIB artist against ALL credited Spotify artists
    // ═══════════════════════════════════════════════════════════════════════
    let artist_result = score_artist_multi(group_artist_norm, &spotify.artists);
    let artist_exact = artist_result.is_exact;
    let artist_similarity = artist_result.best_similarity;

    // Hard reject if artist similarity too low (no match against any credited artist)
    if artist_similarity < 0.3 {
        return -500; // Artist mismatch - reject
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Determine confidence level (spec-05 R5.1)
    // Title is assumed to match since we're querying by title_norm
    // ═══════════════════════════════════════════════════════════════════════
    let confidence = if artist_exact {
        MatchConfidence::High // Title + artist both exact
    } else if artist_similarity >= 0.7 {
        MatchConfidence::Medium // Title exact, artist partial
    } else {
        MatchConfidence::Low // Weak artist match
    };

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Adaptive duration tolerance based on confidence (spec-05)
    // ═══════════════════════════════════════════════════════════════════════
    let max_allowed_diff = max_duration_tolerance(confidence, spotify_duration_sec);
    if duration_diff > max_allowed_diff {
        return -1000;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Graduated duration scoring (spec-05 R5.3)
    // Extended to handle relaxed matches (31-60s) with very low scores
    // ═══════════════════════════════════════════════════════════════════════
    let dur_score = match duration_diff {
        0..=2 => 100,  // Near-perfect
        3..=5 => 80,   // Excellent
        6..=10 => 50,  // Good
        11..=15 => 25, // Acceptable
        16..=30 => 10, // Poor but possible
        31..=45 => 5,  // Relaxed - very low (spec-05)
        46..=60 => 2,  // Relaxed - minimal (spec-05)
        _ => 1,        // Beyond 60s - near-zero (spec-05)
    };

    let mut score = dur_score;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Artist score
    // ═══════════════════════════════════════════════════════════════════════
    let artist_score = if artist_exact {
        50 // Exact match
    } else {
        (artist_similarity * 30.0) as i32 // Partial credit
    };
    score += artist_score;

    // LRCLIB quality score (existing logic, typically -50 to +80)
    score += lrclib_quality;

    // Title cleanliness bonus
    if !has_garbage_title_pattern(&lrclib.title) {
        score += 30;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Relaxed match penalty (spec-05 R5.4)
    // For matches with >30s duration diff, require high confidence
    // ═══════════════════════════════════════════════════════════════════════
    if duration_diff > 30 {
        // Relaxed matches require exact artist match
        if !artist_exact {
            return -1000; // Reject relaxed match without exact artist
        }
        // Apply penalty to ensure relaxed matches need strong other signals
        score -= 20;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Popularity as tiebreaker only (bounded)
    // Keep influence bounded (0-10 points)
    // ═══════════════════════════════════════════════════════════════════════
    score += spotify.popularity / 10;

    score // Typical range: 80-250 for good matches
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
    let album_has_pattern = track
        .album
        .as_ref()
        .is_some_and(|a| has_live_remix_pattern(a));
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

/// Old canonical selection function (replaced by delayed canonical selection).
/// Kept for backward compatibility and potential rollback.
#[allow(dead_code)]
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

    let title_norm = normalize_title_with_artist(&tracks[0].title, &tracks[0].artist);
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
            a.quality
                .cmp(&b.quality)
                .then_with(|| b.track.id.cmp(&a.track.id))
        })
}

/// Global flag for log-only mode (set from args in main)
static LOG_ONLY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn create_progress_bar(len: u64, msg: &str) -> ProgressBar {
    let pb = ProgressBar::new(len);
    if LOG_ONLY.load(std::sync::atomic::Ordering::Relaxed) {
        pb.set_draw_target(indicatif::ProgressDrawTarget::hidden());
    } else {
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{msg} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({per_sec}, ETA: {eta})")
                .unwrap()
                .progress_chars("=> "),
        );
    }
    pb.set_message(msg.to_string());
    pb
}

/// Log progress periodically for tail-friendly output
fn log_progress(phase: &str, current: u64, total: u64, interval: u64) {
    if current % interval == 0 || current == total {
        let pct = 100.0 * current as f64 / total as f64;
        eprintln!("[{}] {}/{} ({:.1}%)", phase, current, total, pct);
    }
}

fn create_spinner(msg: &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();
    if LOG_ONLY.load(std::sync::atomic::Ordering::Relaxed) {
        pb.set_draw_target(indicatif::ProgressDrawTarget::hidden());
    } else {
        pb.set_style(
            ProgressStyle::default_spinner()
                .template("{msg} {spinner} [{elapsed_precise}]")
                .unwrap(),
        );
        pb.enable_steady_tick(std::time::Duration::from_millis(100));
    }
    pb.set_message(msg.to_string());
    pb
}

fn read_tracks(conn: &Connection, artist_filter: Option<&Vec<String>>) -> Result<Vec<Track>> {
    let phase_start = Instant::now();
    // Use optimized JOIN query instead of subquery (spec-02)
    // This changes: WHERE t.last_lyrics_id IN (SELECT id FROM lyrics WHERE has_synced_lyrics = 1)
    // To: FROM lyrics l JOIN tracks t ON t.last_lyrics_id = l.id WHERE l.has_synced_lyrics = 1
    // EXPLAIN shows: SEARCH l USING COVERING INDEX + SEARCH t USING INDEX (instead of LIST SUBQUERY)
    let (count_sql, select_sql) = if let Some(artists) = artist_filter {
        let placeholders: Vec<String> = artists
            .iter()
            .map(|_| "LOWER(t.artist_name) LIKE ?".to_string())
            .collect();
        let where_clause = placeholders.join(" OR ");
        (
            format!(
                "SELECT COUNT(*)
                 FROM lyrics l
                 JOIN tracks t ON t.last_lyrics_id = l.id
                 WHERE l.has_synced_lyrics = 1
                   AND t.duration > 45 AND t.duration < 600
                   AND ({})",
                where_clause
            ),
            format!(
                "SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
                 FROM lyrics l
                 JOIN tracks t ON t.last_lyrics_id = l.id
                 WHERE l.has_synced_lyrics = 1
                   AND t.duration > 45 AND t.duration < 600
                   AND ({})",
                where_clause
            ),
        )
    } else {
        (
            "SELECT COUNT(*)
             FROM lyrics l
             JOIN tracks t ON t.last_lyrics_id = l.id
             WHERE l.has_synced_lyrics = 1
               AND t.duration > 45 AND t.duration < 600"
                .to_string(),
            "SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
             FROM lyrics l
             JOIN tracks t ON t.last_lyrics_id = l.id
             WHERE l.has_synced_lyrics = 1
               AND t.duration > 45 AND t.duration < 600"
                .to_string(),
        )
    };

    let count: i64 = if let Some(artists) = artist_filter {
        let patterns: Vec<String> = artists
            .iter()
            .map(|a| format!("%{}%", a.to_lowercase()))
            .collect();
        let mut stmt = conn.prepare(&count_sql)?;
        let params: Vec<&dyn rusqlite::ToSql> =
            patterns.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        stmt.query_row(params.as_slice(), |row| row.get(0))?
    } else {
        conn.query_row(&count_sql, [], |row| row.get(0))?
    };

    let pb = create_progress_bar(count as u64, "Phase 1: Reading tracks");

    let mut stmt = conn.prepare(&select_sql)?;

    let mut tracks = Vec::with_capacity(count as usize);
    let mut rows = if let Some(artists) = artist_filter {
        let patterns: Vec<String> = artists
            .iter()
            .map(|a| format!("%{}%", a.to_lowercase()))
            .collect();
        let params: Vec<&dyn rusqlite::ToSql> =
            patterns.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        stmt.query(params.as_slice())?
    } else {
        stmt.query([])?
    };

    let mut read_count = 0u64;
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
        read_count += 1;
        log_progress("READ", read_count, count as u64, 500_000);
        pb.inc(1);
    }

    pb.finish_with_message(format!("Phase 1: Read {} valid tracks", tracks.len()));
    eprintln!(
        "[READ] Complete: {} tracks ({})",
        tracks.len(),
        format_duration(phase_start.elapsed())
    );
    Ok(tracks)
}

/// Old grouping function (replaced by build_groups_and_index for delayed canonical).
/// Kept for backward compatibility.
#[allow(dead_code)]
fn group_tracks(tracks: Vec<Track>) -> FxHashMap<(String, String), Vec<Track>> {
    let mut groups: FxHashMap<(String, String), Vec<Track>> = FxHashMap::default();

    for track in tracks {
        let key = (
            normalize_title_with_artist(&track.title, &track.artist),
            normalize_artist(&track.artist),
        );
        groups.entry(key).or_default().push(track);
    }

    groups
}

/// Build LRCLIB groups and index for delayed canonical selection (spec-03).
/// Returns (groups, index) where:
/// - groups: Vec<LrclibGroup> with ALL variants per group (not just best quality)
/// - index: FxHashMap<(title_norm, artist_norm), group_index>
///
/// Memory optimization: title_norm/artist_norm stored ONCE per group in key,
/// not per track. Uses string interning to reduce allocations during grouping.
fn build_groups_and_index(tracks: Vec<Track>) -> (Vec<LrclibGroup>, LrclibIndex) {
    let phase_start = Instant::now();
    let total_tracks = tracks.len();

    // Phase 1: Parallel normalization using rayon
    // Each thread normalizes tracks and builds a local map, then we merge
    eprintln!("[GROUP] Normalizing {} tracks (parallel)...", total_tracks);
    let norm_start = Instant::now();

    // Process in parallel: normalize and compute quality scores
    let normalized: Vec<(String, String, Track, i32)> = tracks
        .into_par_iter()
        .map(|track| {
            let title_norm = normalize_title_with_artist(&track.title, &track.artist);
            let artist_norm = normalize_artist(&track.artist);
            let quality = compute_quality_score(&track, None);
            (title_norm, artist_norm, track, quality)
        })
        .collect();

    eprintln!(
        "[GROUP] Normalization complete ({})",
        format_duration(norm_start.elapsed())
    );

    // Phase 2: Sequential grouping with string interning (interning requires &mut)
    eprintln!("[GROUP] Grouping with string interning...");
    let group_start = Instant::now();

    let mut interner = StringInterner::new();
    // Pre-allocate with estimate: ~38% of tracks become unique groups
    let estimated_groups = total_tracks * 38 / 100;
    let mut temp_groups: FxHashMap<(Arc<str>, Arc<str>), Vec<LrclibVariant>> =
        FxHashMap::with_capacity_and_hasher(estimated_groups, Default::default());

    for (title_norm, artist_norm, track, quality) in normalized {
        let title_arc = interner.intern(title_norm);
        let artist_arc = interner.intern(artist_norm);
        let variant = LrclibVariant { track, quality };
        temp_groups
            .entry((Arc::clone(&title_arc), Arc::clone(&artist_arc)))
            .or_default()
            .push(variant);
    }

    // Report interning stats
    let unique_strings = interner.len();
    let saved_allocations = total_tracks.saturating_sub(unique_strings / 2);
    eprintln!(
        "[GROUP] Interned {} unique strings (saved ~{} allocations) ({})",
        unique_strings,
        saved_allocations,
        format_duration(group_start.elapsed())
    );

    // Phase 3: Convert to Vec<LrclibGroup> and build index
    // Convert Arc<str> to String for the final output (keeps existing API)
    let mut groups: Vec<LrclibGroup> = Vec::with_capacity(temp_groups.len());
    let mut index: LrclibIndex =
        FxHashMap::with_capacity_and_hasher(temp_groups.len(), Default::default());

    for ((title_arc, artist_arc), variants) in temp_groups {
        let group_idx = groups.len();
        let key = (title_arc.to_string(), artist_arc.to_string());
        index.insert(key.clone(), group_idx);
        groups.push(LrclibGroup {
            key,
            tracks: variants,
            best_match: None,
        });
    }

    eprintln!(
        "[GROUP] Complete: {} groups with {} variants ({})",
        groups.len(),
        groups.iter().map(|g| g.tracks.len()).sum::<usize>(),
        format_duration(phase_start.elapsed())
    );

    (groups, index)
}

/// Build title-only index for initial Spotify filtering (2-phase matching).
/// Maps title_norm → Vec<group_idx> for fast title-based lookup before artist verification.
fn build_title_only_index(groups: &[LrclibGroup]) -> TitleOnlyIndex {
    let mut idx: TitleOnlyIndex = FxHashMap::default();
    for (group_idx, group) in groups.iter().enumerate() {
        let title_norm = &group.key.0;
        idx.entry(title_norm.clone()).or_default().push(group_idx);
    }
    idx
}

/// Old group processing function (replaced by delayed canonical pipeline).
/// Kept for backward compatibility.
#[allow(dead_code)]
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

    pb.finish_with_message(format!(
        "Phase 2: Selected {} canonical tracks",
        results.len()
    ));
    results
}

fn build_fts_index(conn: &Connection) -> Result<()> {
    let phase_start = Instant::now();

    // Step 1: Build tracks_fts (legacy, for backwards compatibility)
    let spinner = create_spinner("Phase 4a: Building tracks_fts index");
    conn.execute("INSERT INTO tracks_fts(tracks_fts) VALUES('rebuild')", [])?;
    spinner.finish_with_message("Phase 4a: tracks_fts index built");

    // Step 2: Populate tracks_search with popularity-ranked rows
    // search_id is assigned sequentially by popularity rank (1 = most popular)
    let spinner = create_spinner("Phase 4b: Populating tracks_search (popularity-ranked)");
    conn.execute_batch(
        "INSERT INTO tracks_search (search_id, track_id, title, artist, album, duration_sec,
                                    popularity, quality, spotify_id, tempo, isrc, album_image_url)
         SELECT
             ROW_NUMBER() OVER (
                 ORDER BY
                     popularity DESC NULLS LAST,
                     quality DESC,
                     id ASC
             ) as search_id,
             id as track_id,
             title,
             artist,
             album,
             duration_sec,
             popularity,
             quality,
             spotify_id,
             tempo,
             isrc,
             album_image_url
         FROM tracks;",
    )?;
    spinner.finish_with_message("Phase 4b: tracks_search populated");

    // Step 3: Build tracks_search_fts (fast popularity-ranked search)
    let spinner = create_spinner("Phase 4c: Building tracks_search_fts index");
    conn.execute(
        "INSERT INTO tracks_search_fts(tracks_search_fts) VALUES('rebuild')",
        [],
    )?;
    spinner.finish_with_message("Phase 4c: tracks_search_fts index built");

    // Step 4: Optimize both FTS indexes
    let spinner = create_spinner("Phase 4d: Optimizing FTS indexes");
    conn.execute("INSERT INTO tracks_fts(tracks_fts) VALUES('optimize')", [])?;
    conn.execute(
        "INSERT INTO tracks_search_fts(tracks_search_fts) VALUES('optimize')",
        [],
    )?;
    spinner.finish_with_message("Phase 4d: FTS indexes optimized");

    eprintln!(
        "[FTS] Complete ({})",
        format_duration(phase_start.elapsed())
    );
    Ok(())
}

fn optimize_database(conn: &Connection) -> Result<()> {
    let phase_start = Instant::now();
    let spinner = create_spinner("Phase 5: Optimizing database");

    conn.execute_batch("VACUUM; ANALYZE;")?;

    spinner.finish_with_message("Phase 5: Database optimized");
    eprintln!(
        "[OPTIMIZE] Complete ({})",
        format_duration(phase_start.elapsed())
    );
    Ok(())
}

// ============================================================================
// Spotify Enrichment Functions
// ============================================================================

/// Build LRCLIB index for streaming Spotify matching (old pipeline).
/// Returns FxHashMap: (title_norm, artist_norm) → Vec<index into canonical_tracks>
/// Replaced by build_groups_and_index() for delayed canonical selection.
#[allow(dead_code)]
fn build_lrclib_index(canonical_tracks: &[ScoredTrack]) -> FxHashMap<(String, String), Vec<usize>> {
    println!(
        "[LRCLIB] Building lookup index for {} canonical tracks...",
        canonical_tracks.len()
    );
    let mut index: FxHashMap<(String, String), Vec<usize>> = FxHashMap::default();
    for (idx, t) in canonical_tracks.iter().enumerate() {
        let key = (t.title_norm.clone(), t.artist_norm.clone());
        index.entry(key).or_default().push(idx);
    }
    println!(
        "[LRCLIB] Index built with {} unique (title, artist) keys",
        index.len()
    );
    index
}

/// Stream Spotify tracks and match against LRCLIB index on-the-fly (old pipeline).
/// Returns Vec<Option<SpotifyTrack>> aligned with canonical_tracks indices.
/// This avoids loading 45M+ Spotify tracks into memory.
/// Replaced by stream_and_match_spotify_delayed() for delayed canonical selection.
#[allow(dead_code)]
fn stream_match_spotify(
    conn: &Connection,
    min_popularity: i32,
    canonical_tracks: &[ScoredTrack],
    lrclib_index: &FxHashMap<(String, String), Vec<usize>>,
) -> Result<Vec<Option<SpotifyTrack>>> {
    println!(
        "[SPOTIFY] Streaming tracks with popularity >= {} and matching on-the-fly...",
        min_popularity
    );

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
            t.album_rowid,
            al.album_type
        FROM tracks t
        JOIN artists a ON a.rowid = (
            SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
        )
        LEFT JOIN albums al ON al.rowid = t.album_rowid
        WHERE t.popularity >= ?
    "#;

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([min_popularity])?;

    // One slot per canonical LRCLIB track - stores best Spotify match
    let mut best_matches: Vec<Option<SpotifyTrack>> = vec![None; canonical_tracks.len()];
    let mut scanned_count: u64 = 0;
    let mut match_count: u64 = 0;

    while let Some(row) = rows.next()? {
        let primary_artist: String = row.get(2)?;
        let album_type_str: Option<String> = row.get(7)?;
        let spotify_track = SpotifyTrack {
            id: row.get(0)?,
            name: row.get(1)?,
            artist: primary_artist.clone(),
            artists: vec![primary_artist.clone()], // Streaming gets only primary artist (spec-03: multi-artist via batch fetch)
            duration_ms: row.get(3)?,
            popularity: row.get(4)?,
            isrc: row.get(5)?,
            album_rowid: row.get(6)?,
            album_type: SpotifyAlbumType::from(album_type_str.as_deref()),
        };

        // Normalize and lookup in LRCLIB index
        let title_norm = normalize_title_with_artist(&spotify_track.name, &spotify_track.artist);
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
#[allow(dead_code)]
fn load_audio_features_filtered(
    conn: &Connection,
    needed_ids: &FxHashSet<String>,
) -> Result<FxHashMap<String, AudioFeatures>> {
    println!(
        "[AUDIO] Loading audio features (filtered to {} needed IDs)...",
        needed_ids.len()
    );

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM track_audio_features", [], |row| {
        row.get(0)
    })?;
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

/// Load audio features using batched IN queries (spec-02).
/// Much faster than streaming all 40M+ rows and filtering in Rust.
/// Uses the track_audio_features_track_id_unique index.
fn load_audio_features_batched(
    conn: &Connection,
    spotify_ids: &FxHashSet<String>,
) -> Result<FxHashMap<String, AudioFeatures>> {
    println!(
        "[AUDIO] Loading audio features (batched for {} IDs)...",
        spotify_ids.len()
    );

    let ids_vec: Vec<&String> = spotify_ids.iter().collect();
    let mut lookup: FxHashMap<String, AudioFeatures> = FxHashMap::default();

    if ids_vec.is_empty() {
        return Ok(lookup);
    }

    let pb = create_progress_bar(ids_vec.len() as u64, "Loading audio features");

    // Batch by 999 (SQLite parameter limit)
    for chunk in ids_vec.chunks(999) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!(
            "SELECT track_id, tempo, key, mode, time_signature
             FROM track_audio_features
             WHERE track_id IN ({})",
            placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> =
            chunk.iter().map(|s| *s as &dyn rusqlite::ToSql).collect();

        let mut rows = stmt.query(params.as_slice())?;
        while let Some(row) = rows.next()? {
            let track_id: String = row.get(0)?;
            let features = AudioFeatures {
                tempo: row.get(1)?,
                key: row.get(2)?,
                mode: row.get(3)?,
                time_signature: row.get(4)?,
            };
            lookup.insert(track_id, features);
            pb.inc(1);
        }
    }

    pb.finish_with_message(format!(
        "[AUDIO] Loaded {} audio features (batched)",
        lookup.len()
    ));
    Ok(lookup)
}

/// Stream Spotify tracks and match against LRCLIB groups using delayed canonical selection (spec-03).
/// Scores ALL variants in each group, keeping the best (variant, Spotify) pair.
/// Uses 2-phase approach: title-only filter → batch artist lookup → exact matching.
///
/// Also tracks which groups were seen (had at least one Spotify candidate) vs unseen,
/// for failure logging purposes.
fn stream_and_match_spotify_delayed(
    conn: &Connection,
    min_popularity: i32,
    groups: &mut [LrclibGroup],
    index: &LrclibIndex,
    title_only_index: &TitleOnlyIndex,
    groups_seen: &mut FxHashSet<usize>, // Track which groups had candidates
) -> Result<()> {
    println!(
        "[SPOTIFY] Streaming tracks with pop >= {} using delayed canonical matching...",
        min_popularity
    );

    // Get count for progress bar
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE popularity >= ?",
        [min_popularity],
        |row| row.get(0),
    )?;

    let pb = create_progress_bar(
        count as u64,
        "Streaming Spotify & matching (delayed canonical)",
    );

    // Phase A: Stream tracks only (no artist join - that's done later in batches)
    // For now we use the existing query with artist join since batch_fetch_primary_artists
    // would require collecting all candidate rowids first
    let sql = r#"
        SELECT
            t.id,
            t.name,
            a.name as artist_name,
            t.duration_ms,
            t.popularity,
            t.external_id_isrc,
            t.album_rowid,
            al.album_type
        FROM tracks t
        JOIN artists a ON a.rowid = (
            SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
        )
        LEFT JOIN albums al ON al.rowid = t.album_rowid
        WHERE t.popularity >= ?
    "#;

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([min_popularity])?;

    let mut scanned_count: u64 = 0;
    let mut groups_matched: u64 = 0;

    while let Some(row) = rows.next()? {
        let primary_artist: String = row.get(2)?;
        let album_type_str: Option<String> = row.get(7)?;
        let spotify_track = SpotifyTrack {
            id: row.get(0)?,
            name: row.get(1)?,
            artist: primary_artist.clone(),
            artists: vec![primary_artist.clone()], // Streaming gets only primary artist (spec-03: multi-artist via batch fetch)
            duration_ms: row.get(3)?,
            popularity: row.get(4)?,
            isrc: row.get(5)?,
            album_rowid: row.get(6)?,
            album_type: SpotifyAlbumType::from(album_type_str.as_deref()),
        };

        // Normalize Spotify track
        let title_norm = normalize_title_with_artist(&spotify_track.name, &spotify_track.artist);
        let artist_norm = normalize_artist(&spotify_track.artist);

        // Try exact (title, artist) match first
        if let Some(&group_idx) = index.get(&(title_norm.clone(), artist_norm.clone())) {
            let group = &mut groups[group_idx];
            let was_unmatched = group.best_match.is_none();
            groups_seen.insert(group_idx); // Track that this group had candidates

            // Score against ALL variants in this group
            for (track_idx, variant) in group.tracks.iter().enumerate() {
                let score = combined_score(
                    &variant.track,
                    variant.quality,
                    &spotify_track,
                    &group.key.1,
                );

                if score >= ACCEPT_THRESHOLD {
                    let should_replace = match &group.best_match {
                        Some((_, current_track, current_score)) => is_better_match(
                            score,
                            spotify_track.album_type,
                            *current_score,
                            current_track.album_type,
                        ),
                        None => true,
                    };
                    if should_replace {
                        group.best_match = Some((track_idx, spotify_track.clone(), score));
                    }
                }
            }

            if was_unmatched && group.best_match.is_some() {
                groups_matched += 1;
            }
        }
        // Also try title-only match for artist variations (feat., etc.)
        else if let Some(group_indices) = title_only_index.get(&title_norm) {
            for &group_idx in group_indices {
                let group = &mut groups[group_idx];
                let group_artist_norm = &group.key.1;

                // Compute artist similarity
                let artist_sim = compute_artist_similarity(&artist_norm, group_artist_norm);
                if artist_sim < 0.5 {
                    continue; // Skip if artists are too different
                }

                groups_seen.insert(group_idx); // Track that this group had candidates
                let was_unmatched = group.best_match.is_none();

                // Score against all variants with artist similarity penalty
                for (track_idx, variant) in group.tracks.iter().enumerate() {
                    let mut score = combined_score(
                        &variant.track,
                        variant.quality,
                        &spotify_track,
                        group_artist_norm,
                    );

                    // Penalize non-exact artist match
                    if artist_sim < 1.0 {
                        score -= ((1.0 - artist_sim) * 50.0) as i32;
                    }

                    if score >= ACCEPT_THRESHOLD {
                        let should_replace = match &group.best_match {
                            Some((_, current_track, current_score)) => is_better_match(
                                score,
                                spotify_track.album_type,
                                *current_score,
                                current_track.album_type,
                            ),
                            None => true,
                        };
                        if should_replace {
                            group.best_match = Some((track_idx, spotify_track.clone(), score));
                        }
                    }
                }

                if was_unmatched && group.best_match.is_some() {
                    groups_matched += 1;
                }
            }
        }

        scanned_count += 1;
        pb.inc(1);
    }

    let match_rate = if !groups.is_empty() {
        100.0 * groups_matched as f64 / groups.len() as f64
    } else {
        0.0
    };

    pb.finish_with_message(format!(
        "[SPOTIFY] Scanned {} tracks, matched {} groups ({:.1}%)",
        scanned_count, groups_matched, match_rate
    ));

    Ok(())
}

/// Match LRCLIB groups to Spotify using pre-normalized indexed DB (inverted lookup).
/// Uses batched queries against the indexed spotify_normalized.sqlite3.
/// Populates stats with match counts (spec-07 instrumentation).
fn match_lrclib_to_spotify_normalized(
    spotify_conn: &Connection,
    spotify_norm_path: &std::path::Path,
    groups: &mut [LrclibGroup],
    groups_seen: &mut FxHashSet<usize>,
    stats: &mut MatchingStats,
) -> Result<()> {
    let phase_start = Instant::now();
    println!("[MATCH] Matching LRCLIB groups to Spotify (indexed lookup)...");

    // Open normalized DB with read optimizations
    let norm_conn = Connection::open(spotify_norm_path)?;
    norm_conn.execute_batch(
        "PRAGMA query_only = 1;
         PRAGMA journal_mode = OFF;
         PRAGMA synchronous = OFF;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -500000;
         PRAGMA mmap_size = 8589934592;",
    )?;

    let pb = create_progress_bar(groups.len() as u64, "Matching LRCLIB → Spotify");

    // Maximum candidates to fetch per key (spec-02 R2.2)
    const MAX_CANDIDATES_PER_KEY: i64 = 20;

    // Phase 1: Lookup ALL candidate track_rowids per (title_norm, artist_norm) key (spec-02)
    // The new schema stores multiple candidates per key with different durations.
    // We fetch all candidates and score them to find the best duration match.
    // Structure: (group_idx, Vec<rowid>, is_fallback)
    let mut matches_to_fetch: Vec<(usize, Vec<i64>, bool)> = Vec::new();
    let mut fallback_matches_count = 0u64;
    let mut total_candidates = 0u64;

    // Prepare statement to fetch multiple candidates ordered by popularity (spec-02 R2.2)
    let mut lookup_stmt = norm_conn.prepare_cached(
        "SELECT track_rowid FROM track_norm WHERE title_norm = ? AND artist_norm = ? ORDER BY popularity DESC LIMIT ?"
    )?;

    let total_groups = groups.len() as u64;
    for (group_idx, group) in groups.iter().enumerate() {
        let title_norm = &group.key.0;
        let artist_norm = &group.key.1;

        // Try exact match first - fetch ALL candidates for this key
        let mut candidates: Vec<i64> = Vec::new();
        {
            let mut rows = lookup_stmt.query(rusqlite::params![
                title_norm,
                artist_norm,
                MAX_CANDIDATES_PER_KEY
            ])?;
            while let Some(row) = rows.next()? {
                candidates.push(row.get(0)?);
            }
        }

        if !candidates.is_empty() {
            total_candidates += candidates.len() as u64;
            matches_to_fetch.push((group_idx, candidates, false));
            groups_seen.insert(group_idx);
        } else {
            // Fallback: try primary artist only (e.g., "mustard, migos" → "mustard")
            if let Some(primary_artist) = extract_primary_artist(artist_norm) {
                let mut fallback_candidates: Vec<i64> = Vec::new();
                {
                    let mut rows = lookup_stmt.query(rusqlite::params![
                        title_norm,
                        &primary_artist,
                        MAX_CANDIDATES_PER_KEY
                    ])?;
                    while let Some(row) = rows.next()? {
                        fallback_candidates.push(row.get(0)?);
                    }
                }
                if !fallback_candidates.is_empty() {
                    total_candidates += fallback_candidates.len() as u64;
                    matches_to_fetch.push((group_idx, fallback_candidates, true));
                    groups_seen.insert(group_idx);
                    fallback_matches_count += 1;
                }
            }
        }

        let idx = group_idx as u64;
        log_progress("MATCH", idx + 1, total_groups, 500_000);
        if group_idx % 50_000 == 0 {
            pb.set_position(idx);
        }
    }
    pb.finish_with_message(format!(
        "[MATCH] Found {} groups with candidates ({} total candidates, {} via fallback)",
        matches_to_fetch.len(),
        total_candidates,
        fallback_matches_count
    ));
    eprintln!(
        "[MATCH] Complete: {} groups with candidates from {} groups ({} total candidates, avg {:.2} per group, {} via primary-artist fallback)",
        matches_to_fetch.len(), total_groups, total_candidates,
        if matches_to_fetch.is_empty() { 0.0 } else { total_candidates as f64 / matches_to_fetch.len() as f64 },
        fallback_matches_count
    );

    // Phase 2: Batch fetch track details for ALL candidates
    // Collect all unique rowids across all groups
    let all_rowids: Vec<i64> = matches_to_fetch
        .iter()
        .flat_map(|(_, rowids, _)| rowids.iter().copied())
        .collect::<FxHashSet<_>>()
        .into_iter()
        .collect();
    let fetch_start = Instant::now();
    eprintln!(
        "[FETCH] Fetching track details for {} unique candidates...",
        all_rowids.len()
    );
    let track_details = batch_fetch_track_details(spotify_conn, &all_rowids)?;
    eprintln!(
        "[FETCH] Complete: {} track details loaded ({})",
        track_details.len(),
        format_duration(fetch_start.elapsed())
    );

    // Phase 3: Score ALL candidates against ALL LRCLIB variants and select best (spec-02 R2.3)
    let pb2 = create_progress_bar(matches_to_fetch.len() as u64, "Scoring candidates");
    let mut groups_matched = 0u64;
    let mut exact_accepted = 0usize;
    let mut fallback_accepted = 0usize;
    let mut all_rejected = 0usize;

    for (i, (group_idx, candidate_rowids, is_fallback)) in matches_to_fetch.iter().enumerate() {
        let group = &mut groups[*group_idx];
        let was_unmatched = group.best_match.is_none();

        // Score ALL candidates against ALL variants in this group (spec-02 R2.3)
        for &track_rowid in candidate_rowids {
            if let Some(spotify_track) = track_details.get(&track_rowid) {
                for (track_idx, variant) in group.tracks.iter().enumerate() {
                    let score = combined_score(
                        &variant.track,
                        variant.quality,
                        spotify_track,
                        &group.key.1,
                    );

                    if score >= ACCEPT_THRESHOLD {
                        let should_replace = match &group.best_match {
                            Some((_, current_track, current_score)) => is_better_match(
                                score,
                                spotify_track.album_type,
                                *current_score,
                                current_track.album_type,
                            ),
                            None => true,
                        };
                        if should_replace {
                            group.best_match = Some((track_idx, spotify_track.clone(), score));
                        }
                    }
                }
            }
        }

        if was_unmatched && group.best_match.is_some() {
            groups_matched += 1;
            // Track stats by match type (spec-07)
            if *is_fallback {
                fallback_accepted += 1;
            } else {
                exact_accepted += 1;
            }
            // Record duration bucket for stats
            if let Some((track_idx, ref spotify, _)) = group.best_match {
                let lrclib_duration = group.tracks[track_idx].track.duration_sec;
                let diff_sec = lrclib_duration - spotify.duration_ms / 1000;
                stats.record_duration_bucket(diff_sec);
            }
        } else if was_unmatched && group.best_match.is_none() {
            // Had candidates but all were rejected
            all_rejected += 1;
        }

        if i % 10_000 == 0 {
            pb2.set_position(i as u64);
        }
    }
    pb2.finish_with_message(format!("[MATCH] Matched {} groups", groups_matched));

    // Populate stats (spec-07)
    stats.main_exact_matches = exact_accepted;
    stats.main_primary_artist_fallback = fallback_accepted;
    stats.main_all_rejected = all_rejected;
    // Groups that had no candidates at all
    stats.main_no_candidates = groups.len() - groups_seen.len();

    let match_rate = if !groups.is_empty() {
        100.0 * groups_matched as f64 / groups.len() as f64
    } else {
        0.0
    };
    println!(
        "[MATCH] Match rate: {:.1}% ({})",
        match_rate,
        format_duration(phase_start.elapsed())
    );
    eprintln!(
        "[STATS:MAIN] exact={}, fallback={}, rejected={}, no_candidates={}",
        exact_accepted, fallback_accepted, all_rejected, stats.main_no_candidates
    );

    Ok(())
}

/// Optimized fallback matching for pop=0 tracks (not in normalized index).
/// Streams pop=0 tracks from raw Spotify DB and matches against unmatched LRCLIB groups.
/// Populates stats.pop0_* fields (spec-07 instrumentation).
///
/// Key optimizations vs original:
/// 1. Stream tracks only (not track_artists join) - ~100M rows vs ~283M
/// 2. Title normalization happens once per track, not per artist row
/// 3. Candidates that pass title filter are batched, then artists fetched in bulk
fn match_pop0_fallback(
    spotify_conn: &Connection,
    groups: &mut [LrclibGroup],
    groups_seen: &mut FxHashSet<usize>,
    stats: &mut MatchingStats,
) -> Result<u64> {
    let phase_start = Instant::now();
    // Build index of unmatched groups for fast lookup (spec-04: includes rejected groups)
    // Eligible groups are those WITHOUT a match, regardless of whether they were "seen"
    // This includes:
    // 1. Groups that never had candidates (!groups_seen.contains(&idx))
    // 2. Groups that had candidates but all were rejected (in groups_seen but no match)
    let mut unmatched_index: FxHashMap<(String, String), Vec<usize>> = FxHashMap::default();
    let mut from_no_candidates = 0usize;
    let mut from_rejected = 0usize;

    for (idx, group) in groups.iter().enumerate() {
        // spec-04: Check for no match, not just "never seen"
        if group.best_match.is_none() {
            let key = group.key.clone();
            unmatched_index.entry(key).or_default().push(idx);

            // Track why this group is eligible (spec-07 instrumentation)
            if groups_seen.contains(&idx) {
                from_rejected += 1; // Had candidates but all rejected
            } else {
                from_no_candidates += 1; // Never had candidates
            }
        }
    }

    // Record pop=0 eligibility breakdown (spec-04 + spec-07)
    stats.pop0_eligible = unmatched_index.len();
    stats.pop0_from_no_candidates = from_no_candidates;
    stats.pop0_from_rejected = from_rejected;

    if unmatched_index.is_empty() {
        return Ok(0);
    }

    // spec-04: Log breakdown of why groups are eligible for pop=0
    println!(
        "[POP0] Searching pop=0 tracks for {} unmatched groups ({} never seen, {} previously rejected)...",
        unmatched_index.len(),
        from_no_candidates,
        from_rejected
    );

    // Optimization: Build title-only index for fast pre-filtering
    // This avoids artist lookups for ~90% of rows (most titles won't match)
    let title_only_index: FxHashSet<String> = unmatched_index
        .keys()
        .map(|(title_norm, _)| title_norm.clone())
        .collect();
    eprintln!(
        "[POP0] Built title-only index with {} unique titles",
        title_only_index.len()
    );

    // Count pop=0 tracks (optimized: just count tracks, not track_artists)
    let total: u64 = spotify_conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE popularity = 0",
        [],
        |row| row.get(0),
    )?;
    eprintln!(
        "[POP0] Streaming {} pop=0 tracks (optimized: tracks only)...",
        total
    );

    // Phase 1: Stream tracks only (no artist join), filter by title, collect candidates
    // This reduces rows from ~283M (track_artists join) to ~100M (tracks only)
    // Uses parallel title normalization for CPU-bound step
    const READ_BUFFER_SIZE: usize = 100_000; // Read buffer before parallel processing
    const CANDIDATE_BATCH_SIZE: usize = 50_000; // Process batch when this many candidates ready

    // Wrap title_only_index in Arc for thread-safe sharing
    let title_filter = Arc::new(title_only_index);

    let mut stmt = spotify_conn.prepare(
        "SELECT t.rowid, t.id, t.name, t.duration_ms, t.external_id_isrc, t.album_rowid, al.album_type
         FROM tracks t
         LEFT JOIN albums al ON al.rowid = t.album_rowid
         WHERE t.popularity = 0",
    )?;

    /// Raw row data before parallel title normalization
    struct RawRow {
        rowid: i64,
        id: String,
        name: String,
        duration_ms: i64,
        isrc: Option<String>,
        album_rowid: i64,
        album_type: SpotifyAlbumType,
    }

    let mut rows = stmt.query([])?;
    let mut matches_found = 0u64;
    let mut rows_processed = 0u64;
    let mut title_matches = 0u64;
    let mut candidates: Vec<Pop0Candidate> = Vec::with_capacity(CANDIDATE_BATCH_SIZE);

    // Buffer for parallel processing
    let mut read_buffer: Vec<RawRow> = Vec::with_capacity(READ_BUFFER_SIZE);

    while let Some(row) = rows.next()? {
        let album_type_str: Option<String> = row.get(6)?;
        read_buffer.push(RawRow {
            rowid: row.get(0)?,
            id: row.get(1)?,
            name: row.get(2)?,
            duration_ms: row.get(3)?,
            isrc: row.get(4)?,
            album_rowid: row.get(5)?,
            album_type: SpotifyAlbumType::from(album_type_str.as_deref()),
        });

        rows_processed += 1;

        // Process buffer when full using parallel title normalization
        if read_buffer.len() >= READ_BUFFER_SIZE {
            let filter_ref = Arc::clone(&title_filter);
            let new_candidates: Vec<Pop0Candidate> = read_buffer
                .par_drain(..)
                .filter_map(|r| {
                    let title_norm = normalize_title(&r.name);
                    if filter_ref.contains(&title_norm) {
                        Some(Pop0Candidate {
                            rowid: r.rowid,
                            id: r.id,
                            name: r.name,
                            title_norm,
                            duration_ms: r.duration_ms,
                            isrc: r.isrc,
                            album_rowid: r.album_rowid,
                            album_type: r.album_type,
                        })
                    } else {
                        None
                    }
                })
                .collect();

            title_matches += new_candidates.len() as u64;
            candidates.extend(new_candidates);

            // Process candidate batch when full
            if candidates.len() >= CANDIDATE_BATCH_SIZE {
                let batch_matches = process_pop0_candidate_batch(
                    spotify_conn,
                    &candidates,
                    &unmatched_index,
                    groups,
                    groups_seen,
                    stats,
                )?;
                matches_found += batch_matches;
                candidates.clear();
            }

            eprintln!(
                "[POP0] {}/{} ({:.1}%) - {} title matches, {} full matches",
                rows_processed,
                total,
                100.0 * rows_processed as f64 / total as f64,
                title_matches,
                matches_found
            );
        }
    }

    // Process remaining rows in buffer
    if !read_buffer.is_empty() {
        let filter_ref = Arc::clone(&title_filter);
        let new_candidates: Vec<Pop0Candidate> = read_buffer
            .par_drain(..)
            .filter_map(|r| {
                let title_norm = normalize_title(&r.name);
                if filter_ref.contains(&title_norm) {
                    Some(Pop0Candidate {
                        rowid: r.rowid,
                        id: r.id,
                        name: r.name,
                        title_norm,
                        duration_ms: r.duration_ms,
                        isrc: r.isrc,
                        album_rowid: r.album_rowid,
                        album_type: r.album_type,
                    })
                } else {
                    None
                }
            })
            .collect();

        title_matches += new_candidates.len() as u64;
        candidates.extend(new_candidates);
    }

    // Final progress log
    eprintln!(
        "[POP0] {}/{} (100.0%) - {} title matches, processing final batch...",
        rows_processed, total, title_matches
    );

    // Process remaining candidates
    if !candidates.is_empty() {
        let batch_matches = process_pop0_candidate_batch(
            spotify_conn,
            &candidates,
            &unmatched_index,
            groups,
            groups_seen,
            stats,
        )?;
        matches_found += batch_matches;
    }

    // Record pop0 match count (spec-07)
    stats.pop0_matches = matches_found as usize;

    eprintln!(
        "[POP0] Complete: {} additional matches from pop=0 tracks ({})",
        matches_found,
        format_duration(phase_start.elapsed())
    );
    Ok(matches_found)
}

/// Candidate track that passed title filter, pending artist lookup
struct Pop0Candidate {
    rowid: i64,
    id: String,
    name: String,
    title_norm: String,
    duration_ms: i64,
    isrc: Option<String>,
    album_rowid: i64,
    album_type: SpotifyAlbumType,
}

/// Process a batch of pop=0 candidates: fetch artists in bulk, then match against groups.
fn process_pop0_candidate_batch(
    spotify_conn: &Connection,
    candidates: &[Pop0Candidate],
    unmatched_index: &FxHashMap<(String, String), Vec<usize>>,
    groups: &mut [LrclibGroup],
    groups_seen: &mut FxHashSet<usize>,
    stats: &mut MatchingStats,
) -> Result<u64> {
    // Collect rowids for batch artist fetch
    let rowids: Vec<i64> = candidates.iter().map(|c| c.rowid).collect();

    if rowids.is_empty() {
        return Ok(0);
    }

    // Batch fetch all artists for these tracks
    let track_artists = batch_fetch_artists_for_tracks(spotify_conn, &rowids)?;

    let mut matches_found = 0u64;

    for c in candidates {
        // Get artists for this track
        let artists = match track_artists.get(&c.rowid) {
            Some(a) => a,
            None => continue,
        };

        // Try matching against each artist (usually just 1-2)
        for artist in artists {
            let artist_norm = normalize_artist(artist);
            let key = (c.title_norm.clone(), artist_norm.clone());

            if let Some(group_indices) = unmatched_index.get(&key) {
                let spotify_track = SpotifyTrack {
                    id: c.id.clone(),
                    name: c.name.clone(),
                    artist: artist.clone(),
                    artists: artists.clone(),
                    duration_ms: c.duration_ms,
                    popularity: 0,
                    isrc: c.isrc.clone(),
                    album_rowid: c.album_rowid,
                    album_type: c.album_type,
                };

                for &group_idx in group_indices {
                    if groups_seen.contains(&group_idx) {
                        continue;
                    }

                    let group = &mut groups[group_idx];

                    for (track_idx, variant) in group.tracks.iter().enumerate() {
                        let score = combined_score(
                            &variant.track,
                            variant.quality,
                            &spotify_track,
                            &artist_norm,
                        );

                        if score >= ACCEPT_THRESHOLD {
                            let should_replace = match &group.best_match {
                                Some((_, current_track, current_score)) => is_better_match(
                                    score,
                                    spotify_track.album_type,
                                    *current_score,
                                    current_track.album_type,
                                ),
                                None => true,
                            };
                            if should_replace {
                                group.best_match = Some((track_idx, spotify_track.clone(), score));
                            }
                        }
                    }

                    if group.best_match.is_some() {
                        groups_seen.insert(group_idx);
                        matches_found += 1;
                        if let Some((track_idx, ref spotify, _)) = group.best_match {
                            let lrclib_duration = group.tracks[track_idx].track.duration_sec;
                            let diff_sec = lrclib_duration - spotify.duration_ms / 1000;
                            stats.record_duration_bucket(diff_sec);
                        }
                    }
                }
            }
        }
    }

    Ok(matches_found)
}

/// Batch fetch all artists for a set of track rowids.
/// Returns map from track_rowid -> Vec<artist_name>.
fn batch_fetch_artists_for_tracks(
    conn: &Connection,
    rowids: &[i64],
) -> Result<FxHashMap<i64, Vec<String>>> {
    if rowids.is_empty() {
        return Ok(FxHashMap::default());
    }

    let mut result: FxHashMap<i64, Vec<String>> = FxHashMap::default();
    result.reserve(rowids.len());

    // Process in batches to avoid query size limits
    const BATCH_SIZE: usize = 10_000;

    for chunk in rowids.chunks(BATCH_SIZE) {
        let placeholders: String = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");

        let sql = format!(
            "SELECT ta.track_rowid, a.name
             FROM track_artists ta
             JOIN artists a ON a.rowid = ta.artist_rowid
             WHERE ta.track_rowid IN ({})
             ORDER BY ta.track_rowid, ta.artist_rowid",
            placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> =
            chunk.iter().map(|r| r as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(params.as_slice())?;

        while let Some(row) = rows.next()? {
            let track_rowid: i64 = row.get(0)?;
            let artist_name: String = row.get(1)?;
            result.entry(track_rowid).or_default().push(artist_name);
        }
    }

    Ok(result)
}

// ============================================================================
// Pop0 Indexed Lookup (Optimized)
// ============================================================================
// ============================================================================
// Title-First Rescue Pass (spec-06)
// ============================================================================

/// Common titles that appear in too many tracks to be useful for title-only lookup.
/// These are skipped during rescue to avoid false positives.
const COMMON_TITLES: &[&str] = &[
    "home",
    "love",
    "intro",
    "outro",
    "interlude",
    "untitled",
    "track 1",
    "bonus track",
    "live",
    "remix",
    "acoustic",
    "instrumental",
    "interlude",
    "prelude",
    "prologue",
    "epilogue",
    "finale",
    "happy birthday",
    "hallelujah",
    "amen",
];

/// Check if a title is too common for title-only lookup (spec-06 R6.3).
fn is_common_title(title_norm: &str) -> bool {
    // Very short titles are common
    if title_norm.len() < 3 {
        return true;
    }

    // Check against known common titles
    COMMON_TITLES.contains(&title_norm)
}

/// Title-first rescue pass for no_candidates groups (spec-06).
/// Uses title-only lookup with fuzzy artist matching to recover matches where
/// the artist normalization differs (typos, punctuation, partial names).
fn title_first_rescue(
    spotify_conn: &Connection,
    spotify_norm_path: &std::path::Path,
    groups: &mut [LrclibGroup],
    groups_seen: &FxHashSet<usize>,
    stats: &mut MatchingStats,
) -> Result<u64> {
    let phase_start = Instant::now();
    // Collect groups that are eligible for rescue:
    // - No match yet (best_match is None)
    // - Never had candidates (!groups_seen.contains(&idx))
    // This excludes "all_rejected" groups which had candidates but failed duration/score
    let rescue_candidates: Vec<(usize, &str, &str)> = groups
        .iter()
        .enumerate()
        .filter(|(idx, g)| g.best_match.is_none() && !groups_seen.contains(idx))
        .filter(|(_, g)| !is_common_title(&g.key.0))
        .map(|(idx, g)| (idx, g.key.0.as_str(), g.key.1.as_str()))
        .collect();

    if rescue_candidates.is_empty() {
        eprintln!("[RESCUE] No eligible groups for title-first rescue");
        return Ok(0);
    }

    // Count skipped common titles
    let skipped_common: usize = groups
        .iter()
        .enumerate()
        .filter(|(idx, g)| g.best_match.is_none() && !groups_seen.contains(idx))
        .filter(|(_, g)| is_common_title(&g.key.0))
        .count();

    stats.rescue_skipped_common_title = skipped_common;
    stats.rescue_attempted = rescue_candidates.len();

    eprintln!(
        "[RESCUE] Running title-first rescue for {} groups ({} skipped as common titles)...",
        rescue_candidates.len(),
        skipped_common
    );

    // Open normalized DB for title-only lookups
    let norm_conn = Connection::open(spotify_norm_path)?;
    norm_conn.execute_batch(
        "PRAGMA query_only = 1;
         PRAGMA journal_mode = OFF;
         PRAGMA synchronous = OFF;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -500000;
         PRAGMA mmap_size = 8589934592;",
    )?;

    let pb = create_progress_bar(rescue_candidates.len() as u64, "Title-first rescue");

    // Maximum candidates to fetch per title
    const MAX_CANDIDATES_PER_TITLE: i64 = 100;
    const ARTIST_SIMILARITY_THRESHOLD: f64 = 0.70;

    // Prepare title-only lookup statement (using idx_track_norm_title index)
    let mut title_lookup_stmt = norm_conn.prepare_cached(
        "SELECT track_rowid, artist_norm, popularity, duration_ms
         FROM track_norm
         WHERE title_norm = ?
         ORDER BY popularity DESC
         LIMIT ?",
    )?;

    let mut matches_found = 0u64;
    let mut rejected_low_sim = 0usize;
    let mut rejected_duration = 0usize;

    // Collect all rowids that pass similarity filter for batch detail fetch
    let mut rowids_to_fetch: Vec<(usize, i64, f64)> = Vec::new(); // (group_idx, rowid, similarity)

    for (i, (group_idx, title_norm, artist_norm)) in rescue_candidates.iter().enumerate() {
        // Phase 1: Title-only lookup in normalized index
        let mut rows =
            title_lookup_stmt.query(rusqlite::params![title_norm, MAX_CANDIDATES_PER_TITLE])?;

        while let Some(row) = rows.next()? {
            let track_rowid: i64 = row.get(0)?;
            let candidate_artist_norm: String = row.get(1)?;
            let duration_ms: i64 = row.get(3)?;

            // Phase 2: Artist similarity filter using normalized Levenshtein (spec-06 R6.2)
            let similarity = normalized_levenshtein(artist_norm, &candidate_artist_norm);

            if similarity < ARTIST_SIMILARITY_THRESHOLD {
                rejected_low_sim += 1;
                continue;
            }

            // Phase 3: Quick duration check (using normalized DB duration_ms)
            // Get best quality variant's duration for comparison
            let group = &groups[*group_idx];
            let best_variant = group.tracks.iter().max_by_key(|t| t.quality).unwrap();
            let lrclib_duration_sec = best_variant.track.duration_sec;
            let diff = (lrclib_duration_sec - duration_ms / 1000).abs();

            // Use strict 30s tolerance for rescue matches (spec-06 R6.4)
            if diff > 30 {
                rejected_duration += 1;
                continue;
            }

            // Candidate passed filters - collect for batch detail fetch
            rowids_to_fetch.push((*group_idx, track_rowid, similarity));
        }

        if i % 50_000 == 0 {
            pb.set_position(i as u64);
        }
    }
    pb.finish();

    stats.rescue_rejected_low_similarity = rejected_low_sim;
    stats.rescue_rejected_duration = rejected_duration;

    if rowids_to_fetch.is_empty() {
        eprintln!("[RESCUE] No candidates passed similarity/duration filters");
        return Ok(0);
    }

    eprintln!(
        "[RESCUE] {} candidates passed filters, fetching details...",
        rowids_to_fetch.len()
    );

    // Phase 4: Batch fetch track details for all passing candidates
    let unique_rowids: Vec<i64> = rowids_to_fetch
        .iter()
        .map(|(_, rowid, _)| *rowid)
        .collect::<FxHashSet<_>>()
        .into_iter()
        .collect();

    let track_details = batch_fetch_track_details(spotify_conn, &unique_rowids)?;

    // Phase 5: Score candidates and select best match per group
    let pb2 = create_progress_bar(rowids_to_fetch.len() as u64, "Scoring rescue candidates");

    // Group candidates by group_idx and find best
    // Stores: (rowid, similarity, score, album_type)
    let mut best_per_group: FxHashMap<usize, (i64, f64, i32, SpotifyAlbumType)> =
        FxHashMap::default();

    for (i, (group_idx, track_rowid, similarity)) in rowids_to_fetch.iter().enumerate() {
        let group = &groups[*group_idx];

        if let Some(spotify_track) = track_details.get(track_rowid) {
            // Score against all variants
            for variant in group.tracks.iter() {
                let base_score =
                    combined_score(&variant.track, variant.quality, spotify_track, &group.key.1);

                // Add similarity bonus (spec-06 R6.5)
                let similarity_bonus = (*similarity * 50.0) as i32;
                let score = base_score + similarity_bonus;

                if score >= ACCEPT_THRESHOLD {
                    let should_replace = match best_per_group.get(group_idx) {
                        Some((_, _, current_score, current_album_type)) => is_better_match(
                            score,
                            spotify_track.album_type,
                            *current_score,
                            *current_album_type,
                        ),
                        None => true,
                    };
                    if should_replace {
                        best_per_group.insert(
                            *group_idx,
                            (*track_rowid, *similarity, score, spotify_track.album_type),
                        );
                    }
                }
            }
        }

        if i % 10_000 == 0 {
            pb2.set_position(i as u64);
        }
    }
    pb2.finish();

    // Phase 6: Apply best matches to groups
    for (group_idx, (track_rowid, _similarity, score, _album_type)) in best_per_group.iter() {
        if let Some(spotify_track) = track_details.get(track_rowid) {
            let group = &mut groups[*group_idx];

            // Find the variant that scored best with this Spotify track
            let mut best_variant_idx = 0;
            let mut best_variant_score = i32::MIN;

            for (track_idx, variant) in group.tracks.iter().enumerate() {
                let variant_score =
                    combined_score(&variant.track, variant.quality, spotify_track, &group.key.1);
                if variant_score > best_variant_score {
                    best_variant_score = variant_score;
                    best_variant_idx = track_idx;
                }
            }

            group.best_match = Some((best_variant_idx, spotify_track.clone(), *score));
            matches_found += 1;

            // Record duration bucket for stats
            let lrclib_duration = group.tracks[best_variant_idx].track.duration_sec;
            let diff_sec = lrclib_duration - spotify_track.duration_ms / 1000;
            stats.record_duration_bucket(diff_sec);
        }
    }

    stats.rescue_matches = matches_found as usize;

    eprintln!(
        "[RESCUE] Complete: {} additional matches from title-first rescue ({})",
        matches_found,
        format_duration(phase_start.elapsed())
    );

    Ok(matches_found)
}

/// Fuzzy title rescue pass for remaining unmatched groups.
/// For groups where the artist exists in Spotify but no exact title match was found,
/// this pass tries to find similar titles using Levenshtein distance.
/// Helps recover matches for typos, slight variations, and encoding differences.
///
/// Optimizations applied:
/// - Batch prefetch: Collect all unique artists, fetch their titles in batches
/// - Parallel processing: Use rayon for Levenshtein comparisons
fn fuzzy_title_rescue(
    spotify_conn: &Connection,
    spotify_norm_path: &std::path::Path,
    groups: &mut [LrclibGroup],
    _groups_seen: &FxHashSet<usize>,
    stats: &mut MatchingStats,
) -> Result<u64> {
    let phase_start = Instant::now();

    // Collect groups eligible for fuzzy title rescue:
    // - No match yet (best_match is None)
    // - Not a common title (those are too ambiguous)
    let rescue_candidates: Vec<(usize, &str, &str)> = groups
        .iter()
        .enumerate()
        .filter(|(_, g)| g.best_match.is_none())
        .filter(|(_, g)| !is_common_title(&g.key.0))
        .map(|(idx, g)| (idx, g.key.0.as_str(), g.key.1.as_str()))
        .collect();

    if rescue_candidates.is_empty() {
        eprintln!("[FUZZY] No eligible groups for fuzzy title rescue");
        return Ok(0);
    }

    stats.fuzzy_title_attempted = rescue_candidates.len();
    eprintln!(
        "[FUZZY] Running fuzzy title rescue for {} groups...",
        rescue_candidates.len()
    );

    // Open normalized DB for title lookups by artist
    let norm_conn = Connection::open(spotify_norm_path)?;
    norm_conn.execute_batch(
        "PRAGMA query_only = 1;
         PRAGMA journal_mode = OFF;
         PRAGMA synchronous = OFF;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -500000;
         PRAGMA mmap_size = 8589934592;",
    )?;

    // =========================================================================
    // Optimization: Stream normalized DB once to build artist→titles map
    // This is O(N) where N = normalized DB size, much faster than batch IN queries
    // =========================================================================
    let prefetch_start = Instant::now();

    // Build set of artists we're looking for (for O(1) lookup during streaming)
    let unique_artists: FxHashSet<&str> = rescue_candidates
        .iter()
        .map(|(_, _, artist)| *artist)
        .collect();

    eprintln!(
        "[FUZZY] Streaming normalized DB to find titles for {} unique artists...",
        unique_artists.len()
    );

    // Count rows for progress
    let total_rows: u64 = norm_conn
        .query_row(
            "SELECT COUNT(DISTINCT artist_norm || '|' || title_norm) FROM track_norm",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Stream all unique (artist, title) pairs and filter to our artists
    let mut artist_titles_map: FxHashMap<String, Vec<String>> = FxHashMap::default();
    artist_titles_map.reserve(unique_artists.len());

    let mut stmt = norm_conn.prepare("SELECT DISTINCT artist_norm, title_norm FROM track_norm")?;
    let mut rows = stmt.query([])?;
    let mut rows_processed = 0u64;

    while let Some(row) = rows.next()? {
        let artist: String = row.get(0)?;

        // Only keep if this artist is in our lookup set
        if unique_artists.contains(artist.as_str()) {
            let title: String = row.get(1)?;
            artist_titles_map.entry(artist).or_default().push(title);
        }

        rows_processed += 1;
        if rows_processed % 5_000_000 == 0 {
            eprintln!(
                "[FUZZY] Streamed {}/{} pairs ({:.1}%), found {} artists so far",
                rows_processed,
                total_rows,
                100.0 * rows_processed as f64 / total_rows.max(1) as f64,
                artist_titles_map.len()
            );
        }
    }

    eprintln!(
        "[FUZZY] Prefetch complete: {} artists with titles from {} pairs ({})",
        artist_titles_map.len(),
        rows_processed,
        format_duration(prefetch_start.elapsed())
    );

    // =========================================================================
    // Parallel Levenshtein matching using rayon
    // =========================================================================
    const TITLE_SIMILARITY_THRESHOLD: f64 = 0.90;
    eprintln!("[FUZZY] Computing Levenshtein similarities (parallel)...");
    let lev_start = Instant::now();

    // Prepare data for parallel processing: (group_idx, title_norm, artist_norm, lrclib_duration_sec)
    let candidates_with_duration: Vec<(usize, &str, &str, i64)> = rescue_candidates
        .iter()
        .map(|(idx, title, artist)| {
            let group = &groups[*idx];
            let best_variant = group.tracks.iter().max_by_key(|t| t.quality).unwrap();
            (*idx, *title, *artist, best_variant.track.duration_sec)
        })
        .collect();

    // Parallel fuzzy matching - returns (group_idx, matched_title, best_similarity)
    let fuzzy_matches: Vec<(usize, String, f64)> = candidates_with_duration
        .par_iter()
        .filter_map(|(group_idx, title_norm, artist_norm, _)| {
            let artist_titles = artist_titles_map.get(*artist_norm)?;

            // Find best matching title
            let mut best_sim = 0.0f64;
            let mut best_title: Option<&String> = None;

            for spotify_title in artist_titles {
                let sim = normalized_levenshtein(title_norm, spotify_title);
                if sim > best_sim {
                    best_sim = sim;
                    best_title = Some(spotify_title);
                }
                // Early exit for excellent match
                if sim >= 0.98 {
                    break;
                }
            }

            if best_sim >= TITLE_SIMILARITY_THRESHOLD {
                Some((*group_idx, best_title?.clone(), best_sim))
            } else {
                None
            }
        })
        .collect();

    eprintln!(
        "[FUZZY] Levenshtein complete: {} potential matches ({})",
        fuzzy_matches.len(),
        format_duration(lev_start.elapsed())
    );

    // Count stats
    let no_artist_count = candidates_with_duration
        .iter()
        .filter(|(_, _, artist, _)| !artist_titles_map.contains_key(*artist))
        .count();
    let no_close_match_count = rescue_candidates.len() - no_artist_count - fuzzy_matches.len();

    // =========================================================================
    // Fetch candidates for matched titles (sequential DB access)
    // =========================================================================
    let mut candidate_stmt = norm_conn.prepare_cached(
        "SELECT track_rowid, popularity, duration_ms
         FROM track_norm
         WHERE title_norm = ? AND artist_norm = ?
         ORDER BY popularity DESC
         LIMIT 20",
    )?;

    let mut rowids_to_fetch: Vec<(usize, i64, String, f64)> = Vec::new();
    let pb = create_progress_bar(fuzzy_matches.len() as u64, "Fetching fuzzy candidates");

    for (i, (group_idx, matched_title, similarity)) in fuzzy_matches.iter().enumerate() {
        let group = &groups[*group_idx];
        let best_variant = group.tracks.iter().max_by_key(|t| t.quality).unwrap();
        let lrclib_duration_sec = best_variant.track.duration_sec;

        let artist_norm = &group.key.1;
        let mut cand_rows =
            candidate_stmt.query(rusqlite::params![matched_title, artist_norm.as_str()])?;

        while let Some(row) = cand_rows.next()? {
            let track_rowid: i64 = row.get(0)?;
            let duration_ms: i64 = row.get(2)?;

            // Duration check (30s tolerance)
            let diff = (lrclib_duration_sec - duration_ms / 1000).abs();
            if diff <= 30 {
                rowids_to_fetch.push((*group_idx, track_rowid, matched_title.clone(), *similarity));
                break;
            }
        }

        if i % 10_000 == 0 {
            pb.set_position(i as u64);
        }
    }
    pb.finish();

    stats.fuzzy_title_no_artist = no_artist_count;
    stats.fuzzy_title_no_close_match = no_close_match_count;

    if rowids_to_fetch.is_empty() {
        eprintln!("[FUZZY] No fuzzy matches found");
        return Ok(0);
    }

    eprintln!(
        "[FUZZY] {} candidates passed filters, fetching details...",
        rowids_to_fetch.len()
    );

    // Batch fetch track details
    let unique_rowids: Vec<i64> = rowids_to_fetch
        .iter()
        .map(|(_, rowid, _, _)| *rowid)
        .collect::<FxHashSet<_>>()
        .into_iter()
        .collect();

    let track_details = batch_fetch_track_details(spotify_conn, &unique_rowids)?;

    // Score and apply matches
    let mut matches_found = 0u64;
    let pb2 = create_progress_bar(rowids_to_fetch.len() as u64, "Scoring fuzzy matches");

    for (i, (group_idx, track_rowid, _matched_title, similarity)) in
        rowids_to_fetch.iter().enumerate()
    {
        let group = &mut groups[*group_idx];

        // Skip if already matched by another candidate
        if group.best_match.is_some() {
            continue;
        }

        if let Some(spotify_track) = track_details.get(track_rowid) {
            // Score against best variant
            let mut best_score = i32::MIN;
            let mut best_variant_idx = 0;

            for (variant_idx, variant) in group.tracks.iter().enumerate() {
                let base_score =
                    combined_score(&variant.track, variant.quality, spotify_track, &group.key.1);
                // Add similarity bonus (fuzzy match gets some credit)
                let similarity_bonus = (*similarity * 30.0) as i32;
                let score = base_score + similarity_bonus;

                if score > best_score {
                    best_score = score;
                    best_variant_idx = variant_idx;
                }
            }

            if best_score >= ACCEPT_THRESHOLD {
                group.best_match = Some((best_variant_idx, spotify_track.clone(), best_score));
                matches_found += 1;

                // Record duration bucket
                let lrclib_duration = group.tracks[best_variant_idx].track.duration_sec;
                let diff_sec = lrclib_duration - spotify_track.duration_ms / 1000;
                stats.record_duration_bucket(diff_sec);
            }
        }

        if i % 10_000 == 0 {
            pb2.set_position(i as u64);
        }
    }
    pb2.finish();

    stats.fuzzy_title_matches = matches_found as usize;

    eprintln!(
        "[FUZZY] Complete: {} additional matches from fuzzy title rescue ({})",
        matches_found,
        format_duration(phase_start.elapsed())
    );

    Ok(matches_found)
}

// ============================================================================
// Album Upgrade Pass
// ============================================================================

/// Album upgrade pass: Promote matches from Single/Compilation to Album releases.
/// Searches pop0_albums_norm for album versions of tracks that already have a match
/// but the match is from a Single or Compilation. If a better album version exists
/// with similar duration, upgrade to the album version.
///
/// This fixes cases like "1979" where the single version was matched instead of
/// the album version from "Mellon Collie and the Infinite Sadness".
fn album_upgrade_pass(
    spotify_conn: &Connection,
    spotify_norm_path: &std::path::Path,
    groups: &mut [LrclibGroup],
    stats: &mut MatchingStats,
) -> Result<u64> {
    let phase_start = Instant::now();

    // Open normalized DB for pop0_albums_norm lookups
    let norm_conn = Connection::open(spotify_norm_path)?;
    norm_conn.execute_batch(
        "PRAGMA query_only = 1;
         PRAGMA journal_mode = OFF;
         PRAGMA synchronous = OFF;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -100000;
         PRAGMA mmap_size = 4294967296;",
    )?;

    // Check if pop0_albums_norm table exists
    let table_exists: bool = norm_conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='pop0_albums_norm'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !table_exists {
        eprintln!("[ALBUM_UPGRADE] pop0_albums_norm table not found, skipping album upgrade pass");
        eprintln!(
            "[ALBUM_UPGRADE] Rebuild spotify_normalized.sqlite3 with normalize-spotify to enable"
        );
        return Ok(0);
    }

    // Find groups eligible for upgrade:
    // - Has a match with score >= 80
    // - Current match album_type is NOT Album (i.e., Single, Compilation, or Unknown)
    let mut candidates: Vec<(usize, String, String, i64)> = Vec::new();

    for (idx, group) in groups.iter().enumerate() {
        if let Some((track_idx, ref spotify, score)) = group.best_match {
            if score >= ACCEPT_THRESHOLD && spotify.album_type != SpotifyAlbumType::Album {
                let (title_norm, artist_norm) = &group.key;
                let lrclib_duration_ms = group.tracks[track_idx].track.duration_sec * 1000;
                candidates.push((
                    idx,
                    title_norm.clone(),
                    artist_norm.clone(),
                    lrclib_duration_ms,
                ));
            }
        }
    }

    stats.album_upgrade_candidates = candidates.len();

    if candidates.is_empty() {
        eprintln!("[ALBUM_UPGRADE] No candidates for album upgrade");
        return Ok(0);
    }

    eprintln!(
        "[ALBUM_UPGRADE] Found {} candidates with non-Album matches (score >= {})",
        candidates.len(),
        ACCEPT_THRESHOLD
    );

    // Query pop0_albums_norm for each candidate's (title_norm, artist_norm)
    // Duration filter: ±30s
    const DURATION_TOLERANCE_MS: i64 = 30_000;

    let mut rowids_to_fetch: Vec<i64> = Vec::new();
    let mut candidate_rowid_map: FxHashMap<i64, Vec<usize>> = FxHashMap::default();

    for (idx, title_norm, artist_norm, lrclib_duration_ms) in &candidates {
        let min_duration = lrclib_duration_ms - DURATION_TOLERANCE_MS;
        let max_duration = lrclib_duration_ms + DURATION_TOLERANCE_MS;

        let mut stmt = norm_conn.prepare_cached(
            "SELECT track_rowid, duration_ms FROM pop0_albums_norm
             WHERE title_norm = ? AND artist_norm = ?
             AND duration_ms BETWEEN ? AND ?",
        )?;

        let mut rows = stmt.query(rusqlite::params![
            title_norm,
            artist_norm,
            min_duration,
            max_duration
        ])?;

        while let Some(row) = rows.next()? {
            let track_rowid: i64 = row.get(0)?;
            rowids_to_fetch.push(track_rowid);
            candidate_rowid_map
                .entry(track_rowid)
                .or_default()
                .push(*idx);
        }
    }

    if rowids_to_fetch.is_empty() {
        eprintln!("[ALBUM_UPGRADE] No album versions found in pop0_albums_norm");
        return Ok(0);
    }

    // Deduplicate rowids
    rowids_to_fetch.sort_unstable();
    rowids_to_fetch.dedup();

    eprintln!(
        "[ALBUM_UPGRADE] Found {} potential album tracks, fetching details...",
        rowids_to_fetch.len()
    );

    // Batch fetch track details from spotify_clean
    let track_details = batch_fetch_track_details(spotify_conn, &rowids_to_fetch)?;

    // For each candidate, find the best album match
    let mut upgrades = 0u64;

    for (idx, _title_norm, artist_norm, _lrclib_duration_ms) in &candidates {
        let group = &mut groups[*idx];

        // Get current match for comparison
        let (track_idx, ref current_spotify, current_score) = match &group.best_match {
            Some(m) => m.clone(),
            None => continue,
        };

        // Find all album tracks matching this candidate
        let mut best_upgrade: Option<(SpotifyTrack, i32)> = None;

        for (&rowid, candidate_indices) in &candidate_rowid_map {
            if !candidate_indices.contains(idx) {
                continue;
            }

            if let Some(spotify_track) = track_details.get(&rowid) {
                // Verify album_type is Album (should always be true from pop0_albums_norm)
                if spotify_track.album_type != SpotifyAlbumType::Album {
                    continue;
                }

                // Score this album track against the LRCLIB variant
                let variant = &group.tracks[track_idx];
                let score =
                    combined_score(&variant.track, variant.quality, spotify_track, artist_norm);

                if score >= ACCEPT_THRESHOLD {
                    // Check if this album track is better than current best upgrade
                    let dominated = match &best_upgrade {
                        Some((_, best_score)) => !is_better_match(
                            score,
                            SpotifyAlbumType::Album,
                            *best_score,
                            SpotifyAlbumType::Album,
                        ),
                        None => false,
                    };

                    if !dominated {
                        best_upgrade = Some((spotify_track.clone(), score));
                    }
                }
            }
        }

        // Apply upgrade if we found a viable album version
        if let Some((upgrade_track, upgrade_score)) = best_upgrade {
            // Use is_better_match to confirm upgrade is warranted
            if is_better_match(
                upgrade_score,
                SpotifyAlbumType::Album,
                current_score,
                current_spotify.album_type,
            ) {
                group.best_match = Some((track_idx, upgrade_track, upgrade_score));
                upgrades += 1;
            }
        }
    }

    stats.album_upgrades = upgrades as usize;

    eprintln!(
        "[ALBUM_UPGRADE] Complete: {} upgrades from {} candidates ({})",
        upgrades,
        candidates.len(),
        format_duration(phase_start.elapsed())
    );

    Ok(upgrades)
}

/// Batch fetch track details by rowids with all artists (spec-03 multi-artist).
fn batch_fetch_track_details(
    conn: &Connection,
    rowids: &[i64],
) -> Result<FxHashMap<i64, SpotifyTrack>> {
    if rowids.is_empty() {
        return Ok(FxHashMap::default());
    }

    let mut result: FxHashMap<i64, SpotifyTrack> = FxHashMap::default();
    result.reserve(rowids.len());

    // Process in batches to avoid query size limits
    const BATCH_SIZE: usize = 10_000;
    let pb = create_progress_bar(rowids.len() as u64, "Fetching track details");

    for chunk in rowids.chunks(BATCH_SIZE) {
        let placeholders: String = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");

        // Phase 1: Fetch track data with primary artist and album_type
        let sql = format!(
            r#"SELECT
                t.rowid,
                t.id,
                t.name,
                a.name as artist_name,
                t.duration_ms,
                t.popularity,
                t.external_id_isrc,
                t.album_rowid,
                al.album_type
            FROM tracks t
            JOIN artists a ON a.rowid = (
                SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
            )
            LEFT JOIN albums al ON al.rowid = t.album_rowid
            WHERE t.rowid IN ({})"#,
            placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> =
            chunk.iter().map(|r| r as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(params.as_slice())?;

        while let Some(row) = rows.next()? {
            let rowid: i64 = row.get(0)?;
            let primary_artist: String = row.get(3)?;
            let album_type_str: Option<String> = row.get(8)?;
            let track = SpotifyTrack {
                id: row.get(1)?,
                name: row.get(2)?,
                artist: primary_artist.clone(),
                artists: vec![primary_artist], // Will be extended with all artists
                duration_ms: row.get(4)?,
                popularity: row.get(5)?,
                isrc: row.get(6)?,
                album_rowid: row.get(7)?,
                album_type: SpotifyAlbumType::from(album_type_str.as_deref()),
            };
            result.insert(rowid, track);
        }

        // Phase 2: Fetch ALL artists for these tracks (spec-03 R3.3)
        let artists_sql = format!(
            r#"SELECT ta.track_rowid, a.name
            FROM track_artists ta
            JOIN artists a ON a.rowid = ta.artist_rowid
            WHERE ta.track_rowid IN ({})
            ORDER BY ta.track_rowid, ta.artist_rowid"#,
            placeholders
        );

        let mut artists_stmt = conn.prepare(&artists_sql)?;
        let mut artist_rows = artists_stmt.query(params.as_slice())?;

        // Collect all artists per track
        let mut track_artists_map: FxHashMap<i64, Vec<String>> = FxHashMap::default();
        while let Some(row) = artist_rows.next()? {
            let track_rowid: i64 = row.get(0)?;
            let artist_name: String = row.get(1)?;
            track_artists_map
                .entry(track_rowid)
                .or_default()
                .push(artist_name);
        }

        // Update tracks with all artists
        for (track_rowid, artists) in track_artists_map {
            if let Some(track) = result.get_mut(&track_rowid) {
                track.artists = artists;
            }
        }

        pb.inc(chunk.len() as u64);
    }
    pb.finish();

    Ok(result)
}

/// Select canonical track and enrich with Spotify data (spec-03).
/// For matched groups: use the variant that matched best with Spotify.
/// For unmatched groups: fall back to best quality variant.
fn select_canonical_and_enrich(
    groups: Vec<LrclibGroup>,
    audio_lookup: &FxHashMap<String, AudioFeatures>,
    image_lookup: &FxHashMap<i64, String>,
) -> Vec<EnrichedTrack> {
    let pb = create_progress_bar(groups.len() as u64, "Selecting canonical & enriching");

    let enriched: Vec<EnrichedTrack> = groups
        .into_iter()
        .map(|group| {
            let (title_norm, artist_norm) = group.key;

            let enriched_track = match group.best_match {
                Some((track_idx, spotify, _score)) => {
                    // Use the variant that matched Spotify
                    let variant = &group.tracks[track_idx];
                    let features = audio_lookup.get(&spotify.id);
                    let album_image = image_lookup.get(&spotify.album_rowid).cloned();

                    EnrichedTrack {
                        lrclib_id: variant.track.id,
                        title: variant.track.title.clone(),
                        artist: variant.track.artist.clone(),
                        album: variant.track.album.clone(),
                        duration_sec: variant.track.duration_sec,
                        title_norm,
                        artist_norm,
                        quality: variant.quality,
                        spotify_id: Some(spotify.id),
                        popularity: Some(spotify.popularity),
                        tempo: features.and_then(|f| f.tempo),
                        musical_key: features.and_then(|f| f.key),
                        mode: features.and_then(|f| f.mode),
                        time_signature: features.and_then(|f| f.time_signature),
                        isrc: spotify.isrc,
                        album_image_url: album_image,
                    }
                }
                None => {
                    // Fallback: best quality variant (no Spotify match)
                    let best_variant = group
                        .tracks
                        .iter()
                        .max_by(|a, b| {
                            a.quality
                                .cmp(&b.quality)
                                .then_with(|| b.track.id.cmp(&a.track.id))
                        })
                        .unwrap(); // Safe: groups always have at least one track

                    EnrichedTrack {
                        lrclib_id: best_variant.track.id,
                        title: best_variant.track.title.clone(),
                        artist: best_variant.track.artist.clone(),
                        album: best_variant.track.album.clone(),
                        duration_sec: best_variant.track.duration_sec,
                        title_norm,
                        artist_norm,
                        quality: best_variant.quality,
                        spotify_id: None,
                        popularity: None,
                        tempo: None,
                        musical_key: None,
                        mode: None,
                        time_signature: None,
                        isrc: None,
                        album_image_url: None,
                    }
                }
            };

            pb.inc(1);
            enriched_track
        })
        .collect();

    let matched_count = enriched.iter().filter(|t| t.spotify_id.is_some()).count();
    let match_rate = if !enriched.is_empty() {
        100.0 * matched_count as f64 / enriched.len() as f64
    } else {
        0.0
    };

    pb.finish_with_message(format!(
        "Selected {} canonical tracks ({} with Spotify, {:.1}%)",
        enriched.len(),
        matched_count,
        match_rate
    ));

    enriched
}

/// Deduplicate enriched tracks by spotify_id, keeping the highest quality LRCLIB entry.
///
/// This handles cases where multiple LRCLIB groups (with different title_norm values)
/// matched the same Spotify track via fuzzy matching. For example:
/// - "Nothing Else Matters" (metallica) → Spotify ID X
/// - "Nothing Else Matte" (metallica) → Spotify ID X (fuzzy match)
/// - "Nothing Else Matter" (metallica) → Spotify ID X (fuzzy match)
///
/// We keep only the highest quality entry to avoid showing typo variants in search results.
fn deduplicate_by_spotify_id(tracks: Vec<EnrichedTrack>) -> Vec<EnrichedTrack> {
    let before_count = tracks.len();
    let mut spotify_best: FxHashMap<String, EnrichedTrack> = FxHashMap::default();
    let mut unmatched: Vec<EnrichedTrack> = Vec::new();

    for track in tracks {
        match &track.spotify_id {
            Some(sid) => {
                spotify_best
                    .entry(sid.clone())
                    .and_modify(|existing| {
                        // Keep the one with higher quality score
                        if track.quality > existing.quality {
                            *existing = track.clone();
                        }
                    })
                    .or_insert(track);
            }
            None => unmatched.push(track),
        }
    }

    let matched_count = spotify_best.len();
    let mut result: Vec<EnrichedTrack> = spotify_best.into_values().collect();
    result.extend(unmatched);

    let removed = before_count - result.len();
    if removed > 0 {
        eprintln!(
            "[DEDUP] Removed {} duplicate spotify_id entries ({} matched + {} unmatched = {} total)",
            removed, matched_count, result.len() - matched_count, result.len()
        );
    }

    result
}

/// Collect needed Spotify track IDs and album rowids from groups with best matches
fn collect_needed_ids_from_groups(groups: &[LrclibGroup]) -> (FxHashSet<String>, FxHashSet<i64>) {
    let mut track_ids: FxHashSet<String> = FxHashSet::default();
    let mut album_rowids: FxHashSet<i64> = FxHashSet::default();

    for group in groups {
        if let Some((_, ref spotify, _)) = group.best_match {
            track_ids.insert(spotify.id.clone());
            album_rowids.insert(spotify.album_rowid);
        }
    }

    println!(
        "[COLLECT] Need {} track IDs and {} album rowids",
        track_ids.len(),
        album_rowids.len()
    );
    (track_ids, album_rowids)
}

/// Collect needed Spotify track IDs and album rowids from best matches (old pipeline).
/// Replaced by collect_needed_ids_from_groups() for delayed canonical selection.
#[allow(dead_code)]
fn collect_needed_ids(
    best_matches: &[Option<SpotifyTrack>],
) -> (FxHashSet<String>, FxHashSet<i64>) {
    let mut track_ids: FxHashSet<String> = FxHashSet::default();
    let mut album_rowids: FxHashSet<i64> = FxHashSet::default();

    for s in best_matches.iter().flatten() {
        track_ids.insert(s.id.clone());
        album_rowids.insert(s.album_rowid);
    }

    println!(
        "[COLLECT] Need {} track IDs and {} album rowids",
        track_ids.len(),
        album_rowids.len()
    );
    (track_ids, album_rowids)
}

/// Batch-fetch primary artist names for a list of track rowids (spec-02).
/// Uses batched IN queries instead of correlated subqueries to eliminate
/// the 50M+ subquery executions in the original approach.
/// Note: Not yet used in current implementation but kept for future 2-phase optimization.
#[allow(dead_code)]
fn batch_fetch_primary_artists(
    conn: &Connection,
    rowids: &[i64],
) -> Result<FxHashMap<i64, String>> {
    let mut lookup: FxHashMap<i64, String> = FxHashMap::default();

    if rowids.is_empty() {
        return Ok(lookup);
    }

    // SQLite parameter limit is typically 999-32766 depending on version
    // Use 999 for maximum compatibility
    for chunk in rowids.chunks(999) {
        let placeholders = vec!["?"; chunk.len()].join(",");

        // Get primary artist (MIN artist_rowid) for each track
        let sql = format!(
            r#"
            SELECT ta.track_rowid, a.name
            FROM track_artists ta
            JOIN artists a ON a.rowid = ta.artist_rowid
            WHERE ta.track_rowid IN ({})
              AND ta.artist_rowid = (
                  SELECT MIN(artist_rowid)
                  FROM track_artists
                  WHERE track_rowid = ta.track_rowid
              )
        "#,
            placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> =
            chunk.iter().map(|r| r as &dyn rusqlite::ToSql).collect();

        let mut rows = stmt.query(params.as_slice())?;
        while let Some(row) = rows.next()? {
            let track_rowid: i64 = row.get(0)?;
            let artist_name: String = row.get(1)?;
            lookup.insert(track_rowid, artist_name);
        }
    }

    Ok(lookup)
}

/// Load album image URLs filtered to only needed album rowids.
/// We select medium size (~300px) for optimal mobile display.
#[allow(dead_code)]
fn load_album_images_filtered(
    conn: &Connection,
    needed_album_rowids: &FxHashSet<i64>,
) -> Result<FxHashMap<i64, String>> {
    println!(
        "[IMAGES] Loading album images (filtered to {} albums)...",
        needed_album_rowids.len()
    );

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

/// Load album image URLs using batched IN queries (spec-02).
/// Much faster than scanning entire album_images table.
/// Uses the album_images_album_id index.
fn load_album_images_batched(
    conn: &Connection,
    album_rowids: &FxHashSet<i64>,
) -> Result<FxHashMap<i64, String>> {
    println!(
        "[IMAGES] Loading album images (batched for {} albums)...",
        album_rowids.len()
    );

    let rowids_vec: Vec<i64> = album_rowids.iter().copied().collect();
    let mut lookup: FxHashMap<i64, String> = FxHashMap::default();

    if rowids_vec.is_empty() {
        return Ok(lookup);
    }

    // Batch by 999 (SQLite parameter limit)
    for chunk in rowids_vec.chunks(999) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!(
            r#"
            SELECT album_rowid, url, height
            FROM album_images
            WHERE album_rowid IN ({})
              AND height BETWEEN 250 AND 350
            ORDER BY ABS(height - 300)
        "#,
            placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> =
            chunk.iter().map(|r| r as &dyn rusqlite::ToSql).collect();

        let mut rows = stmt.query(params.as_slice())?;
        while let Some(row) = rows.next()? {
            let album_rowid: i64 = row.get(0)?;
            let url: String = row.get(1)?;
            // Only keep first (closest to 300px) per album
            lookup.entry(album_rowid).or_insert(url);
        }
    }

    println!(
        "[IMAGES] Loaded {} album image URLs (batched)",
        lookup.len()
    );
    Ok(lookup)
}

/// Enrich canonical LRCLIB tracks with pre-matched Spotify data (old pipeline).
/// LRCLIB is the source of truth — Spotify data is nullable enrichment.
/// Replaced by select_canonical_and_enrich() for delayed canonical selection.
#[allow(dead_code)]
fn enrich_tracks_with_matches(
    canonical: Vec<ScoredTrack>,
    best_matches: Vec<Option<SpotifyTrack>>,
    audio_lookup: &FxHashMap<String, AudioFeatures>,
    image_lookup: &FxHashMap<i64, String>,
) -> Vec<EnrichedTrack> {
    let pb = create_progress_bar(canonical.len() as u64, "Enriching with Spotify");

    let enriched: Vec<EnrichedTrack> = canonical
        .into_iter()
        .zip(best_matches)
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

/// Convert ScoredTrack to EnrichedTrack with NULL Spotify fields (old pipeline).
/// Replaced by select_canonical_and_enrich() with empty lookups.
#[allow(dead_code)]
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

/// Batch size for enriched track writes.
/// SQLite limit: SQLITE_MAX_VARIABLE_NUMBER = 32766.
/// With 16 columns per row: 32766 / 16 = 2047. Using 2000 for safety.
const ENRICHED_BATCH_SIZE: usize = 2_000;

/// Build a multi-value INSERT SQL statement for enriched tracks.
/// Pre-building avoids repeated string allocation during batch writes.
fn build_enriched_batch_sql(num_rows: usize) -> String {
    if num_rows == 0 {
        return String::new();
    }
    // 16 columns: "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)," is ~35 chars
    let mut sql = String::with_capacity(200 + num_rows * 35);
    sql.push_str(
        "INSERT INTO tracks (
            id, title, artist, album, duration_sec,
            title_norm, artist_norm, quality,
            spotify_id, popularity, tempo, musical_key, mode, time_signature,
            isrc, album_image_url
        ) VALUES ",
    );
    for i in 0..num_rows {
        if i > 0 {
            sql.push(',');
        }
        sql.push_str("(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    }
    sql
}

/// Write enriched tracks to output database using batched multi-value INSERTs.
/// Optimized for ~3.8M rows with 16 columns each.
fn write_enriched_output(conn: &mut Connection, tracks: &[EnrichedTrack]) -> Result<()> {
    let phase_start = Instant::now();
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

        -- Partial index for FTS popularity ranking (filters to ~68% of tracks)
        -- Speeds up: WHERE popularity IS NOT NULL ORDER BY popularity DESC
        CREATE INDEX idx_tracks_popularity ON tracks(popularity DESC) WHERE popularity IS NOT NULL;

        CREATE VIRTUAL TABLE tracks_fts USING fts5(
            title, artist,
            content='tracks',
            content_rowid='id',
            tokenize='porter'
        );

        -- Popularity-ranked search surface for fast FTS queries
        -- search_id is assigned by popularity rank (1 = most popular)
        -- This allows ORDER BY rowid ASC to return top popular results
        -- without sorting the full match set (FTS5 can early-terminate on rowid order)
        CREATE TABLE tracks_search (
            search_id   INTEGER PRIMARY KEY,  -- 1..N assigned by popularity DESC
            track_id    INTEGER NOT NULL,     -- original tracks.id
            title       TEXT NOT NULL,
            artist      TEXT NOT NULL,
            album       TEXT,
            duration_sec INTEGER NOT NULL,
            popularity  INTEGER,
            quality     INTEGER,
            spotify_id  TEXT,
            tempo       REAL,
            isrc        TEXT,
            album_image_url TEXT
        );

        -- FTS index for popularity-ranked search surface
        -- detail=none: smaller index, no phrase/NEAR queries (not needed for search box)
        -- columnsize=0: skip column sizes (not using BM25 heavily)
        CREATE VIRTUAL TABLE tracks_search_fts USING fts5(
            title, artist,
            content='tracks_search',
            content_rowid='search_id',
            tokenize='porter',
            detail=none,
            columnsize=0
        );

        -- Match failures table for post-hoc analysis (spec-05)
        CREATE TABLE match_failures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            -- LRCLIB entry (best quality variant from group)
            lrclib_id INTEGER NOT NULL,
            lrclib_title TEXT NOT NULL,
            lrclib_artist TEXT NOT NULL,
            lrclib_album TEXT,
            lrclib_duration_sec INTEGER NOT NULL,
            lrclib_title_norm TEXT NOT NULL,
            lrclib_artist_norm TEXT NOT NULL,
            lrclib_quality INTEGER NOT NULL,
            group_variant_count INTEGER NOT NULL,

            -- Failure info
            failure_reason TEXT NOT NULL,
            best_score INTEGER,

            -- Spotify candidates (JSON array, top 5)
            spotify_candidates TEXT,

            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX idx_failures_reason ON match_failures(failure_reason);
        CREATE INDEX idx_failures_quality ON match_failures(lrclib_quality DESC);
        CREATE INDEX idx_failures_artist ON match_failures(lrclib_artist_norm);",
    )?;

    let pb = create_progress_bar(tracks.len() as u64, "Phase 3: Writing enriched tracks");

    // Pre-build SQL for full batches
    let batch_sql = build_enriched_batch_sql(ENRICHED_BATCH_SIZE);
    let mut written = 0u64;

    let tx = conn.transaction()?;

    for chunk in tracks.chunks(ENRICHED_BATCH_SIZE) {
        // Use pre-built SQL for full batches, build custom for final partial batch
        let sql = if chunk.len() == ENRICHED_BATCH_SIZE {
            &batch_sql
        } else {
            &build_enriched_batch_sql(chunk.len())
        };

        let mut stmt = tx.prepare_cached(sql)?;

        // Build flat parameter array using array literals (no heap allocation per row)
        let params: Vec<&dyn rusqlite::ToSql> = chunk
            .iter()
            .flat_map(|t| {
                [
                    &t.lrclib_id as &dyn rusqlite::ToSql,
                    &t.title as &dyn rusqlite::ToSql,
                    &t.artist as &dyn rusqlite::ToSql,
                    &t.album as &dyn rusqlite::ToSql,
                    &t.duration_sec as &dyn rusqlite::ToSql,
                    &t.title_norm as &dyn rusqlite::ToSql,
                    &t.artist_norm as &dyn rusqlite::ToSql,
                    &t.quality as &dyn rusqlite::ToSql,
                    &t.spotify_id as &dyn rusqlite::ToSql,
                    &t.popularity as &dyn rusqlite::ToSql,
                    &t.tempo as &dyn rusqlite::ToSql,
                    &t.musical_key as &dyn rusqlite::ToSql,
                    &t.mode as &dyn rusqlite::ToSql,
                    &t.time_signature as &dyn rusqlite::ToSql,
                    &t.isrc as &dyn rusqlite::ToSql,
                    &t.album_image_url as &dyn rusqlite::ToSql,
                ]
            })
            .collect();

        stmt.execute(params.as_slice())?;
        written += chunk.len() as u64;
        pb.set_position(written);

        // Tail-friendly logging
        if written % 500_000 == 0 {
            eprintln!(
                "[WRITE] {}/{} ({:.1}%)",
                written,
                tracks.len(),
                100.0 * written as f64 / tracks.len() as f64
            );
        }
    }

    tx.commit()?;

    pb.finish_with_message(format!("Phase 3: Wrote {} enriched tracks", tracks.len()));
    eprintln!(
        "[WRITE] Complete: {} tracks written ({})",
        tracks.len(),
        format_duration(phase_start.elapsed())
    );
    Ok(())
}

// ============================================================================
// Match Failure Logging (spec-05)
// ============================================================================

/// Determine if a failure should be logged.
/// Only logs high-quality tracks with clean titles that failed to match.
fn should_log_failure(group: &LrclibGroup, best_score: Option<i32>) -> bool {
    // Get the best quality variant for evaluation
    let best_variant = group.tracks.iter().max_by_key(|t| t.quality);
    let best_variant = match best_variant {
        Some(v) => v,
        None => return false,
    };

    // Only log high-quality tracks (quality >= 30)
    let is_high_quality = best_variant.quality >= 30;

    // Only log clean titles (no garbage patterns)
    let has_clean_title = !has_garbage_title_pattern(&best_variant.track.title);

    // Either no match, or low-confidence match (score < ACCEPT_THRESHOLD)
    let is_failure_or_marginal = match best_score {
        None => true,                            // No match at all
        Some(s) if s < ACCEPT_THRESHOLD => true, // Below acceptance threshold
        _ => false,                              // Good match, don't log
    };

    is_high_quality && has_clean_title && is_failure_or_marginal
}

/// Match failure entry ready for database insertion.
/// Contains all data needed to write to match_failures table.
#[derive(Clone, Debug)]
struct MatchFailureEntry {
    // LRCLIB entry info
    lrclib_id: i64,
    lrclib_title: String,
    lrclib_artist: String,
    lrclib_album: Option<String>,
    lrclib_duration_sec: i64,
    lrclib_title_norm: String,
    lrclib_artist_norm: String,
    lrclib_quality: i32,
    group_variant_count: usize,
    // Failure info
    failure_reason: FailureReason,
    best_score: Option<i32>,
    spotify_candidates: Vec<SpotifyCandidate>,
}

/// Collect match failures from groups for logging.
/// Returns fully populated failure entries ready for database insertion.
fn collect_match_failures(
    groups: &[LrclibGroup],
    groups_seen: &FxHashSet<usize>,
) -> Vec<MatchFailureEntry> {
    let mut failures: Vec<MatchFailureEntry> = Vec::new();

    for (idx, group) in groups.iter().enumerate() {
        // Get best score (if any match exists)
        let best_score = group.best_match.as_ref().map(|(_, _, s)| *s);

        // Check if this failure should be logged
        if !should_log_failure(group, best_score) {
            continue;
        }

        let was_seen = groups_seen.contains(&idx);

        let reason = match (group.best_match.as_ref(), was_seen) {
            // No match and no candidates were seen
            (None, false) => FailureReason::NoSpotifyCandidates,

            // No match but candidates were seen (all rejected)
            (None, true) => FailureReason::AllCandidatesRejected {
                candidate_count: 0, // We don't track exact count
                best_score: 0,
                primary_reject_reason: "score_below_threshold".to_string(),
            },

            // Match exists but below threshold (shouldn't happen if should_log_failure is correct)
            (Some((_, _, score)), _) if *score < ACCEPT_THRESHOLD => {
                FailureReason::AllCandidatesRejected {
                    candidate_count: 1,
                    best_score: *score,
                    primary_reject_reason: "score_below_threshold".to_string(),
                }
            }

            // Match exists but below low-confidence threshold
            (Some((_, _, score)), _) if *score < LOW_CONFIDENCE_THRESHOLD => {
                FailureReason::LowConfidenceMatch {
                    accepted_score: *score,
                    threshold: LOW_CONFIDENCE_THRESHOLD,
                }
            }

            // Good match - shouldn't be here
            _ => continue,
        };

        // Get best quality variant for logging
        let best_variant = group.tracks.iter().max_by_key(|t| t.quality);
        let best_variant = match best_variant {
            Some(v) => v,
            None => continue,
        };

        // Create candidate info from best match if available
        let candidates: Vec<SpotifyCandidate> = match &group.best_match {
            Some((track_idx, spotify, score)) => {
                let variant = &group.tracks[*track_idx];
                vec![SpotifyCandidate {
                    spotify_id: spotify.id.clone(),
                    spotify_name: spotify.name.clone(),
                    spotify_artist: spotify.artist.clone(),
                    spotify_duration_ms: spotify.duration_ms,
                    spotify_popularity: spotify.popularity,
                    duration_diff_sec: (variant.track.duration_sec - spotify.duration_ms / 1000)
                        .abs(),
                    score: *score,
                    reject_reason: if *score < ACCEPT_THRESHOLD {
                        Some("score_below_threshold".to_string())
                    } else {
                        None
                    },
                }]
            }
            None => vec![],
        };

        failures.push(MatchFailureEntry {
            lrclib_id: best_variant.track.id,
            lrclib_title: best_variant.track.title.clone(),
            lrclib_artist: best_variant.track.artist.clone(),
            lrclib_album: best_variant.track.album.clone(),
            lrclib_duration_sec: best_variant.track.duration_sec,
            lrclib_title_norm: group.key.0.clone(),
            lrclib_artist_norm: group.key.1.clone(),
            lrclib_quality: best_variant.quality,
            group_variant_count: group.tracks.len(),
            failure_reason: reason,
            best_score,
            spotify_candidates: candidates,
        });
    }

    failures
}

/// Prepared failure entry with pre-serialized JSON for batched insertion.
struct PreparedFailureEntry {
    lrclib_id: i64,
    lrclib_title: String,
    lrclib_artist: String,
    lrclib_album: Option<String>,
    lrclib_duration_sec: i64,
    lrclib_title_norm: String,
    lrclib_artist_norm: String,
    lrclib_quality: i32,
    group_variant_count: usize,
    failure_reason: String,
    best_score: Option<i32>,
    candidates_json: String,
}

/// Write match failure logs to the database using batched INSERTs.
fn write_match_failures(conn: &Connection, failures: &[MatchFailureEntry]) -> Result<()> {
    if failures.is_empty() {
        println!("[FAILURES] No match failures to log");
        return Ok(());
    }

    const BATCH_SIZE: usize = 500;
    let total_batches = failures.len().div_ceil(BATCH_SIZE);
    println!(
        "[FAILURES] Logging {} match failures in {} batches...",
        failures.len(),
        total_batches
    );

    let pb = create_progress_bar(failures.len() as u64, "Writing failure logs");

    // Pre-process entries: serialize JSON and convert reason to string
    let prepared: Vec<PreparedFailureEntry> = failures
        .iter()
        .map(|entry| {
            let candidates_json =
                serde_json::to_string(&entry.spotify_candidates.iter().take(5).collect::<Vec<_>>())
                    .unwrap_or_else(|_| "[]".to_string());

            let reason_str = match &entry.failure_reason {
                FailureReason::NoSpotifyCandidates => "no_candidates",
                FailureReason::AllCandidatesRejected { .. } => "all_rejected",
                FailureReason::LowConfidenceMatch { .. } => "low_confidence",
            };

            PreparedFailureEntry {
                lrclib_id: entry.lrclib_id,
                lrclib_title: entry.lrclib_title.clone(),
                lrclib_artist: entry.lrclib_artist.clone(),
                lrclib_album: entry.lrclib_album.clone(),
                lrclib_duration_sec: entry.lrclib_duration_sec,
                lrclib_title_norm: entry.lrclib_title_norm.clone(),
                lrclib_artist_norm: entry.lrclib_artist_norm.clone(),
                lrclib_quality: entry.lrclib_quality,
                group_variant_count: entry.group_variant_count,
                failure_reason: reason_str.to_string(),
                best_score: entry.best_score,
                candidates_json,
            }
        })
        .collect();

    // Write in batches using multi-value INSERTs
    let mut written = 0u64;
    for chunk in prepared.chunks(BATCH_SIZE) {
        execute_failure_batch_insert(conn, chunk)?;
        written += chunk.len() as u64;
        pb.set_position(written);

        // Tail-friendly logging
        if written % 100_000 == 0 {
            eprintln!(
                "[FAILURES] {}/{} ({:.1}%)",
                written,
                failures.len(),
                100.0 * written as f64 / failures.len() as f64
            );
        }
    }

    pb.finish_with_message(format!(
        "[FAILURES] Logged {} match failures",
        failures.len()
    ));
    Ok(())
}

/// Build a multi-value INSERT SQL statement for failure entries.
/// Pre-building avoids repeated string allocation during batch writes.
fn build_failure_batch_sql(num_rows: usize) -> String {
    if num_rows == 0 {
        return String::new();
    }
    // 12 columns: "(?,?,?,?,?,?,?,?,?,?,?,?)," is ~26 chars
    let mut sql = String::with_capacity(200 + num_rows * 26);
    sql.push_str(
        "INSERT INTO match_failures (
            lrclib_id, lrclib_title, lrclib_artist, lrclib_album,
            lrclib_duration_sec, lrclib_title_norm, lrclib_artist_norm,
            lrclib_quality, group_variant_count,
            failure_reason, best_score, spotify_candidates
        ) VALUES ",
    );
    for i in 0..num_rows {
        if i > 0 {
            sql.push(',');
        }
        sql.push_str("(?,?,?,?,?,?,?,?,?,?,?,?)");
    }
    sql
}

/// Execute a batched INSERT for failure entries.
/// Uses array literals instead of vec![] for flat_map to avoid heap allocations.
fn execute_failure_batch_insert(conn: &Connection, batch: &[PreparedFailureEntry]) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }

    let sql = build_failure_batch_sql(batch.len());
    let mut stmt = conn.prepare_cached(&sql)?;

    // Flatten batch into parameter list using array literals (no heap allocation per row)
    let params: Vec<&dyn rusqlite::ToSql> = batch
        .iter()
        .flat_map(|e| {
            [
                &e.lrclib_id as &dyn rusqlite::ToSql,
                &e.lrclib_title as &dyn rusqlite::ToSql,
                &e.lrclib_artist as &dyn rusqlite::ToSql,
                &e.lrclib_album as &dyn rusqlite::ToSql,
                &e.lrclib_duration_sec as &dyn rusqlite::ToSql,
                &e.lrclib_title_norm as &dyn rusqlite::ToSql,
                &e.lrclib_artist_norm as &dyn rusqlite::ToSql,
                &e.lrclib_quality as &dyn rusqlite::ToSql,
                &e.group_variant_count as &dyn rusqlite::ToSql,
                &e.failure_reason as &dyn rusqlite::ToSql,
                &e.best_score as &dyn rusqlite::ToSql,
                &e.candidates_json as &dyn rusqlite::ToSql,
            ]
        })
        .collect();

    stmt.execute(params.as_slice())?;
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
            (Some(k), Some(m)) if (0..=11).contains(&k) => {
                let pitch_classes = [
                    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
                ];
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

    // Set global log-only mode
    LOG_ONLY.store(args.log_only, std::sync::atomic::Ordering::Relaxed);

    if args.workers > 0 {
        rayon::ThreadPoolBuilder::new()
            .num_threads(args.workers)
            .build_global()
            .context("Failed to set thread pool size")?;
    }

    let start = Instant::now();

    // Phase 1: Read LRCLIB tracks (source of truth)
    println!("Opening source database: {:?}", args.source);
    let source_conn = Connection::open(&args.source).context("Failed to open source database")?;

    source_conn.execute_batch(
        "PRAGMA mmap_size = 8589934592;
         PRAGMA cache_size = -1000000;
         PRAGMA temp_store = MEMORY;",
    )?;

    let artist_filter: Option<Vec<String>> = args
        .artists
        .clone()
        .map(|s| s.split(',').map(|a| a.trim().to_string()).collect());

    if let Some(ref artists) = artist_filter {
        println!("Filtering by artists: {:?}", artists);
    }

    let tracks = read_tracks(&source_conn, artist_filter.as_ref())?;
    drop(source_conn);

    // Phase 2: Build groups and index (delayed canonical selection - spec-03)
    let (mut groups, index) = build_groups_and_index(tracks);
    println!("\nBuilt {} unique (title, artist) groups", groups.len());

    // Build title-only index for 2-phase Spotify matching
    let title_only_index = build_title_only_index(&groups);

    // Phase 3: Spotify enrichment with delayed canonical selection
    // Track which groups had Spotify candidates for failure logging
    let mut groups_seen: FxHashSet<usize> = FxHashSet::default();

    // Initialize stats for instrumentation (spec-07)
    let mut stats = MatchingStats {
        total_groups: groups.len(),
        ..Default::default()
    };

    let (enriched_tracks, failure_data) = if let Some(ref spotify_path) = args.spotify {
        // Open Spotify DB with read-only optimizations
        println!("\nOpening Spotify database: {:?}", spotify_path);
        let spotify_conn =
            Connection::open(spotify_path).context("Failed to open Spotify database")?;
        spotify_conn.execute_batch(
            "PRAGMA query_only = 1;
             PRAGMA journal_mode = OFF;
             PRAGMA synchronous = OFF;
             PRAGMA temp_store = MEMORY;
             PRAGMA cache_size = -500000;
             PRAGMA mmap_size = 8589934592;
             PRAGMA locking_mode = EXCLUSIVE;",
        )?;

        // Use pre-normalized Spotify index if available (much faster)
        if let Some(ref spotify_norm_path) = args.spotify_normalized {
            // Match LRCLIB → Spotify using indexed lookup (no memory load)
            match_lrclib_to_spotify_normalized(
                &spotify_conn,
                spotify_norm_path,
                &mut groups,
                &mut groups_seen,
                &mut stats,
            )?;

            // Title-first rescue pass for no_candidates groups (spec-06)
            let rescue_matches = title_first_rescue(
                &spotify_conn,
                spotify_norm_path,
                &mut groups,
                &groups_seen,
                &mut stats,
            )?;
            if rescue_matches > 0 {
                let total = groups.len();
                let matched = groups.iter().filter(|g| g.best_match.is_some()).count();
                let rate = 100.0 * matched as f64 / total as f64;
                println!(
                    "[MATCH] After rescue: {:.1}% ({} total, +{} from rescue)",
                    rate, matched, rescue_matches
                );
            }

            // Phase 2b: Fuzzy title matching for remaining unmatched groups
            let fuzzy_matches = fuzzy_title_rescue(
                &spotify_conn,
                spotify_norm_path,
                &mut groups,
                &groups_seen,
                &mut stats,
            )?;
            if fuzzy_matches > 0 {
                let total = groups.len();
                let matched = groups.iter().filter(|g| g.best_match.is_some()).count();
                let rate = 100.0 * matched as f64 / total as f64;
                println!(
                    "[MATCH] After fuzzy: {:.1}% ({} total, +{} from fuzzy)",
                    rate, matched, fuzzy_matches
                );
            }

            // Phase 2c: Album upgrade pass - promote Single/Compilation to Album
            let album_upgrades =
                album_upgrade_pass(&spotify_conn, spotify_norm_path, &mut groups, &mut stats)?;
            if album_upgrades > 0 {
                println!(
                    "[MATCH] Album upgrade: {} matches upgraded to Album releases",
                    album_upgrades
                );
            }

            // Fallback: search pop=0 tracks for unmatched groups
            let pop0_matches =
                match_pop0_fallback(&spotify_conn, &mut groups, &mut groups_seen, &mut stats)?;

            if pop0_matches > 0 {
                let total = groups.len();
                let matched = groups_seen.len();
                let rate = 100.0 * matched as f64 / total as f64;
                println!(
                    "[MATCH] Updated match rate: {:.1}% ({} total, +{} from pop=0)",
                    rate, matched, pop0_matches
                );
            }
        } else {
            // Fall back to streaming all Spotify tracks (slow)
            stream_and_match_spotify_delayed(
                &spotify_conn,
                args.min_popularity,
                &mut groups,
                &index,
                &title_only_index,
                &mut groups_seen,
            )?;
        }

        // Collect match failures BEFORE consuming groups (spec-05)
        let failures = if args.log_failures {
            let f = collect_match_failures(&groups, &groups_seen);
            println!("[FAILURES] Found {} potential failures to log", f.len());
            Some(f)
        } else {
            None
        };

        // Collect IDs we actually need for audio features and images
        let (needed_track_ids, needed_album_rowids) = collect_needed_ids_from_groups(&groups);

        // Load audio features using batched IN queries (spec-02 optimization)
        let audio_lookup = if let Some(ref af_path) = args.audio_features {
            println!("\nOpening audio features database: {:?}", af_path);
            let af_conn =
                Connection::open(af_path).context("Failed to open audio features database")?;
            af_conn.execute_batch(
                "PRAGMA query_only = 1;
                 PRAGMA journal_mode = OFF;
                 PRAGMA synchronous = OFF;
                 PRAGMA temp_store = MEMORY;
                 PRAGMA cache_size = -500000;
                 PRAGMA mmap_size = 8589934592;
                 PRAGMA locking_mode = EXCLUSIVE;",
            )?;
            load_audio_features_batched(&af_conn, &needed_track_ids)?
        } else {
            FxHashMap::default()
        };

        // Load album images using batched IN queries (spec-02 optimization)
        let image_lookup = load_album_images_batched(&spotify_conn, &needed_album_rowids)?;

        // Select canonical and enrich (delayed selection - spec-03)
        println!("\nSelecting canonical tracks and enriching...");
        let enriched = select_canonical_and_enrich(groups, &audio_lookup, &image_lookup);

        // Deduplicate by spotify_id - multiple LRCLIB groups may match same Spotify track
        let enriched = deduplicate_by_spotify_id(enriched);

        (enriched, failures)
    } else {
        // No Spotify data: select best quality variant from each group
        println!("\nNo Spotify data - selecting canonical by quality...");
        let enriched =
            select_canonical_and_enrich(groups, &FxHashMap::default(), &FxHashMap::default());
        // No dedup needed when there's no Spotify matching
        (enriched, None)
    };

    // Phase 3: Write output
    // Safety check: prevent accidentally deleting source databases
    let mut source_paths: Vec<&std::path::Path> = vec![&args.source];
    if let Some(ref spotify) = args.spotify {
        source_paths.push(spotify);
    }
    if let Some(ref spotify_norm) = args.spotify_normalized {
        source_paths.push(spotify_norm);
    }
    if let Some(ref audio_features) = args.audio_features {
        source_paths.push(audio_features);
    }
    validate_output_path(&args.output, "enriched", &source_paths)?;

    if args.output.exists() {
        std::fs::remove_file(&args.output).context("Failed to remove existing output file")?;
    }

    println!("\nCreating output database: {:?}", args.output);
    let mut output_conn =
        Connection::open(&args.output).context("Failed to create output database")?;

    write_enriched_output(&mut output_conn, &enriched_tracks)?;

    // Write match failure logs (spec-05)
    if let Some(ref failures) = failure_data {
        write_match_failures(&output_conn, failures)?;
    }

    // Phase 4-5: FTS & optimize
    build_fts_index(&output_conn)?;
    optimize_database(&output_conn)?;

    let elapsed = start.elapsed();
    let file_size = std::fs::metadata(&args.output)?.len();

    // Calculate match statistics
    let matched_count = enriched_tracks
        .iter()
        .filter(|t| t.spotify_id.is_some())
        .count();
    let match_rate = if !enriched_tracks.is_empty() {
        100.0 * matched_count as f64 / enriched_tracks.len() as f64
    } else {
        0.0
    };

    // Finalize stats (spec-07)
    stats.total_matches = matched_count;
    stats.total_failures = enriched_tracks.len() - matched_count;
    stats.elapsed_seconds = elapsed.as_secs_f64();

    // Log final stats to stderr
    stats.log_phase("FINAL");

    // Export stats to JSON if requested (spec-07)
    if let Some(ref stats_path) = args.export_stats {
        stats.write_to_file(stats_path)?;
        println!("[STATS] Exported to {:?}", stats_path);
    }

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

#[cfg(test)]
#[allow(clippy::field_reassign_with_default)]
mod tests {
    use super::*;
    use crate::normalize::{fold_to_ascii, normalize_punctuation};

    #[test]
    fn test_track_number_stripping() {
        assert_eq!(
            normalize_title("03 - Love You To Death"),
            "love you to death"
        );
        assert_eq!(normalize_title("Track 5 - Song Name"), "song name");
        assert_eq!(normalize_title("01. First Song"), "first song");
        assert_eq!(normalize_title("0958 - Artist - Song"), "artist - song");
        // Space-only track number (e.g., "16 Eleanor Rigby")
        assert_eq!(normalize_title("16 Eleanor Rigby"), "eleanor rigby");
        // Leading-zero track numbers (e.g., "02 Panic Room")
        assert_eq!(normalize_title("02 Panic Room"), "panic room");
        assert_eq!(normalize_title("09 Song Title"), "song title");
        // Should NOT strip single digit followed by lowercase (e.g., "7 rings")
        assert_eq!(normalize_title("7 rings"), "7 rings");
    }

    #[test]
    fn test_bracket_suffix_stripping() {
        assert_eq!(normalize_title("Song Name [Mono]"), "song name");
        assert_eq!(normalize_title("Song Name [RM1]"), "song name");
        assert_eq!(normalize_title("Song Name [take 2]"), "song name");
        // Multiple brackets: [Live] is stripped by TITLE_PATTERNS (live pattern), [Bonus] by BRACKET_SUFFIX
        assert_eq!(normalize_title("Song [Live] [Bonus]"), "song");
    }

    #[test]
    fn test_file_extension_stripping() {
        assert_eq!(normalize_title("Ask Me Why.flac"), "ask me why");
        assert_eq!(normalize_title("Song.mp3"), "song");
        assert_eq!(normalize_title("Track.wav"), "track");
    }

    #[test]
    fn test_year_suffix_stripping() {
        assert_eq!(
            normalize_title("I Call Your Name (1964)"),
            "i call your name"
        );
        assert_eq!(normalize_title("Something (2009)"), "something");
    }

    #[test]
    fn test_encoding_fixes() {
        // ? to apostrophe
        assert_eq!(
            normalize_punctuation("Can?t Buy Me Love"),
            "Can't Buy Me Love"
        );
        assert_eq!(normalize_punctuation("Don?t Stop"), "Don't Stop");
        // Apostrophe spacing
        assert_eq!(
            normalize_punctuation("She s Leaving Home"),
            "She's Leaving Home"
        );
    }

    #[test]
    fn test_diacritic_folding() {
        assert_eq!(fold_to_ascii("Beyoncé"), "beyonce");
        assert_eq!(fold_to_ascii("naïve"), "naive");
        assert_eq!(fold_to_ascii("Motörhead"), "motorhead");
        assert_eq!(fold_to_ascii("Sigur Rós"), "sigur ros");
    }

    #[test]
    fn test_artist_prefix_stripping() {
        assert_eq!(
            normalize_title_with_artist("Type O Negative - Love You To Death", "Type O Negative"),
            "love you to death"
        );
        assert_eq!(
            normalize_title_with_artist("Metallica: Enter Sandman", "Metallica"),
            "enter sandman"
        );
    }

    #[test]
    fn test_the_prefix_stripping() {
        // "The" prefix should be stripped from artist names
        assert_eq!(normalize_artist("The Beatles"), "beatles");
        assert_eq!(normalize_artist("The Rolling Stones"), "rolling stones");
        assert_eq!(normalize_artist("The Offspring"), "offspring");
        assert_eq!(normalize_artist("Beatles"), "beatles"); // Already without "The"
        assert_eq!(normalize_artist("Thea Gilmore"), "thea gilmore"); // "Thea" not "The "
    }

    #[test]
    fn test_punctuation_normalization() {
        assert_eq!(
            normalize_punctuation("Rock \u{2018}n\u{2019} Roll"),
            "Rock 'n' Roll"
        );
        assert_eq!(
            normalize_punctuation("\u{201C}Quoted\u{201D}"),
            "\"Quoted\""
        );
        assert_eq!(normalize_punctuation("Rock & Roll"), "Rock and Roll");
    }

    #[test]
    fn test_mojibake_cleanup() {
        assert_eq!(normalize_title("Song Title\u{FFFD}"), "song title");
        assert_eq!(normalize_title("Song Title\u{FFFD}\u{FFFD}"), "song title");
    }

    #[test]
    fn test_combined_normalization() {
        // Track number + diacritics + remaster suffix
        assert_eq!(
            normalize_title("03 - Beyoncé - Single Ladies (Remastered 2020)"),
            "beyonce - single ladies"
        );
    }

    // ========================================================================
    // Spec-04: Combined Scoring Tests
    // ========================================================================

    #[test]
    fn test_duration_score() {
        // Perfect match (0s diff)
        assert_eq!(duration_score(429, 429_000), 100);
        // 1s off
        assert_eq!(duration_score(430, 429_000), 100);
        // 3s off
        assert_eq!(duration_score(432, 429_000), 80);
        // 7s off
        assert_eq!(duration_score(436, 429_000), 50);
        // 15s off
        assert_eq!(duration_score(414, 429_000), 25);
        // 29s off
        assert_eq!(duration_score(400, 429_000), 10);
        // 35s off - relaxed, very low score (spec-05)
        assert_eq!(duration_score(394, 429_000), 5);
        // 50s off - relaxed, minimal score (spec-05)
        assert_eq!(duration_score(379, 429_000), 2);
        // 65s off - hard reject beyond 60s
        assert_eq!(duration_score(364, 429_000), -1000);
    }

    // ========================================================================
    // Spec-05: Adaptive Duration Tolerance Tests
    // ========================================================================

    #[test]
    fn test_max_duration_tolerance_confidence_levels() {
        // High confidence: base 60s
        assert_eq!(max_duration_tolerance(MatchConfidence::High, 200), 60);
        // Medium confidence: base 45s
        assert_eq!(max_duration_tolerance(MatchConfidence::Medium, 200), 45);
        // Low confidence: base 30s
        assert_eq!(max_duration_tolerance(MatchConfidence::Low, 200), 30);
    }

    #[test]
    fn test_max_duration_tolerance_ratio_based() {
        // For long tracks (>5 min = 300s), ratio-based tolerance kicks in
        // 600s track: 10% = 60s, matches High confidence base
        assert_eq!(max_duration_tolerance(MatchConfidence::High, 600), 60);
        // 700s track: 10% = 70s, exceeds High confidence base
        assert_eq!(max_duration_tolerance(MatchConfidence::High, 700), 70);
        // 900s track: 10% = 90s, at cap
        assert_eq!(max_duration_tolerance(MatchConfidence::High, 900), 90);
        // 1000s track: 10% = 100s, but capped at 90s
        assert_eq!(max_duration_tolerance(MatchConfidence::High, 1000), 90);
    }

    #[test]
    fn test_max_duration_tolerance_low_confidence_short_tracks() {
        // Short tracks with low confidence stay at 30s base
        assert_eq!(max_duration_tolerance(MatchConfidence::Low, 180), 30);
        assert_eq!(max_duration_tolerance(MatchConfidence::Low, 240), 30);
    }

    #[test]
    fn test_artist_similarity() {
        // Exact match
        assert!(
            (compute_artist_similarity("type o negative", "type o negative") - 1.0).abs() < 0.001
        );
        // Partial match (3 of 4 tokens)
        let sim = compute_artist_similarity("type o negative", "type o");
        assert!(sim > 0.5 && sim < 1.0);
        // Different artists
        assert!(compute_artist_similarity("metallica", "beatles") < 0.3);
        // Empty strings
        assert_eq!(compute_artist_similarity("", "metallica"), 0.0);
        assert_eq!(compute_artist_similarity("metallica", ""), 0.0);
    }

    #[test]
    fn test_combined_score_basics() {
        let lrclib_track = Track {
            id: 1,
            title: "Love You To Death".to_string(),
            artist: "Type O Negative".to_string(),
            album: Some("October Rust".to_string()),
            duration_sec: 429,
        };
        let spotify_track = SpotifyTrack {
            id: "abc123".to_string(),
            name: "Love You to Death".to_string(),
            artist: "Type O Negative".to_string(),
            artists: vec!["Type O Negative".to_string()],
            duration_ms: 429_000,
            popularity: 64,
            isrc: None,
            album_rowid: 1,
            album_type: SpotifyAlbumType::Album,
        };

        let score = combined_score(&lrclib_track, 40, &spotify_track, "type o negative");

        // Should be a good match:
        // duration: 100 (perfect)
        // artist: 50 (exact match)
        // quality: 40 (passed in)
        // clean title bonus: 30 (no garbage pattern)
        // popularity: 6 (64/10)
        // Total: 226
        assert!(score >= ACCEPT_THRESHOLD);
        assert_eq!(score, 226);
    }

    #[test]
    fn test_combined_score_duration_reject() {
        let lrclib_track = Track {
            id: 1,
            title: "Song".to_string(),
            artist: "Artist".to_string(),
            album: None,
            duration_sec: 300,
        };
        let spotify_track = SpotifyTrack {
            id: "abc123".to_string(),
            name: "Song".to_string(),
            artist: "Artist".to_string(),
            artists: vec!["Artist".to_string()],
            duration_ms: 200_000, // 100s diff - way over 30s limit
            popularity: 80,
            isrc: None,
            album_rowid: 1,
            album_type: SpotifyAlbumType::Album,
        };

        let score = combined_score(&lrclib_track, 40, &spotify_track, "artist");
        assert!(score < 0); // Should be rejected
    }

    #[test]
    fn test_combined_score_artist_mismatch() {
        let lrclib_track = Track {
            id: 1,
            title: "Song".to_string(),
            artist: "Artist One".to_string(),
            album: None,
            duration_sec: 200,
        };
        let spotify_track = SpotifyTrack {
            id: "abc123".to_string(),
            name: "Song".to_string(),
            artist: "Completely Different".to_string(), // No token overlap
            artists: vec!["Completely Different".to_string()],
            duration_ms: 200_000,
            popularity: 80,
            isrc: None,
            album_rowid: 1,
            album_type: SpotifyAlbumType::Album,
        };

        let score = combined_score(&lrclib_track, 40, &spotify_track, "artist one");
        assert!(score < 0); // Should be rejected due to artist mismatch
    }

    #[test]
    fn test_combined_score_relaxed_match_exact_artist() {
        // Spec-05: Relaxed matches (>30s diff) are allowed with exact artist match
        let lrclib_track = Track {
            id: 1,
            title: "Radio Edit".to_string(),
            artist: "Artist".to_string(),
            album: Some("Album".to_string()),
            duration_sec: 250, // 4:10
        };
        let spotify_track = SpotifyTrack {
            id: "abc123".to_string(),
            name: "Radio Edit".to_string(),
            artist: "Artist".to_string(),
            artists: vec!["Artist".to_string()],
            duration_ms: 295_000, // 4:55 = 45s diff (relaxed)
            popularity: 50,
            isrc: None,
            album_rowid: 1,
            album_type: SpotifyAlbumType::Album,
        };

        let score = combined_score(&lrclib_track, 40, &spotify_track, "artist");
        // With exact artist match, relaxed match should be accepted
        // Score breakdown:
        // duration: 5 (31-45s range)
        // artist: 50 (exact)
        // quality: 40
        // clean title: 30
        // relaxed penalty: -20
        // popularity: 5
        // Total: 110
        assert!(
            score >= ACCEPT_THRESHOLD,
            "Relaxed match with exact artist should be accepted, got {}",
            score
        );
        assert_eq!(score, 110);
    }

    #[test]
    fn test_combined_score_relaxed_match_partial_artist_rejected() {
        // Spec-05: Relaxed matches (>30s diff) require exact artist match
        let lrclib_track = Track {
            id: 1,
            title: "Song".to_string(),
            artist: "Artist Foo".to_string(),
            album: None,
            duration_sec: 250,
        };
        let spotify_track = SpotifyTrack {
            id: "abc123".to_string(),
            name: "Song".to_string(),
            artist: "Artist Bar".to_string(), // Only partial match
            artists: vec!["Artist Bar".to_string()],
            duration_ms: 295_000, // 45s diff (relaxed)
            popularity: 50,
            isrc: None,
            album_rowid: 1,
            album_type: SpotifyAlbumType::Album,
        };

        let score = combined_score(&lrclib_track, 40, &spotify_track, "artist foo");
        // Relaxed match without exact artist should be rejected
        assert!(
            score < 0,
            "Relaxed match with partial artist should be rejected, got {}",
            score
        );
    }

    #[test]
    fn test_combined_score_60s_diff_with_exact_artist() {
        // Spec-05: Even 60s diff should work with high confidence
        let lrclib_track = Track {
            id: 1,
            title: "Extended Mix".to_string(),
            artist: "DJ Artist".to_string(),
            album: Some("Singles".to_string()),
            duration_sec: 300, // 5:00
        };
        let spotify_track = SpotifyTrack {
            id: "abc123".to_string(),
            name: "Extended Mix".to_string(),
            artist: "DJ Artist".to_string(),
            artists: vec!["DJ Artist".to_string()],
            duration_ms: 360_000, // 6:00 = 60s diff
            popularity: 70,
            isrc: None,
            album_rowid: 1,
            album_type: SpotifyAlbumType::Album,
        };

        let score = combined_score(&lrclib_track, 40, &spotify_track, "dj artist");
        // 60s diff with exact artist should be accepted (barely)
        // duration: 2 (46-60s range)
        // artist: 50
        // quality: 40
        // clean title: 30
        // relaxed penalty: -20
        // popularity: 7
        // Total: 109
        assert!(
            score >= ACCEPT_THRESHOLD,
            "60s diff with exact artist should be accepted, got {}",
            score
        );
    }

    #[test]
    fn test_combined_score_beyond_60s_rejected() {
        // Spec-05: Beyond 60s should be rejected even with exact artist
        let lrclib_track = Track {
            id: 1,
            title: "Song".to_string(),
            artist: "Artist".to_string(),
            album: None,
            duration_sec: 180, // 3:00
        };
        let spotify_track = SpotifyTrack {
            id: "abc123".to_string(),
            name: "Song".to_string(),
            artist: "Artist".to_string(),
            artists: vec!["Artist".to_string()],
            duration_ms: 250_000, // 4:10 = 70s diff
            popularity: 80,
            isrc: None,
            album_rowid: 1,
            album_type: SpotifyAlbumType::Album,
        };

        let score = combined_score(&lrclib_track, 40, &spotify_track, "artist");
        // 70s diff is beyond max tolerance (60s for high confidence on 250s track)
        assert!(score < 0, "70s diff should be rejected, got {}", score);
    }

    #[test]
    fn test_extract_primary_artist() {
        // Comma-separated artists
        assert_eq!(
            extract_primary_artist("mustard, migos"),
            Some("mustard".to_string())
        );
        assert_eq!(
            extract_primary_artist("duck sauce, a-trak and armand van helden"),
            Some("duck sauce".to_string())
        );
        // & separator
        assert_eq!(
            extract_primary_artist("nick cave and the bad seeds"),
            Some("nick cave".to_string())
        );
        assert_eq!(
            extract_primary_artist("farid bang and julian williams"),
            Some("farid bang".to_string())
        );
        // Slash separator
        assert_eq!(
            extract_primary_artist("brent faiyaz/dahi/tyler, the creator"),
            Some("brent faiyaz".to_string())
        );
        // Featuring
        assert_eq!(
            extract_primary_artist("jay park feat loco"),
            Some("jay park".to_string())
        );
        // No separator - single artist
        assert_eq!(extract_primary_artist("beatles"), None);
        assert_eq!(extract_primary_artist("rolling stones"), None);
        // "The " stripping on primary artist
        assert_eq!(
            extract_primary_artist("the deslondes and dan cutler"),
            Some("deslondes".to_string())
        );
        // Too short primary artist rejected
        assert_eq!(extract_primary_artist("a, b"), None);
    }

    #[test]
    fn test_new_title_patterns() {
        // Sped up/slowed variants
        assert_eq!(normalize_title("Song (Sped Up)"), "song");
        assert_eq!(normalize_title("Song (Slowed)"), "song");
        assert_eq!(normalize_title("Song (Slowed + Reverb)"), "song");
        // Slash remaster format
        assert_eq!(normalize_title("Song - Mono / 1997 Remastered"), "song");
        assert_eq!(
            normalize_title("God Only Knows / 2021 Remaster"),
            "god only knows"
        );
        // Reworked variants
        assert_eq!(normalize_title("Song (Reworked)"), "song");
        assert_eq!(normalize_title("Song (Redux)"), "song");
        // Version numbers
        assert_eq!(normalize_title("Song (2)"), "song");
        assert_eq!(normalize_title("Song [V2]"), "song");
        // Take in parens
        assert_eq!(normalize_title("Song (take 4)"), "song");
        // Feat without brackets
        assert_eq!(normalize_title("Se feliz feat. Gepe"), "se feliz");
        assert_eq!(normalize_title("Song ft. Artist"), "song");
        assert_eq!(normalize_title("Track featuring Someone"), "track");
        // URL suffixes
        assert_eq!(normalize_title("Mujeriego - SongsLover.com"), "mujeriego");
        assert_eq!(normalize_title("Song - Download.net"), "song");
        // Visualizer/commentary
        assert_eq!(
            normalize_title("Say That You Will (Visualiser)"),
            "say that you will"
        );
        assert_eq!(normalize_title("Song (Lyric Video)"), "song");
        assert_eq!(normalize_title("Requiem (comentario)"), "requiem");
    }

    #[test]
    fn test_the_suffix_stripping() {
        // ", the" suffix should be stripped
        assert_eq!(normalize_artist("Scorpions, The"), "scorpions");
        assert_eq!(normalize_artist("Band, the"), "band");
        // "(the)" suffix should be stripped
        assert_eq!(normalize_artist("Dandy Warhols (the)"), "dandy warhols");
        // Prefix still works
        assert_eq!(normalize_artist("The Beatles"), "beatles");
    }

    #[test]
    fn test_double_space_normalization() {
        // Double spaces should be collapsed
        assert_eq!(
            normalize_artist("Peter Cetera  Amy Grant"),
            "peter cetera amy grant"
        );
        assert_eq!(normalize_title("Song   Title"), "song title");
        // Multiple spaces
        assert_eq!(normalize_artist("A    B     C"), "a b c");
    }

    // ========================================================================
    // Spec-07: Instrumentation Tests
    // ========================================================================

    #[test]
    fn test_matching_stats_default() {
        let stats = MatchingStats::default();
        assert_eq!(stats.total_groups, 0);
        assert_eq!(stats.total_matches, 0);
        assert_eq!(stats.match_rate(), 0.0);
    }

    #[test]
    fn test_matching_stats_match_rate() {
        let mut stats = MatchingStats::default();
        stats.total_groups = 100;
        stats.total_matches = 57;
        assert!((stats.match_rate() - 57.0).abs() < 0.1);
    }

    #[test]
    fn test_matching_stats_duration_buckets() {
        let mut stats = MatchingStats::default();

        // Record various duration differences
        stats.record_duration_bucket(0); // 0-2
        stats.record_duration_bucket(1); // 0-2
        stats.record_duration_bucket(4); // 3-5
        stats.record_duration_bucket(8); // 6-10
        stats.record_duration_bucket(12); // 11-15
        stats.record_duration_bucket(25); // 16-30
        stats.record_duration_bucket(-5); // abs -> 3-5

        assert_eq!(stats.duration_matches_0_to_2, 2);
        assert_eq!(stats.duration_matches_3_to_5, 2);
        assert_eq!(stats.duration_matches_6_to_10, 1);
        assert_eq!(stats.duration_matches_11_to_15, 1);
        assert_eq!(stats.duration_matches_16_to_30, 1);
    }

    #[test]
    fn test_matching_stats_duration_relaxed_buckets() {
        // Spec-05: Test relaxed duration tracking
        let mut stats = MatchingStats::default();

        // Record relaxed duration differences (>30s)
        stats.record_duration_bucket(35); // 31-45
        stats.record_duration_bucket(40); // 31-45
        stats.record_duration_bucket(45); // 31-45
        stats.record_duration_bucket(50); // 46-60
        stats.record_duration_bucket(60); // 46-60
        stats.record_duration_bucket(65); // 61+
        stats.record_duration_bucket(-55); // abs -> 46-60

        assert_eq!(stats.duration_relaxed_31_to_45, 3);
        assert_eq!(stats.duration_relaxed_46_to_60, 3);
        assert_eq!(stats.duration_relaxed_61_plus, 1);
        assert_eq!(stats.total_relaxed_matches(), 7);
    }

    #[test]
    fn test_matching_stats_serialization() {
        let mut stats = MatchingStats::default();
        stats.total_groups = 1000;
        stats.total_matches = 575;
        stats.main_exact_matches = 500;
        stats.main_primary_artist_fallback = 50;
        stats.pop0_matches = 25;

        // Should serialize without error
        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("\"total_groups\":1000"));
        assert!(json.contains("\"total_matches\":575"));
        assert!(json.contains("\"main_exact_matches\":500"));
    }

    #[test]
    fn test_matching_stats_pop0_eligibility() {
        // Test spec-04: pop0 eligibility tracking
        let mut stats = MatchingStats::default();

        // Simulate scenario: 1000 groups total
        // - 600 matched in main phase
        // - 200 had no candidates (never seen)
        // - 200 had candidates but all rejected
        stats.total_groups = 1000;
        stats.total_matches = 600;
        stats.main_no_candidates = 200;
        stats.main_all_rejected = 200;

        // Pop=0 should be eligible for both no_candidates AND rejected groups
        stats.pop0_eligible = 400; // 200 + 200
        stats.pop0_from_no_candidates = 200;
        stats.pop0_from_rejected = 200;

        // Verify fields exist and are serializable
        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("\"pop0_from_no_candidates\":200"));
        assert!(json.contains("\"pop0_from_rejected\":200"));
        assert!(json.contains("\"pop0_eligible\":400"));

        // Verify sum is correct
        assert_eq!(
            stats.pop0_from_no_candidates + stats.pop0_from_rejected,
            stats.pop0_eligible
        );
    }

    // ========================================================================
    // Spec-03: Multi-Artist Verification Tests
    // ========================================================================

    #[test]
    fn test_score_artist_multi_exact_primary() {
        // Primary artist matches exactly
        let result = score_artist_multi(
            "dua lipa",
            &["Dua Lipa".to_string(), "Elton John".to_string()],
        );
        assert!(result.is_exact);
        assert_eq!(result.best_similarity, 1.0);
    }

    #[test]
    fn test_score_artist_multi_exact_secondary() {
        // Secondary artist matches exactly (spec-03: "Dua Lipa" searching for "Elton John, Dua Lipa")
        let result = score_artist_multi(
            "dua lipa",
            &["Elton John".to_string(), "Dua Lipa".to_string()],
        );
        assert!(result.is_exact);
        assert_eq!(result.best_similarity, 1.0);
    }

    #[test]
    fn test_score_artist_multi_partial_match() {
        // Partial match against one of multiple artists
        let result =
            score_artist_multi("elton", &["Elton John".to_string(), "Dua Lipa".to_string()]);
        assert!(!result.is_exact);
        assert!(result.best_similarity > 0.3); // Should have some similarity
    }

    #[test]
    fn test_score_artist_multi_no_match() {
        // No artist matches
        let result = score_artist_multi(
            "metallica",
            &["Elton John".to_string(), "Dua Lipa".to_string()],
        );
        assert!(!result.is_exact);
        assert!(result.best_similarity < 0.3); // Very low similarity
    }

    #[test]
    fn test_score_artist_multi_empty() {
        // Empty artist list
        let result = score_artist_multi("metallica", &[]);
        assert!(!result.is_exact);
        assert_eq!(result.best_similarity, 0.0);
    }

    #[test]
    fn test_combined_score_multi_artist_secondary_match() {
        // Spec-03: Match should succeed when LRCLIB artist matches secondary Spotify artist
        let lrclib_track = Track {
            id: 1,
            title: "Cold Heart".to_string(),
            artist: "Dua Lipa".to_string(),
            album: None,
            duration_sec: 210,
        };
        let spotify_track = SpotifyTrack {
            id: "abc123".to_string(),
            name: "Cold Heart".to_string(),
            artist: "Elton John".to_string(), // Primary is Elton John
            artists: vec!["Elton John".to_string(), "Dua Lipa".to_string()], // But Dua Lipa is credited
            duration_ms: 210_000,
            popularity: 85,
            isrc: None,
            album_rowid: 1,
            album_type: SpotifyAlbumType::Album,
        };

        // Search for "dua lipa" - should find match via secondary artist
        let score = combined_score(&lrclib_track, 40, &spotify_track, "dua lipa");

        // Should be a good match:
        // duration: 100 (perfect)
        // artist: 50 (exact match on secondary artist)
        // quality: 40 (passed in)
        // clean title bonus: 30 (no garbage pattern)
        // popularity: 8 (85/10)
        // Total: 228
        assert!(
            score >= ACCEPT_THRESHOLD,
            "Multi-artist match via secondary artist should be accepted, got {}",
            score
        );
    }

    #[test]
    fn test_combined_score_multi_artist_no_match() {
        // Spec-03: Match should fail when LRCLIB artist doesn't match any Spotify artist
        let lrclib_track = Track {
            id: 1,
            title: "Song".to_string(),
            artist: "Metallica".to_string(),
            album: None,
            duration_sec: 210,
        };
        let spotify_track = SpotifyTrack {
            id: "abc123".to_string(),
            name: "Song".to_string(),
            artist: "Elton John".to_string(),
            artists: vec!["Elton John".to_string(), "Dua Lipa".to_string()],
            duration_ms: 210_000,
            popularity: 85,
            isrc: None,
            album_rowid: 1,
            album_type: SpotifyAlbumType::Album,
        };

        // Search for "metallica" - should not match (no artist overlap)
        let score = combined_score(&lrclib_track, 40, &spotify_track, "metallica");
        assert!(
            score < 0,
            "Multi-artist match with no artist overlap should be rejected, got {}",
            score
        );
    }

    // ========================================================================
    // Album Type Ranking Tests (DBA Spec Section 8.2)
    // ========================================================================

    #[test]
    fn test_is_better_match_album_beats_compilation_same_score() {
        // If two candidates share the same combined_score, album should beat compilation
        let score = 150;
        assert!(
            is_better_match(
                score,
                SpotifyAlbumType::Album,
                score,
                SpotifyAlbumType::Compilation
            ),
            "Album should beat compilation with same score"
        );
        assert!(
            !is_better_match(
                score,
                SpotifyAlbumType::Compilation,
                score,
                SpotifyAlbumType::Album
            ),
            "Compilation should not beat album with same score"
        );
    }

    #[test]
    fn test_is_better_match_album_beats_single_same_score() {
        // Album should beat single with same score
        let score = 150;
        assert!(
            is_better_match(
                score,
                SpotifyAlbumType::Album,
                score,
                SpotifyAlbumType::Single
            ),
            "Album should beat single with same score"
        );
    }

    #[test]
    fn test_is_better_match_single_beats_compilation_same_score() {
        // Single should beat compilation with same score
        let score = 150;
        assert!(
            is_better_match(
                score,
                SpotifyAlbumType::Single,
                score,
                SpotifyAlbumType::Compilation
            ),
            "Single should beat compilation with same score"
        );
    }

    #[test]
    fn test_is_better_match_viable_compilation_beats_non_viable_album() {
        // If album is below MIN_VIABLE_MATCH_SCORE but compilation is viable,
        // compilation should win (viability threshold guardrail)
        let non_viable_score = MIN_VIABLE_MATCH_SCORE - 10; // 70
        let viable_score = MIN_VIABLE_MATCH_SCORE + 10; // 90

        assert!(
            is_better_match(
                viable_score,
                SpotifyAlbumType::Compilation,
                non_viable_score,
                SpotifyAlbumType::Album
            ),
            "Viable compilation should beat non-viable album"
        );
    }

    #[test]
    fn test_is_better_match_non_viable_album_does_not_beat_viable_compilation() {
        // Non-viable album should NOT beat viable compilation
        let non_viable_score = MIN_VIABLE_MATCH_SCORE - 10;
        let viable_score = MIN_VIABLE_MATCH_SCORE + 10;

        assert!(
            !is_better_match(
                non_viable_score,
                SpotifyAlbumType::Album,
                viable_score,
                SpotifyAlbumType::Compilation
            ),
            "Non-viable album should not beat viable compilation"
        );
    }

    #[test]
    fn test_is_better_match_unknown_ranks_last() {
        // Unknown album_type should rank after all known types
        let score = 150;
        assert!(
            is_better_match(
                score,
                SpotifyAlbumType::Compilation,
                score,
                SpotifyAlbumType::Unknown
            ),
            "Compilation should beat unknown with same score"
        );
        assert!(
            !is_better_match(
                score,
                SpotifyAlbumType::Unknown,
                score,
                SpotifyAlbumType::Compilation
            ),
            "Unknown should not beat compilation with same score"
        );
    }

    #[test]
    fn test_is_better_match_higher_score_wins_same_album_type() {
        // With same album type, higher score should win
        assert!(
            is_better_match(160, SpotifyAlbumType::Album, 150, SpotifyAlbumType::Album),
            "Higher score should beat lower score with same album type"
        );
        assert!(
            !is_better_match(150, SpotifyAlbumType::Album, 160, SpotifyAlbumType::Album),
            "Lower score should not beat higher score with same album type"
        );
    }

    #[test]
    fn test_is_better_match_both_non_viable_score_wins() {
        // When both are non-viable, higher score wins regardless of album type
        let low_score = 50;
        let high_score = 70;

        assert!(
            is_better_match(
                high_score,
                SpotifyAlbumType::Compilation,
                low_score,
                SpotifyAlbumType::Album
            ),
            "Higher score compilation should beat lower score album when both non-viable"
        );
    }

    #[test]
    fn test_spotify_album_type_rank() {
        // Test the rank ordering: album < single < compilation < unknown
        assert!(SpotifyAlbumType::Album.rank() < SpotifyAlbumType::Single.rank());
        assert!(SpotifyAlbumType::Single.rank() < SpotifyAlbumType::Compilation.rank());
        assert!(SpotifyAlbumType::Compilation.rank() < SpotifyAlbumType::Unknown.rank());
    }

    #[test]
    fn test_spotify_album_type_from_str() {
        // Test string parsing
        assert_eq!(
            SpotifyAlbumType::from(Some("album")),
            SpotifyAlbumType::Album
        );
        assert_eq!(
            SpotifyAlbumType::from(Some("single")),
            SpotifyAlbumType::Single
        );
        assert_eq!(
            SpotifyAlbumType::from(Some("compilation")),
            SpotifyAlbumType::Compilation
        );
        assert_eq!(
            SpotifyAlbumType::from(Some("unknown_value")),
            SpotifyAlbumType::Unknown
        );
        assert_eq!(SpotifyAlbumType::from(None), SpotifyAlbumType::Unknown);
    }

    // ========================================================================
    // Spec-06: Title-First Rescue Tests
    // ========================================================================

    #[test]
    fn test_is_common_title() {
        // Common titles should be identified
        assert!(is_common_title("home"));
        assert!(is_common_title("love"));
        assert!(is_common_title("intro"));
        assert!(is_common_title("instrumental"));

        // Short titles are common
        assert!(is_common_title("a"));
        assert!(is_common_title("ab"));

        // Specific song titles should not be common
        assert!(!is_common_title("bohemian rhapsody"));
        assert!(!is_common_title("stairway to heaven"));
        assert!(!is_common_title("hotel california"));
        assert!(!is_common_title("love you to death"));
    }

    #[test]
    fn test_normalized_levenshtein_similarity() {
        // Exact match
        let sim = normalized_levenshtein("the beatles", "the beatles");
        assert!((sim - 1.0).abs() < 0.001);

        // Minor typo (should be high similarity)
        let sim = normalized_levenshtein("everythig but the girl", "everything but the girl");
        assert!(
            sim > 0.90,
            "Minor typo should have >90% similarity, got {}",
            sim
        );

        // Punctuation difference (should be high similarity)
        let sim = normalized_levenshtein("guns n roses", "guns and roses");
        assert!(
            sim > 0.75,
            "Punctuation diff should have >75% similarity, got {}",
            sim
        );

        // Completely different (should be low similarity)
        let sim = normalized_levenshtein("metallica", "taylor swift");
        assert!(
            sim < 0.30,
            "Completely different should have <30% similarity, got {}",
            sim
        );

        // Partial match - "queen" vs "queen paul rodgers" has low similarity due to length difference
        let sim = normalized_levenshtein("queen", "queen paul rodgers");
        assert!(
            sim > 0.20 && sim < 0.50,
            "Partial match should be 20-50% similarity, got {}",
            sim
        );
    }

    #[test]
    fn test_rescue_stats_fields_exist() {
        // Verify all rescue-related stats fields exist and are serializable
        let mut stats = MatchingStats::default();

        stats.rescue_attempted = 1000;
        stats.rescue_skipped_common_title = 50;
        stats.rescue_matches = 100;
        stats.rescue_rejected_low_similarity = 800;
        stats.rescue_rejected_duration = 50;

        // Should serialize without error
        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("\"rescue_attempted\":1000"));
        assert!(json.contains("\"rescue_matches\":100"));
        assert!(json.contains("\"rescue_skipped_common_title\":50"));
        assert!(json.contains("\"rescue_rejected_low_similarity\":800"));
        assert!(json.contains("\"rescue_rejected_duration\":50"));
    }
}
