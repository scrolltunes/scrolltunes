//! Simulate new normalization rules against match failures
//! Usage: cargo run --release --bin simulate -- <failures_db>

use any_ascii::any_ascii;
use anyhow::Result;
use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::Connection;
use unicode_normalization::UnicodeNormalization;

// ============================================================================
// NORMALIZATION (copied from main.rs with new rules)
// ============================================================================

static TRACK_NUMBER: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^(?:track\s*)?\d{1,4}\s*[-.:)]\s*").unwrap());

static TRACK_NUMBER_SPACE_PREFIX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(?:0[1-9]|[1-9]\d?)\s+([A-Z])").unwrap());

static BRACKET_SUFFIX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s*\[[^\]]+\]\s*$").unwrap());

static FILE_EXTENSION: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\.(flac|mp3|wav|m4a|ogg|aac)$").unwrap());

static YEAR_SUFFIX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s*\(\d{4}\)\s*$").unwrap());

static MOJIBAKE_SUFFIX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+\?+$").unwrap());

static TITLE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)\s*[\(\[](feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*[\(\[].*?(remaster|remix|mix|edit|version|live|acoustic|radio|single|album|deluxe|bonus|instrumental|demo|mono|stereo|extended|original|official|explicit|clean|censored|uncensored).*?[\)\]]").unwrap(),
        Regex::new(r"(?i)\s*-\s*(remaster|remix|remastered|live|acoustic|radio edit|single version|album version|bonus track|instrumental|demo).*$").unwrap(),
        Regex::new(r"(?i)\s*/\s*(remaster|remix|live|acoustic).*$").unwrap(),
    ]
});

fn is_combining_mark(c: char) -> bool {
    matches!(c, '\u{0300}'..='\u{036F}' | '\u{1AB0}'..='\u{1AFF}' |
             '\u{1DC0}'..='\u{1DFF}' | '\u{20D0}'..='\u{20FF}' |
             '\u{FE20}'..='\u{FE2F}')
}

fn fold_to_ascii(s: &str) -> String {
    // First strip diacritics via NFKD decomposition
    let stripped: String = s.nfkd().filter(|c| !is_combining_mark(*c)).collect();
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

    s = FILE_EXTENSION.replace_all(&s, "").to_string();
    s = YEAR_SUFFIX.replace_all(&s, "").to_string();
    s = BRACKET_SUFFIX.replace_all(&s, "").to_string();
    s = TRACK_NUMBER.replace(&s, "").to_string();

    if let Some(caps) = TRACK_NUMBER_SPACE_PREFIX.captures(&s) {
        if let Some(letter) = caps.get(1) {
            s = format!("{}{}", letter.as_str(), &s[caps.get(0).unwrap().end()..]);
        }
    }

    s = MOJIBAKE_SUFFIX.replace(&s, "").to_string();
    s = normalize_punctuation(&s);
    s = fold_to_ascii(&s);

    for pattern in TITLE_PATTERNS.iter() {
        s = pattern.replace_all(&s, "").to_string();
    }

    s.to_lowercase().trim().to_string()
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: simulate <failures_db>");
        std::process::exit(1);
    }

    let failures_db = &args[1];

    // Read failures and test new normalization
    eprintln!("Loading failures...");
    let failures_conn = Connection::open(failures_db)?;
    let mut stmt = failures_conn.prepare(
        "SELECT lrclib_title, lrclib_artist, lrclib_title_norm, lrclib_artist_norm
         FROM match_failures WHERE failure_reason = 'no_candidates'",
    )?;

    let mut total = 0u64;
    let mut title_changed = 0u64;

    // Categorize changes
    let mut track_num_fixed = 0u64;
    let mut bracket_fixed = 0u64;
    let mut extension_fixed = 0u64;
    let mut year_fixed = 0u64;
    let mut encoding_fixed = 0u64;
    let mut other_fixed = 0u64;

    let mut examples: Vec<(String, String, String, String)> = Vec::new();

    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let title: String = row.get(0)?;
        let _artist: String = row.get(1)?;
        let old_title_norm: String = row.get(2)?;
        let _old_artist_norm: String = row.get(3)?;

        let new_title_norm = normalize_title(&title);

        total += 1;

        if new_title_norm != old_title_norm {
            title_changed += 1;

            // Categorize the fix
            if TRACK_NUMBER_SPACE_PREFIX.is_match(&title)
                || (title
                    .chars()
                    .next()
                    .map(|c| c.is_ascii_digit())
                    .unwrap_or(false)
                    && old_title_norm
                        .chars()
                        .next()
                        .map(|c| c.is_ascii_digit())
                        .unwrap_or(false)
                    && !new_title_norm
                        .chars()
                        .next()
                        .map(|c| c.is_ascii_digit())
                        .unwrap_or(true))
            {
                track_num_fixed += 1;
            } else if BRACKET_SUFFIX.is_match(&title) {
                bracket_fixed += 1;
            } else if FILE_EXTENSION.is_match(&title) {
                extension_fixed += 1;
            } else if YEAR_SUFFIX.is_match(&title) {
                year_fixed += 1;
            } else if title.contains("?") || title.contains(" s ") || title.contains(" t ") {
                encoding_fixed += 1;
            } else {
                other_fixed += 1;
            }

            if examples.len() < 30 {
                examples.push((
                    title.clone(),
                    old_title_norm.clone(),
                    new_title_norm.clone(),
                    if TRACK_NUMBER_SPACE_PREFIX.is_match(&title) {
                        "track_num".to_string()
                    } else if BRACKET_SUFFIX.is_match(&title) {
                        "bracket".to_string()
                    } else if FILE_EXTENSION.is_match(&title) {
                        "extension".to_string()
                    } else if YEAR_SUFFIX.is_match(&title) {
                        "year".to_string()
                    } else {
                        "other".to_string()
                    },
                ));
            }
        }
    }

    println!("\n=== SIMULATION RESULTS ===\n");
    println!("Total no_candidates failures: {}", total);
    println!(
        "Title normalization changed:  {} ({:.2}%)",
        title_changed,
        100.0 * title_changed as f64 / total as f64
    );

    println!("\n=== BREAKDOWN BY FIX TYPE ===\n");
    println!("Track number prefix: {:>7}", track_num_fixed);
    println!("Bracket suffix:      {:>7}", bracket_fixed);
    println!("File extension:      {:>7}", extension_fixed);
    println!("Year suffix:         {:>7}", year_fixed);
    println!("Encoding issues:     {:>7}", encoding_fixed);
    println!("Other:               {:>7}", other_fixed);

    println!("\n=== EXAMPLES ===\n");
    for (title, old, new, category) in &examples {
        println!("[{}] \"{}\"", category, title);
        println!("  OLD: \"{}\"", old);
        println!("  NEW: \"{}\"", new);
        println!();
    }

    Ok(())
}
