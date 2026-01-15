//! Scoring functions for LRCLIB extraction.
//!
//! This module contains all scoring-related functions including:
//! - Duration scoring
//! - Artist similarity scoring
//! - Quality scoring for LRCLIB tracks
//! - Combined scoring for Spotify matching

use once_cell::sync::Lazy;
use regex::Regex;
use rustc_hash::FxHashSet;

use crate::models::{MatchConfidence, SpotifyTrack, Track};
use crate::normalize::normalize_artist;

// ============================================================================
// Score Thresholds
// ============================================================================

/// Minimum score to accept a match
pub const ACCEPT_THRESHOLD: i32 = 80;

/// Below this, log as low-confidence (spec-04)
pub const LOW_CONFIDENCE_THRESHOLD: i32 = 120;

// ============================================================================
// Regex Patterns
// ============================================================================

pub static LIVE_REMIX_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
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

/// Patterns for garbage titles (track numbers, artist name in title, etc.)
pub static GARBAGE_TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
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

pub static LOW_QUALITY_ALBUMS: Lazy<Vec<&str>> = Lazy::new(|| {
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

/// Patterns for titles to skip entirely (not just penalize)
pub static SKIP_TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        // "(Paused)" versions - incomplete/broken lyrics
        Regex::new(r"(?i)\(paused\)").unwrap(),
    ]
});

// ============================================================================
// Album Classification
// ============================================================================

#[derive(Debug, PartialEq, Eq)]
pub enum AlbumType {
    Studio,
    Remaster,
    Deluxe,
    Compilation,
    Live,
    Soundtrack,
}

pub fn classify_album(album: &Option<String>) -> AlbumType {
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

// ============================================================================
// Pattern Matching Helpers
// ============================================================================

pub fn should_skip_title(title: &str) -> bool {
    SKIP_TITLE_PATTERNS.iter().any(|p| p.is_match(title))
}

pub fn is_garbage_album(album: &Option<String>) -> bool {
    match album {
        None => false,
        Some(a) => {
            let lower = a.to_lowercase();
            LOW_QUALITY_ALBUMS.iter().any(|&lq| lower.contains(lq))
        }
    }
}

pub fn has_live_remix_pattern(text: &str) -> bool {
    LIVE_REMIX_PATTERNS.iter().any(|p| p.is_match(text))
}

pub fn has_garbage_title_pattern(title: &str) -> bool {
    GARBAGE_TITLE_PATTERNS.iter().any(|p| p.is_match(title))
}

pub fn title_contains_artist(title: &str, artist: &str) -> bool {
    let title_lower = title.to_lowercase();
    let artist_lower = artist.to_lowercase();

    // Skip if artist is too short (avoid false positives like "a" or "the")
    if artist_lower.len() < 3 {
        return false;
    }

    // Check if title contains the artist name
    title_lower.contains(&artist_lower)
}

// ============================================================================
// Duration Scoring
// ============================================================================

/// Graduated duration score (spec-04, spec-05).
/// Replaces hard ±10s cutoff with graduated scoring.
/// Extended in spec-05 to handle relaxed matches (31-60s) with very low scores.
#[cfg_attr(not(test), allow(dead_code))]
pub fn duration_score(lrclib_sec: i64, spotify_ms: i64) -> i32 {
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

// ============================================================================
// Artist Similarity
// ============================================================================

/// Compute similarity between two normalized artist names (0.0 to 1.0).
/// Uses Jaccard similarity on word tokens.
pub fn compute_artist_similarity(a: &str, b: &str) -> f64 {
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
/// Returns the best similarity score across all credited artists.
#[derive(Debug, Clone)]
pub struct MultiArtistMatchResult {
    pub best_similarity: f64,
    pub is_exact: bool,
}

/// Score LRCLIB artist against all credited Spotify artists (spec-03 R3.2).
/// Uses max-over-artists to find the best match.
pub fn score_artist_multi(
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

// ============================================================================
// Duration Tolerance
// ============================================================================

/// Calculate maximum duration tolerance based on confidence level (spec-05).
/// Higher confidence allows more relaxed duration matching.
pub fn max_duration_tolerance(confidence: MatchConfidence, track_duration_sec: i64) -> i64 {
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

// ============================================================================
// Combined Scoring
// ============================================================================

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
pub fn combined_score(
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

// ============================================================================
// Quality Scoring
// ============================================================================

/// Compute quality score for a LRCLIB track (independent of Spotify matching).
pub fn compute_quality_score(track: &Track, median_duration: Option<i64>) -> i32 {
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
