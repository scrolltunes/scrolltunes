//! Analyze unmatched tracks and test recovery strategies
//!
//! Usage: analyze-failures <lrclib-enriched.sqlite3> <spotify_normalized.sqlite3>

use anyhow::Result;
use rayon::prelude::*;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

/// Levenshtein distance for fuzzy matching
fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();

    if a_len == 0 {
        return b_len;
    }
    if b_len == 0 {
        return a_len;
    }

    let mut matrix = vec![vec![0usize; b_len + 1]; a_len + 1];

    for (i, row) in matrix.iter_mut().enumerate() {
        row[0] = i;
    }
    for (j, cell) in matrix[0].iter_mut().enumerate() {
        *cell = j;
    }

    for i in 1..=a_len {
        for j in 1..=b_len {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            matrix[i][j] = (matrix[i - 1][j] + 1)
                .min(matrix[i][j - 1] + 1)
                .min(matrix[i - 1][j - 1] + cost);
        }
    }

    matrix[a_len][b_len]
}

/// Similarity ratio (0.0 to 1.0)
fn similarity(a: &str, b: &str) -> f64 {
    let dist = levenshtein(a, b);
    let max_len = a.len().max(b.len());
    if max_len == 0 {
        return 1.0;
    }
    1.0 - (dist as f64 / max_len as f64)
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: analyze-failures <lrclib-enriched.sqlite3> <spotify_normalized.sqlite3> [--sample N]");
        std::process::exit(1);
    }

    let lrclib_path = &args[1];
    let spotify_path = &args[2];
    let sample_size: usize = args
        .iter()
        .position(|a| a == "--sample")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(5000);

    let start = Instant::now();

    // Load unmatched tracks from LRCLIB
    println!("Loading unmatched tracks from LRCLIB...");
    let lrclib_conn = Connection::open(lrclib_path)?;
    let mut stmt = lrclib_conn.prepare(
        "SELECT title_norm, artist_norm FROM tracks WHERE spotify_id IS NULL ORDER BY RANDOM() LIMIT ?",
    )?;
    let unmatched: Vec<(String, String)> = stmt
        .query_map([sample_size], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();
    println!("  Loaded {} unmatched tracks", unmatched.len());

    // Load Spotify normalized index into memory for fast parallel access
    println!("Loading Spotify normalized index...");
    let spotify_conn = Connection::open(spotify_path)?;
    let mut stmt = spotify_conn.prepare("SELECT title_norm, artist_norm FROM track_norm")?;

    // Build artist -> titles map
    let mut artist_titles: HashMap<String, Vec<String>> = HashMap::new();
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let title: String = row.get(0)?;
        let artist: String = row.get(1)?;
        artist_titles.entry(artist).or_default().push(title);
    }
    println!("  Loaded {} unique artists", artist_titles.len());

    // Also build exact lookup set
    let exact_set: std::collections::HashSet<(String, String)> = artist_titles
        .iter()
        .flat_map(|(a, titles)| titles.iter().map(move |t| (t.clone(), a.clone())))
        .collect();
    println!("  Built exact lookup set with {} entries", exact_set.len());

    // Analyze in parallel
    println!("\nAnalyzing {} samples in parallel...", unmatched.len());

    let suffix_strip = AtomicUsize::new(0);
    let artist_primary = AtomicUsize::new(0);
    let the_prefix = AtomicUsize::new(0);
    let track_num = AtomicUsize::new(0);
    let fuzzy_85 = AtomicUsize::new(0);
    let fuzzy_90 = AtomicUsize::new(0);
    let fuzzy_95 = AtomicUsize::new(0);
    let not_found = AtomicUsize::new(0);

    // Regex patterns (compiled once)
    let suffix_re = regex::Regex::new(r"(?i)\s*[\(\[].*?(remix|version|edit|remaster|live|mix|stereo|mono|radio|explicit|clean|deluxe).*?[\)\]]?\s*$").unwrap();
    let suffix_dash_re =
        regex::Regex::new(r"(?i)\s*-\s*(remix|version|remaster|live|edit).*$").unwrap();
    let track_num_re = regex::Regex::new(r"^\d+[\.\-\s]+").unwrap();

    unmatched.par_iter().for_each(|(title_norm, artist_norm)| {
        // Strategy 1: Strip suffixes
        let stripped = suffix_re.replace(title_norm, "");
        let stripped = suffix_dash_re.replace(&stripped, "");
        if stripped != *title_norm
            && exact_set.contains(&(stripped.to_string(), artist_norm.clone()))
        {
            suffix_strip.fetch_add(1, Ordering::Relaxed);
            return;
        }

        // Strategy 2: Primary artist
        let primary = artist_norm
            .split(',')
            .next()
            .unwrap_or(artist_norm)
            .split(" and ")
            .next()
            .unwrap_or(artist_norm)
            .split(" & ")
            .next()
            .unwrap_or(artist_norm)
            .trim();
        if primary != artist_norm && exact_set.contains(&(title_norm.clone(), primary.to_string()))
        {
            artist_primary.fetch_add(1, Ordering::Relaxed);
            return;
        }

        // Strategy 3: "The" prefix
        if !title_norm.starts_with("the ") {
            let with_the = format!("the {}", title_norm);
            if exact_set.contains(&(with_the, artist_norm.clone())) {
                the_prefix.fetch_add(1, Ordering::Relaxed);
                return;
            }
        }

        // Strategy 4: Track number stripping
        let no_track = track_num_re.replace(title_norm, "");
        if no_track != *title_norm
            && exact_set.contains(&(no_track.to_string(), artist_norm.clone()))
        {
            track_num.fetch_add(1, Ordering::Relaxed);
            return;
        }

        // Strategy 5: Fuzzy matching (only for artists that exist)
        if let Some(titles) = artist_titles.get(artist_norm) {
            let mut best_sim = 0.0f64;
            for cand in titles {
                let s = similarity(title_norm, cand);
                if s > best_sim {
                    best_sim = s;
                }
                if s >= 0.95 {
                    break; // Good enough
                }
            }
            if best_sim >= 0.95 {
                fuzzy_95.fetch_add(1, Ordering::Relaxed);
                return;
            } else if best_sim >= 0.90 {
                fuzzy_90.fetch_add(1, Ordering::Relaxed);
                return;
            } else if best_sim >= 0.85 {
                fuzzy_85.fetch_add(1, Ordering::Relaxed);
                return;
            }
        }

        not_found.fetch_add(1, Ordering::Relaxed);
    });

    let elapsed = start.elapsed();

    // Print results
    println!("\n=== RECOVERY POTENTIAL ({} samples) ===", unmatched.len());
    println!();

    let total = unmatched.len();
    let ss = suffix_strip.load(Ordering::Relaxed);
    let ap = artist_primary.load(Ordering::Relaxed);
    let tp = the_prefix.load(Ordering::Relaxed);
    let tn = track_num.load(Ordering::Relaxed);
    let f95 = fuzzy_95.load(Ordering::Relaxed);
    let f90 = fuzzy_90.load(Ordering::Relaxed);
    let f85 = fuzzy_85.load(Ordering::Relaxed);
    let nf = not_found.load(Ordering::Relaxed);

    println!("Strategy              Count     %      Extrapolated");
    println!("─────────────────────────────────────────────────────");
    println!(
        "Suffix stripping      {:>6}  {:>5.1}%   ~{:>9}",
        ss,
        100.0 * ss as f64 / total as f64,
        (1466013.0 * ss as f64 / total as f64) as i64
    );
    println!(
        "Primary artist        {:>6}  {:>5.1}%   ~{:>9}",
        ap,
        100.0 * ap as f64 / total as f64,
        (1466013.0 * ap as f64 / total as f64) as i64
    );
    println!(
        "The prefix            {:>6}  {:>5.1}%   ~{:>9}",
        tp,
        100.0 * tp as f64 / total as f64,
        (1466013.0 * tp as f64 / total as f64) as i64
    );
    println!(
        "Track number strip    {:>6}  {:>5.1}%   ~{:>9}",
        tn,
        100.0 * tn as f64 / total as f64,
        (1466013.0 * tn as f64 / total as f64) as i64
    );
    println!(
        "Fuzzy ≥95%            {:>6}  {:>5.1}%   ~{:>9}",
        f95,
        100.0 * f95 as f64 / total as f64,
        (1466013.0 * f95 as f64 / total as f64) as i64
    );
    println!(
        "Fuzzy 90-95%          {:>6}  {:>5.1}%   ~{:>9}",
        f90,
        100.0 * f90 as f64 / total as f64,
        (1466013.0 * f90 as f64 / total as f64) as i64
    );
    println!(
        "Fuzzy 85-90%          {:>6}  {:>5.1}%   ~{:>9}",
        f85,
        100.0 * f85 as f64 / total as f64,
        (1466013.0 * f85 as f64 / total as f64) as i64
    );
    println!("─────────────────────────────────────────────────────");

    let recoverable = ss + ap + tp + tn + f95 + f90 + f85;
    println!(
        "TOTAL RECOVERABLE     {:>6}  {:>5.1}%   ~{:>9}",
        recoverable,
        100.0 * recoverable as f64 / total as f64,
        (1466013.0 * recoverable as f64 / total as f64) as i64
    );
    println!(
        "Not recoverable       {:>6}  {:>5.1}%",
        nf,
        100.0 * nf as f64 / total as f64
    );
    println!();
    println!("Elapsed: {:.2}s", elapsed.as_secs_f64());

    Ok(())
}
