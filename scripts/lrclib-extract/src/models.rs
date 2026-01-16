//! Core data models for LRCLIB extraction.
//!
//! This module contains all struct definitions, type aliases, and enums
//! used throughout the extraction pipeline.

use rustc_hash::FxHashMap;
use serde::Serialize;
use std::sync::Arc;

// ============================================================================
// Type Aliases
// ============================================================================

/// Index mapping (title_norm, artist_norm) to group index in Vec<LrclibGroup>
pub type LrclibIndex = FxHashMap<(String, String), usize>;

/// Title-only index for initial filtering before artist lookup (2-phase matching)
pub type TitleOnlyIndex = FxHashMap<String, Vec<usize>>;

// ============================================================================
// String Interning
// ============================================================================

/// String interner for deduplicating normalized strings during grouping.
/// Reduces memory usage when many tracks share the same artist/title.
/// Similar to normalize-spotify optimization that saved 40M allocations.
pub struct StringInterner {
    strings: FxHashMap<Arc<str>, Arc<str>>,
}

impl StringInterner {
    pub fn new() -> Self {
        Self {
            strings: FxHashMap::default(),
        }
    }

    /// Intern a string, returning a reference-counted handle.
    /// If the string was seen before, returns the existing Arc.
    /// This deduplicates memory for repeated strings like artist names.
    pub fn intern(&mut self, s: &str) -> Arc<str> {
        // Look up using the string slice as key
        if let Some(existing) = self.strings.get(s) {
            return Arc::clone(existing);
        }
        // Create new Arc and store it
        let arc: Arc<str> = Arc::from(s);
        self.strings.insert(Arc::clone(&arc), Arc::clone(&arc));
        arc
    }

    pub fn len(&self) -> usize {
        self.strings.len()
    }

    pub fn is_empty(&self) -> bool {
        self.strings.is_empty()
    }
}

impl Default for StringInterner {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// LRCLIB Models
// ============================================================================

/// Raw track from LRCLIB database
#[derive(Clone, Debug)]
pub struct Track {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration_sec: i64,
}

/// Scored track with precomputed normalized strings (used by old pipeline).
/// Kept for backward compatibility. New pipeline uses LrclibGroup + LrclibVariant.
#[derive(Clone, Debug)]
pub struct ScoredTrack {
    pub track: Track,
    pub title_norm: String,
    pub artist_norm: String,
    pub quality: i32,
}

/// Group of LRCLIB tracks sharing (title_norm, artist_norm).
/// Used for delayed canonical selection - keeps all variants until Spotify matching.
#[derive(Clone, Debug)]
pub struct LrclibGroup {
    pub key: (String, String), // (title_norm, artist_norm) stored ONCE per group
    pub tracks: Vec<LrclibVariant>,
    pub best_match: Option<(usize, SpotifyTrack, i32)>, // (track_idx, spotify_track, score)
}

/// LRCLIB track variant within a group (without redundant normalized strings).
/// title_norm and artist_norm are stored once in the parent LrclibGroup.key.
#[derive(Clone, Debug)]
pub struct LrclibVariant {
    pub track: Track,
    pub quality: i32, // LRCLIB-only quality score
}

// ============================================================================
// Spotify Models
// ============================================================================

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

/// Spotify track info for matching
#[derive(Clone, Debug)]
pub struct SpotifyTrack {
    pub id: String,                 // Spotify track ID (e.g., "2takcwOaAZWiXQijPHIx7B")
    pub name: String,               // Canonical track name from Spotify (v3: used for display)
    pub artist: String,             // Primary artist (kept for backwards compat)
    pub artists: Vec<String>, // All credited artists in Spotify's credited order (v3: ORDER BY ta.rowid)
    pub album_name: Option<String>, // Canonical album name from Spotify (v3: used for display)
    pub duration_ms: i64,
    pub popularity: i32,              // 0-100
    pub isrc: Option<String>,         // For Deezer album art lookup
    pub album_rowid: i64,             // For album_images lookup
    pub album_type: SpotifyAlbumType, // For preferring albums over compilations
}

/// Partial Spotify track (before artist lookup) for 2-phase matching.
/// Used in optimized streaming: Phase A fetches tracks only, Phase B batch-fetches artists.
/// Note: Not yet used in current implementation but kept for future optimization.
#[derive(Clone, Debug)]
pub struct SpotifyTrackPartial {
    pub rowid: i64,   // SQLite rowid for artist lookup
    pub id: String,   // Spotify track ID
    pub name: String, // Original title
    pub duration_ms: i64,
    pub popularity: i32,      // 0-100
    pub isrc: Option<String>, // For Deezer album art lookup
    pub album_rowid: i64,     // For album_images lookup
}

/// Audio features from Spotify
#[derive(Clone, Debug)]
pub struct AudioFeatures {
    pub tempo: Option<f64>,          // BPM
    pub key: Option<i32>,            // -1 to 11 (pitch class)
    pub mode: Option<i32>,           // 0=minor, 1=major
    pub time_signature: Option<i32>, // 3-7
}

/// Spotify candidate for failure logging (spec-05).
/// Serialized to JSON for storage in match_failures table.
#[derive(Clone, Debug, Serialize)]
pub struct SpotifyCandidate {
    pub spotify_id: String,
    pub spotify_name: String,
    pub spotify_artist: String,
    pub spotify_duration_ms: i64,
    pub spotify_popularity: i32,
    pub duration_diff_sec: i64,
    pub score: i32,
    pub reject_reason: Option<String>,
}

// ============================================================================
// POP0 Candidate Structure
// ============================================================================

/// Candidate from POP0 fallback matching (stored before batch artist lookup).
pub struct Pop0Candidate {
    pub track_rowid: i64,
    pub title_norm: String,
    pub duration_ms: i64,
    pub external_id_isrc: Option<String>,
    pub album_rowid: i64,
    pub spotify_id: String,
}

// ============================================================================
// Failure Tracking
// ============================================================================

/// Failure reason for match_failures logging (spec-05).
/// The fields in variants are metadata for debugging/analysis.
#[derive(Clone, Debug)]
pub enum FailureReason {
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

// ============================================================================
// Output Models
// ============================================================================

/// Final enriched track for output (v3 schema).
///
/// ## Display vs Source Fields (v3)
///
/// - `title`, `artist`, `album`: **Display fields**
///   - When Spotify matched: Spotify canonical names (corrected spelling, proper casing)
///   - When unmatched: LRCLIB source values (fallback)
///
/// - `lrclib_title`, `lrclib_artist`, `lrclib_album`: **Source fields**
///   - Original LRCLIB values (preserved for auditing/debugging/lyrics matching)
///   - Always populated from LRCLIB regardless of match status
///
/// ## Key Invariants
///
/// 1. **Matched tracks** (`spotify_id IS NOT NULL`):
///    - `title`, `artist`, `album` = Spotify canonical values
///    - `artist` = `spotify_artists_json.join(", ")`
///
/// 2. **Unmatched tracks** (`spotify_id IS NULL`):
///    - `title == lrclib_title`, `artist == lrclib_artist`, `album == lrclib_album`
///    - `spotify_artists_json` = NULL
#[derive(Clone, Debug)]
pub struct EnrichedTrack {
    // Identifiers
    pub lrclib_id: i64,
    pub duration_sec: i64,
    pub title_norm: String,
    pub artist_norm: String,
    pub quality: i32,

    // Display names (Spotify canonical when matched, LRCLIB fallback when unmatched)
    pub title: String,
    pub artist: String,
    pub album: Option<String>,

    // Source LRCLIB names (preserved for auditing/debugging/lyrics matching)
    pub lrclib_title: String,
    pub lrclib_artist: String,
    pub lrclib_album: Option<String>,

    // Spotify enrichment (all nullable, NULL = no match)
    pub spotify_id: Option<String>,
    pub spotify_artists_json: Option<String>, // JSON array: ["Artist1", "Artist2"]
    pub popularity: Option<i32>,              // NULL if no match (not 0)
    pub tempo: Option<f64>,
    pub musical_key: Option<i32>,
    pub mode: Option<i32>,
    pub time_signature: Option<i32>,
    pub isrc: Option<String>,
    pub album_image_url: Option<String>, // Medium (300px) Spotify CDN URL
}

// ============================================================================
// Scoring Models (defined in scoring.rs, re-exported here for convenience)
// ============================================================================

/// Match confidence level for duration tolerance (spec-05)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchConfidence {
    /// Perfect artist match (exact match)
    High,
    /// Good artist match (similarity >= 0.7)
    Medium,
    /// Acceptable artist match (similarity >= 0.3)
    Low,
}

// ============================================================================
// Statistics (Instrumentation)
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

// ============================================================================
// Match Failure Logging
// ============================================================================

/// Entry for match_failures table (spec-05).
/// Contains all data needed to write to match_failures table.
#[derive(Clone, Debug)]
pub struct MatchFailureEntry {
    // LRCLIB entry info
    pub lrclib_id: i64,
    pub lrclib_title: String,
    pub lrclib_artist: String,
    pub lrclib_album: Option<String>,
    pub lrclib_duration_sec: i64,
    pub lrclib_title_norm: String,
    pub lrclib_artist_norm: String,
    pub lrclib_quality: i32,
    pub group_variant_count: usize,
    // Failure info
    pub failure_reason: FailureReason,
    pub best_score: Option<i32>,
    pub spotify_candidates: Vec<SpotifyCandidate>,
}
