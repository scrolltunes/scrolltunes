use anyhow::{Context, Result};
use clap::Parser;
use indicatif::{ProgressBar, ProgressStyle};
use once_cell::sync::Lazy;
use rayon::prelude::*;
use regex::Regex;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;

#[derive(Parser)]
#[command(name = "lrclib-extract")]
#[command(about = "Extract deduplicated LRCLIB search index from SQLite dump")]
struct Args {
    source: PathBuf,

    output: PathBuf,

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
static ARTIST_TRANSLITERATIONS: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    let mut m = HashMap::new();
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

fn group_tracks(tracks: Vec<Track>) -> HashMap<(String, String), Vec<Track>> {
    let mut groups: HashMap<(String, String), Vec<Track>> = HashMap::new();

    for track in tracks {
        let key = (normalize_title(&track.title), normalize_artist(&track.artist));
        groups.entry(key).or_default().push(track);
    }

    groups
}

fn process_groups(groups: HashMap<(String, String), Vec<Track>>) -> Vec<ScoredTrack> {
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

fn write_output(conn: &mut Connection, tracks: &[ScoredTrack]) -> Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -64000;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE tracks (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT,
            duration_sec INTEGER NOT NULL,
            title_norm TEXT NOT NULL,
            artist_norm TEXT NOT NULL,
            quality INTEGER NOT NULL
        );

        CREATE VIRTUAL TABLE tracks_fts USING fts5(
            title, artist,
            content='tracks',
            content_rowid='id',
            tokenize='porter'
        );",
    )?;

    let pb = create_progress_bar(tracks.len() as u64, "Phase 3: Writing output");

    for chunk in tracks.chunks(WRITE_BATCH_SIZE) {
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO tracks (id, title, artist, album, duration_sec, title_norm, artist_norm, quality)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;

            for st in chunk {
                stmt.execute(params![
                    st.track.id,
                    st.track.title,
                    st.track.artist,
                    st.track.album,
                    st.track.duration_sec,
                    st.title_norm,
                    st.artist_norm,
                    st.quality,
                ])?;
                pb.inc(1);
            }
        }
        tx.commit()?;
    }

    pb.finish_with_message(format!("Phase 3: Wrote {} tracks", tracks.len()));
    Ok(())
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

fn test_search(conn: &Connection, query: &str) -> Result<()> {
    println!("\nSearch results for '{}':", query);
    println!("{:-<80}", "");

    let mut stmt = conn.prepare(
        "SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality
         FROM tracks_fts fts
         JOIN tracks t ON fts.rowid = t.id
         WHERE tracks_fts MATCH ?1
         ORDER BY t.quality DESC
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

        println!(
            "[{}] {} - {} ({}) [{}s] quality={}",
            id,
            artist,
            title,
            album.unwrap_or_else(|| "Unknown".to_string()),
            duration,
            quality
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

    let groups = group_tracks(tracks);
    println!("Found {} unique (title, artist) groups", groups.len());

    let canonical_tracks = process_groups(groups);

    if args.output.exists() {
        std::fs::remove_file(&args.output)
            .context("Failed to remove existing output file")?;
    }

    println!("Creating output database: {:?}", args.output);
    let mut output_conn = Connection::open(&args.output)
        .context("Failed to create output database")?;

    write_output(&mut output_conn, &canonical_tracks)?;
    build_fts_index(&output_conn)?;
    optimize_database(&output_conn)?;

    let elapsed = start.elapsed();
    let file_size = std::fs::metadata(&args.output)?.len();

    println!("\n{:=<60}", "");
    println!("Extraction complete!");
    println!("  Tracks: {}", canonical_tracks.len());
    println!("  Output size: {:.2} MB", file_size as f64 / 1_048_576.0);
    println!("  Elapsed: {:.2}s", elapsed.as_secs_f64());
    println!("{:=<60}", "");

    if let Some(query) = args.test {
        test_search(&output_conn, &query)?;
    }

    Ok(())
}
