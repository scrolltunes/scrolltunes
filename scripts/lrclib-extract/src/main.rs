use anyhow::{Context, Result};
use clap::Parser;
use indicatif::{ProgressBar, ProgressStyle};
use once_cell::sync::Lazy;
use rayon::prelude::*;
use regex::Regex;
use rusqlite::{params, Connection};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Instant;
use unicode_normalization::UnicodeNormalization;

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

    /// Path to spotify_normalized.sqlite3 (pre-normalized Spotify data for faster matching)
    /// If provided, uses inverted lookup: LRCLIB → Spotify instead of streaming Spotify
    #[arg(long)]
    spotify_normalized: Option<PathBuf>,

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

    /// Disable progress bars, use log output only (for background runs)
    #[arg(long)]
    log_only: bool,
}

const WRITE_BATCH_SIZE: usize = 10_000;

// Score thresholds for combined scoring (spec-04)
const ACCEPT_THRESHOLD: i32 = 80;       // Minimum score to accept a match
#[allow(dead_code)]
const LOW_CONFIDENCE_THRESHOLD: i32 = 120; // Below this, log as low-confidence

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
    key: (String, String),  // (title_norm, artist_norm) stored ONCE per group
    tracks: Vec<LrclibVariant>,
    best_match: Option<(usize, SpotifyTrack, i32)>,  // (track_idx, spotify_track, score)
}

/// LRCLIB track variant within a group (without redundant normalized strings).
/// title_norm and artist_norm are stored once in the parent LrclibGroup.key.
#[derive(Clone, Debug)]
struct LrclibVariant {
    track: Track,
    quality: i32,  // LRCLIB-only quality score
}

/// Index mapping (title_norm, artist_norm) to group index in Vec<LrclibGroup>
type LrclibIndex = FxHashMap<(String, String), usize>;

/// Title-only index for initial filtering before artist lookup (2-phase matching)
type TitleOnlyIndex = FxHashMap<String, Vec<usize>>;

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

/// Partial Spotify track (before artist lookup) for 2-phase matching.
/// Used in optimized streaming: Phase A fetches tracks only, Phase B batch-fetches artists.
/// Note: Not yet used in current implementation but kept for future optimization.
#[allow(dead_code)]
#[derive(Clone, Debug)]
struct SpotifyTrackPartial {
    rowid: i64,              // SQLite rowid for artist lookup
    id: String,              // Spotify track ID
    name: String,            // Original title
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
    LowConfidenceMatch {
        accepted_score: i32,
        threshold: i32,
    },
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
        // Remaster variants: "- Remastered 2021", "(2021 Remaster)", "/ 1997 Remastered"
        Regex::new(r"(?i)\s*[-–—/]\s*(?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)").unwrap(),
        Regex::new(r"(?i)\s*[\(\[](?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)[\)\]]").unwrap(),
        // Live/acoustic: "(Live at Wembley)", "- Acoustic Version"
        Regex::new(r"(?i)\s*[\(\[](?:live(?:\s+(?:at|from|in)\s+[^)\]]+)?|acoustic(?:\s+version)?|unplugged)[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[-–—]\s*(?:live(?:\s+(?:at|from|in)\s+.+)?|acoustic(?:\s+version)?)").unwrap(),
        // Edition variants: "(Deluxe Edition)", "[Super Deluxe]"
        Regex::new(r"(?i)\s*[\(\[](?:deluxe|super\s+deluxe|expanded|anniversary|bonus\s+track(?:s)?|special|collector'?s?)(?:\s+edition)?[\)\]]").unwrap(),
        // Mix/version variants: "(Radio Edit)", "[Album Version]", "(Mono)", "(Stereo)"
        Regex::new(r"(?i)\s*[\(\[](?:radio\s+edit|single\s+version|album\s+version|extended(?:\s+(?:mix|version))?|original\s+mix|mono|stereo)[\)\]]").unwrap(),
        // Content variants: "(Explicit)", "[Clean]", "(Instrumental)"
        Regex::new(r"(?i)\s*[\(\[](?:explicit|clean|censored|instrumental|karaoke)[\)\]]").unwrap(),
        // Recording variants: "(Demo)", "[Alternate Take]", "(Outtake)"
        Regex::new(r"(?i)\s*[\(\[](?:demo(?:\s+version)?|alternate(?:\s+(?:take|version))?|outtake|take\s*\d+)[\)\]]").unwrap(),
        // Year suffix: "- 2021", "- 1997 Version"
        Regex::new(r"(?i)\s*[-–—]\s*\d{4}(?:\s+(?:version|mix|edit))?$").unwrap(),
        // Featured artists: "(feat. Artist)", "[ft. Someone]"
        Regex::new(r"(?i)\s*[\(\[](?:feat\.?|ft\.?|featuring)\s+[^)\]]+[\)\]]").unwrap(),
        // Speed variants: "(Sped Up)", "(Slowed)", "(Slowed + Reverb)"
        Regex::new(r"(?i)\s*[\(\[](?:sped\s+up|slowed(?:\s*\+\s*reverb)?|nightcore|daycore)[\)\]]").unwrap(),
        // Rework variants: "(Reworked)", "(Redux)", "(Re-recorded)"
        Regex::new(r"(?i)\s*[\(\[](?:reworked?|redux|re-?recorded|reimagined)[\)\]]").unwrap(),
        // Version numbers: "(2)", "(Version 2)", "[V2]"
        Regex::new(r"(?i)\s*[\(\[](?:v(?:ersion)?\s*)?\d[\)\]]").unwrap(),
        // Dash format for mono/stereo/version: "- Mono", "- Stereo / 2021 Remaster"
        Regex::new(r"(?i)\s*[-–—]\s*(?:mono|stereo)(?:\s*/\s*\d{4}\s*remaster(?:ed)?)?").unwrap(),
    ]
});

/// Matches track number prefixes like "03 - ", "Track 5 - ", "01. ", etc.
static TRACK_NUMBER_PREFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"(?i)^(?:track\s*)?\d{1,4}\s*[-–—._]\s*").unwrap()
);

/// Matches track number prefix without separator: "16 Eleanor Rigby" → "Eleanor Rigby"
/// Only matches 1-2 digit numbers (1-99) to avoid false positives like "1970 Somethin'"
/// Pattern: 01-09 or 1-99 followed by space and uppercase letter.
static TRACK_NUMBER_SPACE_PREFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"^(?:0[1-9]|[1-9]\d?)\s+([A-Z])").unwrap()
);

/// Matches mojibake replacement characters at end of string
static MOJIBAKE_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"[\u{FFFD}]+$").unwrap()
);

/// Matches bracket suffixes like [Mono], [RM1], [take 2], [Live], etc.
static BRACKET_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"\s*\[[^\]]+\]\s*$").unwrap()
);

/// Matches file extensions in titles
static FILE_EXTENSION: Lazy<Regex> = Lazy::new(||
    Regex::new(r"(?i)\.(flac|mp3|wav|m4a|ogg|aac)$").unwrap()
);

/// Matches year suffix like (1964), (2009), etc.
static YEAR_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"\s*\(\d{4}\)\s*$").unwrap()
);

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

/// Check if a character is a Unicode combining mark (diacritical mark).
/// Used to filter out accents during normalization.
fn is_combining_mark(c: char) -> bool {
    matches!(c as u32, 0x0300..=0x036F | 0x1AB0..=0x1AFF | 0x1DC0..=0x1DFF | 0xFE20..=0xFE2F)
}

/// Fold Unicode text to ASCII by applying NFKD decomposition and removing combining marks.
/// e.g., "Beyoncé" → "beyonce", "naïve" → "naive"
fn fold_to_ascii(s: &str) -> String {
    s.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
}

/// Normalize punctuation by converting curly quotes to straight quotes and & to and.
/// Also fixes common encoding issues and apostrophe spacing problems.
fn normalize_punctuation(s: &str) -> String {
    s.replace(['\u{2018}', '\u{2019}'], "'")  // Left/right single curly quotes
        .replace(['\u{201C}', '\u{201D}'], "\"")  // Left/right double curly quotes
        .replace(['\u{00B4}', '\u{0060}'], "'")  // Acute accent and grave accent
        .replace(" & ", " and ")
        // Fix encoding issues: ? often appears where ' should be (e.g., "Can?t" → "Can't")
        .replace("?t ", "'t ")  // Can?t → Can't, Don?t → Don't, Won?t → Won't
        .replace("?s ", "'s ")  // It?s → It's
        .replace("?m ", "'m ")  // I?m → I'm
        .replace("?ve ", "'ve ")  // I?ve → I've
        .replace("?re ", "'re ")  // You?re → You're
        .replace("?ll ", "'ll ")  // I?ll → I'll
        // Fix apostrophe spacing: "She s " → "She's "
        .replace(" s ", "'s ")  // Common OCR/encoding error
        .replace(" t ", "'t ")  // Won t → Won't
        .replace(" m ", "'m ")  // I m → I'm
        .replace(" ve ", "'ve ")  // I ve → I've
        .replace(" re ", "'re ")  // You re → You're
        .replace(" ll ", "'ll ")  // I ll → I'll
}

#[cfg_attr(not(test), allow(dead_code))]
fn normalize_title(title: &str) -> String {
    let mut result = normalize_punctuation(title);

    // Strip file extension first (before other processing)
    result = FILE_EXTENSION.replace(&result, "").to_string();

    // Strip track number prefix (with separator)
    result = TRACK_NUMBER_PREFIX.replace(&result, "").to_string();

    // Strip track number prefix (space only, e.g., "16 Eleanor Rigby")
    // Keep the captured capital letter: replace "16 E" with "E"
    result = TRACK_NUMBER_SPACE_PREFIX.replace(&result, "$1").to_string();

    // Strip bracket suffix like [Mono], [RM1], [take 2]
    result = BRACKET_SUFFIX.replace(&result, "").to_string();

    // Strip year suffix like (1964)
    result = YEAR_SUFFIX.replace(&result, "").to_string();

    // Strip mojibake suffix
    result = MOJIBAKE_SUFFIX.replace(&result, "").to_string();

    // Apply existing patterns
    for pattern in TITLE_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }

    fold_to_ascii(&result).trim().to_string()
}

/// Normalize title with artist context to strip artist prefix from title.
/// e.g., "Type O Negative - Love You To Death" with artist "Type O Negative" → "love you to death"
fn normalize_title_with_artist(title: &str, artist: &str) -> String {
    let mut result = normalize_punctuation(title);

    // Strip file extension first (before other processing)
    result = FILE_EXTENSION.replace(&result, "").to_string();

    // Strip track number prefix (with separator)
    result = TRACK_NUMBER_PREFIX.replace(&result, "").to_string();

    // Strip track number prefix (space only, e.g., "16 Eleanor Rigby")
    // Keep the captured capital letter: replace "16 E" with "E"
    result = TRACK_NUMBER_SPACE_PREFIX.replace(&result, "$1").to_string();

    // Strip artist prefix if artist is long enough (avoid false positives for short names)
    let artist_norm = normalize_artist(artist);
    if artist_norm.len() >= 3 {
        let escaped = regex::escape(&artist_norm);
        if let Ok(prefix_re) = Regex::new(&format!(r"(?i)^\s*{}\s*[-–—:]\s*", escaped)) {
            result = prefix_re.replace(&result, "").to_string();
        }
    }

    // Strip bracket suffix like [Mono], [RM1], [take 2]
    result = BRACKET_SUFFIX.replace(&result, "").to_string();

    // Strip year suffix like (1964)
    result = YEAR_SUFFIX.replace(&result, "").to_string();

    // Strip mojibake suffix
    result = MOJIBAKE_SUFFIX.replace(&result, "").to_string();

    // Apply existing patterns
    for pattern in TITLE_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }

    fold_to_ascii(&result).trim().to_string()
}

fn normalize_artist(artist: &str) -> String {
    let mut result = normalize_punctuation(artist);
    for pattern in ARTIST_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }
    let mut normalized = fold_to_ascii(&result).trim().to_lowercase();

    // Strip "the " prefix (e.g., "The Beatles" → "beatles")
    if normalized.starts_with("the ") {
        normalized = normalized[4..].to_string();
    }

    // Apply transliteration for known Cyrillic artists
    ARTIST_TRANSLITERATIONS
        .get(normalized.as_str())
        .map(|&s| s.to_string())
        .unwrap_or(normalized)
}

/// Multi-artist separator pattern for extracting primary artist.
/// Matches: &, /, ,, •, +, x, vs, and, with, feat, ft
static ARTIST_SEPARATOR: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\s*(?:[&/,•+×]|(?:\s+(?:x|vs\.?|and|with|feat\.?|ft\.?)\s+))\s*").unwrap()
});

/// Extract the primary (first) artist from a multi-artist string.
/// Returns None if no separator found or result would be empty.
/// e.g., "Mustard, Migos" → Some("mustard")
///       "Duck Sauce, A-Trak & Armand Van Helden" → Some("duck sauce")
///       "Beatles" → None (no separator)
fn extract_primary_artist(artist_norm: &str) -> Option<String> {
    // Find first separator
    if let Some(m) = ARTIST_SEPARATOR.find(artist_norm) {
        let primary = artist_norm[..m.start()].trim();
        if !primary.is_empty() && primary.len() >= 2 {
            // Re-normalize to handle "the " prefix on primary artist
            let mut result = primary.to_string();
            if result.starts_with("the ") {
                result = result[4..].to_string();
            }
            return Some(result);
        }
    }
    None
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

/// Graduated duration score (spec-04).
/// Replaces hard ±10s cutoff with graduated scoring.
/// Note: Exposed for unit tests and used internally by combined_score().
#[cfg_attr(not(test), allow(dead_code))]
fn duration_score(lrclib_sec: i64, spotify_ms: i64) -> i32 {
    let diff = (lrclib_sec - spotify_ms / 1000).abs();
    match diff {
        0..=2 => 100,   // Near-perfect
        3..=5 => 80,    // Excellent
        6..=10 => 50,   // Good
        11..=15 => 25,  // Acceptable (currently rejected with hard ±10s!)
        16..=30 => 10,  // Poor but possible
        _ => -1000,     // Hard reject
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

/// Combined scoring with guardrails against false positives (spec-04).
/// Returns score >= ACCEPT_THRESHOLD for acceptable matches, or negative for rejections.
fn combined_score(
    lrclib: &Track,
    lrclib_quality: i32,
    spotify: &SpotifyTrack,
    group_artist_norm: &str,
) -> i32 {
    let spotify_duration_sec = spotify.duration_ms / 1000;
    let duration_diff = (lrclib.duration_sec - spotify_duration_sec).abs();

    // ═══════════════════════════════════════════════════════════════════════
    // GUARDRAIL 1: Hard duration rejection
    // Reject if diff > 30s OR diff > 25% of song length (whichever is larger)
    // ═══════════════════════════════════════════════════════════════════════
    let max_allowed_diff = 30_i64.max((spotify_duration_sec as f64 * 0.25) as i64);
    if duration_diff > max_allowed_diff {
        return -1000;
    }

    // Duration score (graduated)
    let dur_score = match duration_diff {
        0..=2 => 100,
        3..=5 => 80,
        6..=10 => 50,
        11..=15 => 25,
        16..=30 => 10,
        _ => 0,
    };

    let mut score = dur_score;

    // ═══════════════════════════════════════════════════════════════════════
    // GUARDRAIL 2: Artist verification
    // Even though we matched on (title_norm, artist_norm), double-check
    // ═══════════════════════════════════════════════════════════════════════
    let spotify_artist_norm = normalize_artist(&spotify.artist);
    let artist_match = if spotify_artist_norm == group_artist_norm {
        50  // Exact match
    } else {
        let sim = compute_artist_similarity(&spotify_artist_norm, group_artist_norm);
        if sim < 0.3 {
            return -500;  // Artist mismatch - reject
        }
        (sim * 30.0) as i32  // Partial credit
    };
    score += artist_match;

    // LRCLIB quality score (existing logic, typically -50 to +80)
    score += lrclib_quality;

    // Title cleanliness bonus
    if !has_garbage_title_pattern(&lrclib.title) {
        score += 30;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GUARDRAIL 3: Popularity as tiebreaker only (bounded)
    // Keep influence bounded (0-10 points, not 0-20)
    // ═══════════════════════════════════════════════════════════════════════
    score += spotify.popularity / 10;

    score  // Typical range: 80-250 for good matches
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
            a.quality.cmp(&b.quality).then_with(|| b.track.id.cmp(&a.track.id))
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
    // Use optimized JOIN query instead of subquery (spec-02)
    // This changes: WHERE t.last_lyrics_id IN (SELECT id FROM lyrics WHERE has_synced_lyrics = 1)
    // To: FROM lyrics l JOIN tracks t ON t.last_lyrics_id = l.id WHERE l.has_synced_lyrics = 1
    // EXPLAIN shows: SEARCH l USING COVERING INDEX + SEARCH t USING INDEX (instead of LIST SUBQUERY)
    let (count_sql, select_sql) = if let Some(artists) = artist_filter {
        let placeholders: Vec<String> = artists.iter().map(|_| "LOWER(t.artist_name) LIKE ?".to_string()).collect();
        let where_clause = placeholders.join(" OR ");
        (
            format!(
                "SELECT COUNT(*)
                 FROM lyrics l
                 JOIN tracks t ON t.last_lyrics_id = l.id
                 WHERE l.has_synced_lyrics = 1
                   AND t.duration > 45 AND t.duration < 600
                   AND ({})", where_clause
            ),
            format!(
                "SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
                 FROM lyrics l
                 JOIN tracks t ON t.last_lyrics_id = l.id
                 WHERE l.has_synced_lyrics = 1
                   AND t.duration > 45 AND t.duration < 600
                   AND ({})", where_clause
            ),
        )
    } else {
        (
            "SELECT COUNT(*)
             FROM lyrics l
             JOIN tracks t ON t.last_lyrics_id = l.id
             WHERE l.has_synced_lyrics = 1
               AND t.duration > 45 AND t.duration < 600".to_string(),
            "SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
             FROM lyrics l
             JOIN tracks t ON t.last_lyrics_id = l.id
             WHERE l.has_synced_lyrics = 1
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
    eprintln!("[READ] Complete: {} tracks", tracks.len());
    Ok(tracks)
}

/// Old grouping function (replaced by build_groups_and_index for delayed canonical).
/// Kept for backward compatibility.
#[allow(dead_code)]
fn group_tracks(tracks: Vec<Track>) -> FxHashMap<(String, String), Vec<Track>> {
    let mut groups: FxHashMap<(String, String), Vec<Track>> = FxHashMap::default();

    for track in tracks {
        let key = (normalize_title_with_artist(&track.title, &track.artist), normalize_artist(&track.artist));
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
/// not per track. This saves ~295 MB for 12.3M tracks.
fn build_groups_and_index(tracks: Vec<Track>) -> (Vec<LrclibGroup>, LrclibIndex) {
    let pb = create_progress_bar(tracks.len() as u64, "Phase 2: Building groups");

    // First pass: group tracks and compute quality scores
    let mut temp_groups: FxHashMap<(String, String), Vec<LrclibVariant>> = FxHashMap::default();

    for track in tracks {
        let title_norm = normalize_title_with_artist(&track.title, &track.artist);
        let artist_norm = normalize_artist(&track.artist);
        let quality = compute_quality_score(&track, None);

        let variant = LrclibVariant { track, quality };
        temp_groups.entry((title_norm, artist_norm)).or_default().push(variant);
        pb.inc(1);
    }

    // Second pass: convert to Vec<LrclibGroup> and build index
    let mut groups: Vec<LrclibGroup> = Vec::with_capacity(temp_groups.len());
    let mut index: LrclibIndex = FxHashMap::default();

    for (key, variants) in temp_groups {
        let group_idx = groups.len();
        index.insert(key.clone(), group_idx);
        groups.push(LrclibGroup {
            key,
            tracks: variants,
            best_match: None,
        });
    }

    pb.finish_with_message(format!(
        "Phase 2: Built {} groups with {} total variants",
        groups.len(),
        groups.iter().map(|g| g.tracks.len()).sum::<usize>()
    ));

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

/// Build LRCLIB index for streaming Spotify matching (old pipeline).
/// Returns FxHashMap: (title_norm, artist_norm) → Vec<index into canonical_tracks>
/// Replaced by build_groups_and_index() for delayed canonical selection.
#[allow(dead_code)]
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

/// Load audio features using batched IN queries (spec-02).
/// Much faster than streaming all 40M+ rows and filtering in Rust.
/// Uses the track_audio_features_track_id_unique index.
fn load_audio_features_batched(
    conn: &Connection,
    spotify_ids: &FxHashSet<String>,
) -> Result<FxHashMap<String, AudioFeatures>> {
    println!("[AUDIO] Loading audio features (batched for {} IDs)...", spotify_ids.len());

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
    groups_seen: &mut FxHashSet<usize>,  // Track which groups had candidates
) -> Result<()> {
    println!("[SPOTIFY] Streaming tracks with pop >= {} using delayed canonical matching...", min_popularity);

    // Get count for progress bar
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE popularity >= ?",
        [min_popularity],
        |row| row.get(0),
    )?;

    let pb = create_progress_bar(count as u64, "Streaming Spotify & matching (delayed canonical)");

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
            t.album_rowid
        FROM tracks t
        JOIN artists a ON a.rowid = (
            SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
        )
        WHERE t.popularity >= ?
    "#;

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([min_popularity])?;

    let mut scanned_count: u64 = 0;
    let mut groups_matched: u64 = 0;

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

        // Normalize Spotify track
        let title_norm = normalize_title_with_artist(&spotify_track.name, &spotify_track.artist);
        let artist_norm = normalize_artist(&spotify_track.artist);

        // Try exact (title, artist) match first
        if let Some(&group_idx) = index.get(&(title_norm.clone(), artist_norm.clone())) {
            let group = &mut groups[group_idx];
            let was_unmatched = group.best_match.is_none();
            groups_seen.insert(group_idx);  // Track that this group had candidates

            // Score against ALL variants in this group
            for (track_idx, variant) in group.tracks.iter().enumerate() {
                let score = combined_score(&variant.track, variant.quality, &spotify_track, &group.key.1);

                if score >= ACCEPT_THRESHOLD {
                    let current_best = group.best_match.as_ref().map(|(_, _, s)| *s).unwrap_or(i32::MIN);
                    if score > current_best {
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
                    continue;  // Skip if artists are too different
                }

                groups_seen.insert(group_idx);  // Track that this group had candidates
                let was_unmatched = group.best_match.is_none();

                // Score against all variants with artist similarity penalty
                for (track_idx, variant) in group.tracks.iter().enumerate() {
                    let mut score = combined_score(&variant.track, variant.quality, &spotify_track, group_artist_norm);

                    // Penalize non-exact artist match
                    if artist_sim < 1.0 {
                        score -= ((1.0 - artist_sim) * 50.0) as i32;
                    }

                    if score >= ACCEPT_THRESHOLD {
                        let current_best = group.best_match.as_ref().map(|(_, _, s)| *s).unwrap_or(i32::MIN);
                        if score > current_best {
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
fn match_lrclib_to_spotify_normalized(
    spotify_conn: &Connection,
    spotify_norm_path: &std::path::Path,
    groups: &mut [LrclibGroup],
    groups_seen: &mut FxHashSet<usize>,
) -> Result<()> {
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

    // Phase 1: Lookup track_rowids using prepared statement (uses index efficiently)
    // First try exact (title, artist) match, then fallback to primary artist only
    let mut matches_to_fetch: Vec<(usize, i64)> = Vec::new();
    let mut fallback_matches = 0u64;

    let mut lookup_stmt = norm_conn.prepare_cached(
        "SELECT track_rowid FROM track_norm WHERE title_norm = ? AND artist_norm = ? LIMIT 1"
    )?;

    let total_groups = groups.len() as u64;
    for (group_idx, group) in groups.iter().enumerate() {
        let title_norm = &group.key.0;
        let artist_norm = &group.key.1;

        // Try exact match first
        let found = if let Ok(track_rowid) = lookup_stmt.query_row(
            rusqlite::params![title_norm, artist_norm],
            |row| row.get::<_, i64>(0)
        ) {
            matches_to_fetch.push((group_idx, track_rowid));
            groups_seen.insert(group_idx);
            true
        } else {
            false
        };

        // Fallback: try primary artist only (e.g., "mustard, migos" → "mustard")
        if !found {
            if let Some(primary_artist) = extract_primary_artist(artist_norm) {
                if let Ok(track_rowid) = lookup_stmt.query_row(
                    rusqlite::params![title_norm, &primary_artist],
                    |row| row.get::<_, i64>(0)
                ) {
                    matches_to_fetch.push((group_idx, track_rowid));
                    groups_seen.insert(group_idx);
                    fallback_matches += 1;
                }
            }
        }

        let idx = group_idx as u64;
        log_progress("MATCH", idx + 1, total_groups, 500_000);
        if group_idx % 50_000 == 0 {
            pb.set_position(idx);
        }
    }
    pb.finish_with_message(format!("[MATCH] Found {} potential matches ({} via fallback)", matches_to_fetch.len(), fallback_matches));
    eprintln!("[MATCH] Complete: {} matches from {} groups ({} via primary-artist fallback)", matches_to_fetch.len(), total_groups, fallback_matches);

    // Phase 2: Batch fetch track details for matches
    eprintln!("[FETCH] Fetching track details for {} matches...", matches_to_fetch.len());
    let rowids: Vec<i64> = matches_to_fetch.iter().map(|(_, r)| *r).collect();
    let track_details = batch_fetch_track_details(spotify_conn, &rowids)?;
    eprintln!("[FETCH] Complete: {} track details loaded", track_details.len());

    // Phase 3: Score and assign matches
    let pb2 = create_progress_bar(matches_to_fetch.len() as u64, "Scoring matches");
    let mut groups_matched = 0u64;

    for (i, (group_idx, track_rowid)) in matches_to_fetch.iter().enumerate() {
        if let Some(spotify_track) = track_details.get(track_rowid) {
            let group = &mut groups[*group_idx];
            let was_unmatched = group.best_match.is_none();

            // Score against ALL variants in this group
            for (track_idx, variant) in group.tracks.iter().enumerate() {
                let score = combined_score(&variant.track, variant.quality, spotify_track, &group.key.1);

                if score >= ACCEPT_THRESHOLD {
                    let current_best = group.best_match.as_ref().map(|(_, _, s)| *s).unwrap_or(i32::MIN);
                    if score > current_best {
                        group.best_match = Some((track_idx, spotify_track.clone(), score));
                    }
                }
            }

            if was_unmatched && group.best_match.is_some() {
                groups_matched += 1;
            }
        }

        if i % 10_000 == 0 {
            pb2.set_position(i as u64);
        }
    }
    pb2.finish_with_message(format!("[MATCH] Matched {} groups", groups_matched));

    let match_rate = if !groups.is_empty() {
        100.0 * groups_matched as f64 / groups.len() as f64
    } else {
        0.0
    };
    println!("[MATCH] Match rate: {:.1}%", match_rate);

    Ok(())
}

/// Batch fetch track details by rowids.
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
        let sql = format!(
            r#"SELECT
                t.rowid,
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
            WHERE t.rowid IN ({})"#,
            placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = chunk.iter().map(|r| r as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(params.as_slice())?;

        while let Some(row) = rows.next()? {
            let rowid: i64 = row.get(0)?;
            let track = SpotifyTrack {
                id: row.get(1)?,
                name: row.get(2)?,
                artist: row.get(3)?,
                duration_ms: row.get(4)?,
                popularity: row.get(5)?,
                isrc: row.get(6)?,
                album_rowid: row.get(7)?,
            };
            result.insert(rowid, track);
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
                    let best_variant = group.tracks.iter()
                        .max_by(|a, b| {
                            a.quality.cmp(&b.quality)
                                .then_with(|| b.track.id.cmp(&a.track.id))
                        })
                        .unwrap();  // Safe: groups always have at least one track

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
        enriched.len(), matched_count, match_rate
    ));

    enriched
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

    println!("[COLLECT] Need {} track IDs and {} album rowids", track_ids.len(), album_rowids.len());
    (track_ids, album_rowids)
}

/// Collect needed Spotify track IDs and album rowids from best matches (old pipeline).
/// Replaced by collect_needed_ids_from_groups() for delayed canonical selection.
#[allow(dead_code)]
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
        let sql = format!(r#"
            SELECT ta.track_rowid, a.name
            FROM track_artists ta
            JOIN artists a ON a.rowid = ta.artist_rowid
            WHERE ta.track_rowid IN ({})
              AND ta.artist_rowid = (
                  SELECT MIN(artist_rowid)
                  FROM track_artists
                  WHERE track_rowid = ta.track_rowid
              )
        "#, placeholders);

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

/// Load album image URLs using batched IN queries (spec-02).
/// Much faster than scanning entire album_images table.
/// Uses the album_images_album_id index.
fn load_album_images_batched(
    conn: &Connection,
    album_rowids: &FxHashSet<i64>,
) -> Result<FxHashMap<i64, String>> {
    println!("[IMAGES] Loading album images (batched for {} albums)...", album_rowids.len());

    let rowids_vec: Vec<i64> = album_rowids.iter().copied().collect();
    let mut lookup: FxHashMap<i64, String> = FxHashMap::default();

    if rowids_vec.is_empty() {
        return Ok(lookup);
    }

    // Batch by 999 (SQLite parameter limit)
    for chunk in rowids_vec.chunks(999) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!(r#"
            SELECT album_rowid, url, height
            FROM album_images
            WHERE album_rowid IN ({})
              AND height BETWEEN 250 AND 350
            ORDER BY ABS(height - 300)
        "#, placeholders);

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

    println!("[IMAGES] Loaded {} album image URLs (batched)", lookup.len());
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
        None => true,                         // No match at all
        Some(s) if s < ACCEPT_THRESHOLD => true,  // Below acceptance threshold
        _ => false,                           // Good match, don't log
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
                candidate_count: 0,  // We don't track exact count
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
                    duration_diff_sec: (variant.track.duration_sec - spotify.duration_ms / 1000).abs(),
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
fn write_match_failures(
    conn: &Connection,
    failures: &[MatchFailureEntry],
) -> Result<()> {
    if failures.is_empty() {
        println!("[FAILURES] No match failures to log");
        return Ok(());
    }

    const BATCH_SIZE: usize = 500;
    let total_batches = (failures.len() + BATCH_SIZE - 1) / BATCH_SIZE;
    println!("[FAILURES] Logging {} match failures in {} batches...", failures.len(), total_batches);

    let pb = create_progress_bar(failures.len() as u64, "Writing failure logs");

    // Pre-process entries: serialize JSON and convert reason to string
    let prepared: Vec<PreparedFailureEntry> = failures.iter().map(|entry| {
        let candidates_json = serde_json::to_string(
            &entry.spotify_candidates.iter().take(5).collect::<Vec<_>>()
        ).unwrap_or_else(|_| "[]".to_string());

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
    }).collect();

    // Write in batches using multi-value INSERTs
    let mut written = 0u64;
    for chunk in prepared.chunks(BATCH_SIZE) {
        execute_failure_batch_insert(conn, chunk)?;
        written += chunk.len() as u64;
        pb.set_position(written);

        // Tail-friendly logging
        if written % 100_000 == 0 {
            eprintln!("[FAILURES] {}/{} ({:.1}%)", written, failures.len(), 100.0 * written as f64 / failures.len() as f64);
        }
    }

    pb.finish_with_message(format!("[FAILURES] Logged {} match failures", failures.len()));
    Ok(())
}

/// Execute a batched INSERT for failure entries.
fn execute_failure_batch_insert(
    conn: &Connection,
    batch: &[PreparedFailureEntry],
) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }

    // Build multi-value INSERT with 12 columns per row
    let placeholders: Vec<&str> = (0..batch.len())
        .map(|_| "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .collect();

    let sql = format!(
        "INSERT INTO match_failures (
            lrclib_id, lrclib_title, lrclib_artist, lrclib_album,
            lrclib_duration_sec, lrclib_title_norm, lrclib_artist_norm,
            lrclib_quality, group_variant_count,
            failure_reason, best_score, spotify_candidates
        ) VALUES {}",
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare_cached(&sql)?;

    // Flatten batch into parameter list
    let params: Vec<&dyn rusqlite::ToSql> = batch
        .iter()
        .flat_map(|e| {
            vec![
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

    // Phase 2: Build groups and index (delayed canonical selection - spec-03)
    // Keep ALL variants per group, don't select canonical yet
    let (mut groups, index) = build_groups_and_index(tracks);
    println!("\nBuilt {} unique (title, artist) groups", groups.len());

    // Build title-only index for 2-phase Spotify matching
    let title_only_index = build_title_only_index(&groups);

    // Phase 3: Spotify enrichment with delayed canonical selection
    // Track which groups had Spotify candidates for failure logging
    let mut groups_seen: FxHashSet<usize> = FxHashSet::default();

    let (enriched_tracks, failure_data) = if let Some(ref spotify_path) = args.spotify {
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

        // Use pre-normalized Spotify index if available (much faster)
        if let Some(ref spotify_norm_path) = args.spotify_normalized {
            // Match LRCLIB → Spotify using indexed lookup (no memory load)
            match_lrclib_to_spotify_normalized(
                &spotify_conn,
                spotify_norm_path,
                &mut groups,
                &mut groups_seen,
            )?;
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
        let failures = collect_match_failures(&groups, &groups_seen);
        println!("[FAILURES] Found {} potential failures to log", failures.len());

        // Collect IDs we actually need for audio features and images
        let (needed_track_ids, needed_album_rowids) = collect_needed_ids_from_groups(&groups);

        // Load audio features using batched IN queries (spec-02 optimization)
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
            load_audio_features_batched(&af_conn, &needed_track_ids)?
        } else {
            FxHashMap::default()
        };

        // Load album images using batched IN queries (spec-02 optimization)
        let image_lookup = load_album_images_batched(&spotify_conn, &needed_album_rowids)?;

        // Select canonical and enrich (delayed selection - spec-03)
        println!("\nSelecting canonical tracks and enriching...");
        let enriched = select_canonical_and_enrich(groups, &audio_lookup, &image_lookup);

        (enriched, Some(failures))
    } else {
        // No Spotify data: select best quality variant from each group
        println!("\nNo Spotify data - selecting canonical by quality...");
        let enriched = select_canonical_and_enrich(groups, &FxHashMap::default(), &FxHashMap::default());
        (enriched, None)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_track_number_stripping() {
        assert_eq!(normalize_title("03 - Love You To Death"), "love you to death");
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
        assert_eq!(normalize_title("I Call Your Name (1964)"), "i call your name");
        assert_eq!(normalize_title("Something (2009)"), "something");
    }

    #[test]
    fn test_encoding_fixes() {
        // ? to apostrophe
        assert_eq!(normalize_punctuation("Can?t Buy Me Love"), "Can't Buy Me Love");
        assert_eq!(normalize_punctuation("Don?t Stop"), "Don't Stop");
        // Apostrophe spacing
        assert_eq!(normalize_punctuation("She s Leaving Home"), "She's Leaving Home");
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
        assert_eq!(normalize_punctuation("Rock \u{2018}n\u{2019} Roll"), "Rock 'n' Roll");
        assert_eq!(normalize_punctuation("\u{201C}Quoted\u{201D}"), "\"Quoted\"");
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
        // 15s off (currently rejected with hard ±10s, now acceptable)
        assert_eq!(duration_score(414, 429_000), 25);
        // 29s off
        assert_eq!(duration_score(400, 429_000), 10);
        // 35s off - hard reject (diff > 30s)
        assert_eq!(duration_score(394, 429_000), -1000);
    }

    #[test]
    fn test_artist_similarity() {
        // Exact match
        assert!((compute_artist_similarity("type o negative", "type o negative") - 1.0).abs() < 0.001);
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
            duration_ms: 429_000,
            popularity: 64,
            isrc: None,
            album_rowid: 1,
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
            duration_ms: 200_000, // 100s diff - way over 30s limit
            popularity: 80,
            isrc: None,
            album_rowid: 1,
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
            duration_ms: 200_000,
            popularity: 80,
            isrc: None,
            album_rowid: 1,
        };

        let score = combined_score(&lrclib_track, 40, &spotify_track, "artist one");
        assert!(score < 0); // Should be rejected due to artist mismatch
    }

    #[test]
    fn test_extract_primary_artist() {
        // Comma-separated artists
        assert_eq!(extract_primary_artist("mustard, migos"), Some("mustard".to_string()));
        assert_eq!(extract_primary_artist("duck sauce, a-trak and armand van helden"), Some("duck sauce".to_string()));
        // & separator
        assert_eq!(extract_primary_artist("nick cave and the bad seeds"), Some("nick cave".to_string()));
        assert_eq!(extract_primary_artist("farid bang and julian williams"), Some("farid bang".to_string()));
        // Slash separator
        assert_eq!(extract_primary_artist("brent faiyaz/dahi/tyler, the creator"), Some("brent faiyaz".to_string()));
        // Featuring
        assert_eq!(extract_primary_artist("jay park feat loco"), Some("jay park".to_string()));
        // No separator - single artist
        assert_eq!(extract_primary_artist("beatles"), None);
        assert_eq!(extract_primary_artist("rolling stones"), None);
        // "The " stripping on primary artist
        assert_eq!(extract_primary_artist("the deslondes and dan cutler"), Some("deslondes".to_string()));
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
        assert_eq!(normalize_title("God Only Knows / 2021 Remaster"), "god only knows");
        // Reworked variants
        assert_eq!(normalize_title("Song (Reworked)"), "song");
        assert_eq!(normalize_title("Song (Redux)"), "song");
        // Version numbers
        assert_eq!(normalize_title("Song (2)"), "song");
        assert_eq!(normalize_title("Song [V2]"), "song");
        // Take in parens
        assert_eq!(normalize_title("Song (take 4)"), "song");
    }
}
