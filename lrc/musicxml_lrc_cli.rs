// musicxml_lrc_cli.rs
//
// MusicXML -> LRC extractor + optional base-LRC enhancer + batch processor.
//
// This file intentionally bundles everything in one place so you can drop it into a repo and
// iterate. Split into modules later if you’re feeling responsible.
//
// Subcommands:
// - single: process one MusicXML (optionally enhance a base LRC)
// - batch: scan a directory, process many files in parallel, bucket-move inputs, write outputs,
//          and track status in SQLite (single writer, batched).
//
// Behavioral parity for per-file extraction/enhancing is based on extract_musicxml_lyrics.py.
//
// Suggested Cargo.toml deps:
//
// [dependencies]
// anyhow = "1"
// clap = { version = "4", features = ["derive"] }
// crossbeam-channel = "0.5"
// num-rational = "0.4"
// num-traits = "0.2"
// regex = "1"
// roxmltree = "0.18"
// rusqlite = { version = "0.31", features = ["bundled"] }
// walkdir = "2"
// sha2 = "0.10"
// hex = "0.4"

use anyhow::{anyhow, bail, Context, Result};
use clap::{Parser, Subcommand};
use crossbeam_channel::{bounded, Receiver, Sender};
use num_rational::Rational64;
use num_traits::{ToPrimitive, Zero};
use regex::Regex;
use roxmltree::{Document, Node};
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::HashSet;
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use walkdir::WalkDir;

type Pos = Rational64;

#[derive(Debug, Clone)]
struct LyricEvent {
    pos: Pos,
    text: String,
    idx: usize, // stable tie-breaker
}

#[derive(Debug, Clone)]
struct TempoEvent {
    pos: Pos,
    bpm: f64,
}

#[derive(Debug, Clone)]
struct LrcLine {
    tag: String,
    text: String,
}

#[derive(Debug, Clone)]
enum FinalStatus {
    Done,
    NoLyrics,
    Unprocessable,
    Failed,
    Skipped,
}

impl FinalStatus {
    fn as_db(&self) -> &'static str {
        match self {
            FinalStatus::Done => "done",
            FinalStatus::NoLyrics => "no_lyrics",
            FinalStatus::Unprocessable => "unprocessable",
            FinalStatus::Failed => "failed",
            FinalStatus::Skipped => "skipped",
        }
    }
}

#[derive(Debug, Clone)]
struct Job {
    input_path: PathBuf,
    rel_path: PathBuf,
    mtime: i64,
    size: i64,
}

#[derive(Debug, Clone)]
struct Outcome {
    job: Job,
    status: FinalStatus,
    reason_code: Option<String>,
    error: Option<String>,
    dest_path: Option<PathBuf>,
    output_path: Option<PathBuf>,
    duration_ms: u64,
}

#[derive(Parser, Debug)]
#[command(name = "musicxml-lrc")]
#[command(about = "Extract MusicXML lyrics into LRC; optionally enhance a base LRC; optionally batch-process directories.")]
struct Cli {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Process a single MusicXML file
    Single(SingleArgs),

    /// Process a directory tree of MusicXML files in parallel, with SQLite tracking + bucket moves
    Batch(BatchArgs),
}

#[derive(Parser, Debug, Clone)]
struct CommonExtractArgs {
    /// MusicXML part id to read lyrics from (default: P1)
    #[arg(long, default_value = "P1")]
    part: String,

    /// Keep duplicate lyric entries at identical timestamps
    #[arg(long)]
    no_dedupe: bool,

    /// Allow enhanced LRC output even when lengths differ
    #[arg(long)]
    force: bool,

    /// Allowed difference (seconds) between LRC end and MusicXML end
    #[arg(long, default_value_t = 5.0)]
    length_tolerance: f64,
}

#[derive(Parser, Debug)]
struct SingleArgs {
    /// Input MusicXML file
    input: PathBuf,

    /// Output LRC file (default: input basename .lrc)
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Base LRC file to enhance with word-level timing tags
    #[arg(long)]
    lrc: Option<PathBuf>,

    #[command(flatten)]
    common: CommonExtractArgs,
}

#[derive(Parser, Debug)]
struct BatchArgs {
    /// Root working directory containing input/ and bucket folders
    #[arg(long)]
    root: PathBuf,

    /// Input directory to scan (default: <root>/input)
    #[arg(long)]
    input_dir: Option<PathBuf>,

    /// Output directory for produced LRC files (default: <root>/lrc)
    #[arg(long)]
    output_dir: Option<PathBuf>,

    /// Optional directory containing base LRC files to enhance (matched by relative path / stem)
    #[arg(long)]
    base_lrc_dir: Option<PathBuf>,

    /// SQLite file path (default: <root>/state.sqlite)
    #[arg(long)]
    db_path: Option<PathBuf>,

    /// Number of worker threads (default: physical cores)
    #[arg(long)]
    workers: Option<usize>,

    /// Bounded channel capacity for jobs (default: 5000)
    #[arg(long, default_value_t = 5000)]
    queue: usize,

    /// Only process files with these extensions (comma-separated; default: musicxml,xml)
    #[arg(long, default_value = "musicxml,xml")]
    exts: String,

    /// If set, do not move inputs into bucket folders (debug mode)
    #[arg(long)]
    no_move: bool,

    /// If set, do not write outputs (debug mode)
    #[arg(long)]
    no_output: bool,

    #[command(flatten)]
    common: CommonExtractArgs,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.cmd {
        Command::Single(args) => cmd_single(args),
        Command::Batch(args) => cmd_batch(args),
    }
}

fn cmd_single(args: SingleArgs) -> Result<()> {
    let output_path = args
        .output
        .clone()
        .unwrap_or_else(|| args.input.with_extension("lrc"));

    let start = Instant::now();
    let res = process_one_musicxml(
        &args.input,
        &args.common,
        args.lrc.as_deref(),
    )?;

    write_lrc_atomic(&output_path, &res.lines)?;
    eprintln!(
        "Wrote {} lines to {} in {:?}",
        res.lines.len(),
        output_path.display(),
        start.elapsed()
    );
    Ok(())
}

fn cmd_batch(args: BatchArgs) -> Result<()> {
    let root = args.root.canonicalize().with_context(|| "Invalid --root")?;
    let input_dir = args
        .input_dir
        .clone()
        .unwrap_or_else(|| root.join("input"));
    let output_dir = args
        .output_dir
        .clone()
        .unwrap_or_else(|| root.join("lrc"));
    let base_lrc_dir = args.base_lrc_dir.clone();
    let db_path = args.db_path.clone().unwrap_or_else(|| root.join("state.sqlite"));

    let buckets = Buckets::new(&root);

    fs::create_dir_all(&input_dir).ok();
    fs::create_dir_all(&output_dir).ok();
    buckets.ensure_dirs()?;

    let workers = args.workers.unwrap_or_else(|| {
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(8)
    });

    // DB init + startup recovery
    let mut conn = Connection::open(&db_path).with_context(|| format!("Open db {}", db_path.display()))?;
    init_db(&mut conn)?;
    startup_recovery(&mut conn)?;

    // Channels
    let (job_tx, job_rx) = bounded::<Job>(args.queue);
    let (out_tx, out_rx) = bounded::<Outcome>(args.queue);

    // Spawn DB writer
    let db_writer = {
        let db_path = db_path.clone();
        std::thread::spawn(move || -> Result<()> {
            let mut conn = Connection::open(&db_path)
                .with_context(|| format!("Open db {}", db_path.display()))?;
            init_db(&mut conn)?;
            db_writer_loop(&mut conn, out_rx)
        })
    };

    // Spawn workers
    let mut worker_handles = Vec::with_capacity(workers);
    for wid in 0..workers {
        let rx = job_rx.clone();
        let tx = out_tx.clone();
        let buckets = buckets.clone();
        let output_dir = output_dir.clone();
        let input_dir = input_dir.clone();
        let base_lrc_dir = base_lrc_dir.clone();
        let common = args.common.clone();
        let no_move = args.no_move;
        let no_output = args.no_output;

        worker_handles.push(std::thread::spawn(move || {
            worker_loop(
                wid,
                rx,
                tx,
                &input_dir,
                &output_dir,
                base_lrc_dir.as_deref(),
                &buckets,
                &common,
                no_move,
                no_output,
            )
        }));
    }
    drop(out_tx); // allow writer to finish when workers close

    // Scan and enqueue jobs
    let exts: HashSet<String> = args
        .exts
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    let mut enqueued = 0usize;
    for entry in WalkDir::new(&input_dir).follow_links(false).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext_ok = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| exts.contains(&e.to_lowercase()))
            .unwrap_or(false);
        if !ext_ok {
            continue;
        }

        let rel = path.strip_prefix(&input_dir).unwrap_or(path).to_path_buf();
        let md = fs::metadata(path).ok();
        let (mtime, size) = match md.and_then(|m| {
            let size = m.len() as i64;
            let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64)?;
            Some((mtime, size))
        }) {
            Some(v) => v,
            None => continue,
        };

        // Skip logic: if already done with same mtime/size
        if is_done(&conn, path, mtime, size)? {
            continue;
        }
        upsert_pending(&conn, path, mtime, size)?;

        job_tx
            .send(Job {
                input_path: path.to_path_buf(),
                rel_path: rel,
                mtime,
                size,
            })
            .ok();
        enqueued += 1;
        if enqueued % 5000 == 0 {
            eprintln!("Enqueued {}", enqueued);
        }
    }
    drop(job_tx);

    // Wait workers
    for h in worker_handles {
        let _ = h.join();
    }

    // Wait DB writer
    match db_writer.join() {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(anyhow!("DB writer thread panicked")),
    }
}

#[derive(Debug, Clone)]
struct Buckets {
    success: PathBuf,
    no_lyrics: PathBuf,
    unprocessable: PathBuf,
    failed: PathBuf,
}

impl Buckets {
    fn new(root: &Path) -> Self {
        Self {
            success: root.join("out_success"),
            no_lyrics: root.join("out_no_lyrics"),
            unprocessable: root.join("out_unprocessable"),
            failed: root.join("out_failed"),
        }
    }

    fn ensure_dirs(&self) -> Result<()> {
        fs::create_dir_all(&self.success)?;
        fs::create_dir_all(&self.no_lyrics)?;
        fs::create_dir_all(&self.unprocessable)?;
        fs::create_dir_all(&self.failed)?;
        Ok(())
    }

    fn for_status(&self, status: &FinalStatus) -> Option<&Path> {
        match status {
            FinalStatus::Done => Some(&self.success),
            FinalStatus::NoLyrics => Some(&self.no_lyrics),
            FinalStatus::Unprocessable => Some(&self.unprocessable),
            FinalStatus::Failed => Some(&self.failed),
            FinalStatus::Skipped => None,
        }
    }
}

// --- DB ---

fn init_db(conn: &mut Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA temp_store=MEMORY;
        PRAGMA busy_timeout=5000;

        CREATE TABLE IF NOT EXISTS jobs (
          input_path    TEXT PRIMARY KEY,
          input_mtime   INTEGER NOT NULL,
          input_size    INTEGER NOT NULL,
          status        TEXT NOT NULL,
          reason_code   TEXT,
          error         TEXT,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          started_at    INTEGER,
          finished_at   INTEGER,
          dest_path     TEXT,
          output_path   TEXT,
          updated_at    INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
        "#,
    )?;
    Ok(())
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs() as i64
}

fn startup_recovery(conn: &mut Connection) -> Result<()> {
    // Any jobs stuck "validating"/"processing" after a crash: reset to pending.
    conn.execute(
        "UPDATE jobs SET status='pending', updated_at=? WHERE status IN ('validating','processing')",
        params![now_unix()],
    )?;
    Ok(())
}

fn is_done(conn: &Connection, path: &Path, mtime: i64, size: i64) -> Result<bool> {
    let mut stmt = conn.prepare(
        "SELECT status, input_mtime, input_size FROM jobs WHERE input_path=?1",
    )?;
    let mut rows = stmt.query(params![path.to_string_lossy().to_string()])?;
    if let Some(row) = rows.next()? {
        let status: String = row.get(0)?;
        let pm: i64 = row.get(1)?;
        let ps: i64 = row.get(2)?;
        if status == "done" && pm == mtime && ps == size {
            return Ok(true);
        }
    }
    Ok(false)
}

fn upsert_pending(conn: &Connection, path: &Path, mtime: i64, size: i64) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO jobs (input_path,input_mtime,input_size,status,updated_at)
        VALUES (?1,?2,?3,'pending',?4)
        ON CONFLICT(input_path) DO UPDATE SET
          input_mtime=excluded.input_mtime,
          input_size=excluded.input_size,
          status=CASE
            WHEN jobs.status='done' THEN jobs.status
            ELSE 'pending'
          END,
          updated_at=excluded.updated_at
        "#,
        params![
            path.to_string_lossy().to_string(),
            mtime,
            size,
            now_unix()
        ],
    )?;
    Ok(())
}

fn db_writer_loop(conn: &mut Connection, rx: Receiver<Outcome>) -> Result<()> {
    let mut batch: Vec<Outcome> = Vec::with_capacity(500);
    let mut last_flush = Instant::now();
    let flush_every = Duration::from_millis(750);

    loop {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(out) => {
                batch.push(out);
                if batch.len() >= 1000 || last_flush.elapsed() >= flush_every {
                    flush_batch(conn, &mut batch)?;
                    last_flush = Instant::now();
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                if !batch.is_empty() && last_flush.elapsed() >= flush_every {
                    flush_batch(conn, &mut batch)?;
                    last_flush = Instant::now();
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                if !batch.is_empty() {
                    flush_batch(conn, &mut batch)?;
                }
                break;
            }
        }
    }
    Ok(())
}

fn flush_batch(conn: &mut Connection, batch: &mut Vec<Outcome>) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            r#"
            UPDATE jobs
            SET status=?2,
                reason_code=?3,
                error=?4,
                attempt_count=attempt_count + CASE WHEN ?2='failed' THEN 1 ELSE 0 END,
                finished_at=?5,
                dest_path=?6,
                output_path=?7,
                updated_at=?8
            WHERE input_path=?1
            "#,
        )?;

        for o in batch.iter() {
            stmt.execute(params![
                o.job.input_path.to_string_lossy().to_string(),
                o.status.as_db(),
                o.reason_code.clone(),
                o.error.clone(),
                now_unix(),
                o.dest_path.as_ref().map(|p| p.to_string_lossy().to_string()),
                o.output_path.as_ref().map(|p| p.to_string_lossy().to_string()),
                now_unix(),
            ])?;
        }
    }
    tx.commit()?;
    batch.clear();
    Ok(())
}

// --- Worker pipeline ---

fn worker_loop(
    worker_id: usize,
    rx: Receiver<Job>,
    tx: Sender<Outcome>,
    input_dir: &Path,
    output_dir: &Path,
    base_lrc_dir: Option<&Path>,
    buckets: &Buckets,
    common: &CommonExtractArgs,
    no_move: bool,
    no_output: bool,
) {
    while let Ok(job) = rx.recv() {
        let t0 = Instant::now();
        let mut outcome = Outcome {
            job: job.clone(),
            status: FinalStatus::Failed,
            reason_code: None,
            error: None,
            dest_path: None,
            output_path: None,
            duration_ms: 0,
        };

        let res = (|| -> Result<()> {
            // Determine optional base LRC file for enhancement in batch mode.
            let base_lrc = base_lrc_dir.and_then(|dir| {
                // match by relative path, but change extension to .lrc
                let p = dir.join(&job.rel_path).with_extension("lrc");
                if p.exists() { Some(p) } else { None }
            });

            match process_one_musicxml(&job.input_path, common, base_lrc.as_deref()) {
                Ok(processed) => {
                    if no_output {
                        // skip writing
                    } else {
                        let out_path = output_dir.join(&job.rel_path).with_extension("lrc");
                        fs::create_dir_all(out_path.parent().unwrap_or(output_dir)).ok();
                        write_lrc_atomic(&out_path, &processed.lines)?;
                        outcome.output_path = Some(out_path);
                    }

                    // Classification: if base extraction succeeded but had no lyrics, we'd have bailed earlier.
                    outcome.status = FinalStatus::Done;
                    outcome.reason_code = Some(if base_lrc.is_some() { "ENHANCED".into() } else { "EXTRACTED".into() });
                    Ok(())
                }
                Err(e) => {
                    let msg = format!("{:#}", e);
                    // Distinguish no-lyrics vs unprocessable vs general failed.
                    if msg.contains("No lyrics found") {
                        outcome.status = FinalStatus::NoLyrics;
                        outcome.reason_code = Some("NO_LYRICS".into());
                        outcome.error = Some(msg);
                        Ok(())
                    } else if msg.contains("Failed parsing MusicXML as XML") || msg.contains("Failed parsing") || msg.contains("Part") {
                        outcome.status = FinalStatus::Unprocessable;
                        outcome.reason_code = Some("UNPROCESSABLE".into());
                        outcome.error = Some(msg);
                        Ok(())
                    } else {
                        outcome.status = FinalStatus::Failed;
                        outcome.reason_code = Some("FAILED".into());
                        outcome.error = Some(msg);
                        Ok(())
                    }
                }
            }
        })();

        // Move input into bucket folder (filesystem truth first)
        if !no_move {
            if let Some(bucket_root) = buckets.for_status(&outcome.status) {
                let dest = bucket_root.join(&job.rel_path);
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).ok();
                }
                // Atomic rename if possible; if it fails, keep original and record failure.
                if let Err(e) = atomic_move(&job.input_path, &dest) {
                    outcome.status = FinalStatus::Failed;
                    outcome.reason_code = Some("MOVE_FAILED".into());
                    outcome.error = Some(format!("Move failed: {e:#}"));
                } else {
                    outcome.dest_path = Some(dest);
                }
            }
        }

        outcome.duration_ms = t0.elapsed().as_millis() as u64;

        let _ = tx.send(outcome);

        if worker_id == 0 {
            // cheap progress pulse (avoid per-file spam)
            // eprintln!(".");
        }
    }
}

// --- Per-file processing (parity) ---

struct Processed {
    lines: Vec<String>,
}

fn process_one_musicxml(input: &Path, common: &CommonExtractArgs, base_lrc: Option<&Path>) -> Result<Processed> {
    let xml = fs::read_to_string(input)
        .with_context(|| format!("Failed reading input MusicXML: {}", input.display()))?;
    let doc = Document::parse(&xml).context("Failed parsing MusicXML as XML")?;

    let part = find_part(&doc, &common.part)
        .ok_or_else(|| anyhow!("Part {} not found", common.part))?;

    let (lyric_events, tempo_events) = collect_events(part)?;

    let mut lyric_events = sort_lyric_events(lyric_events);
    if !common.no_dedupe {
        lyric_events = dedupe_lyric_events(lyric_events);
    }

    let mut tempo_events = tempo_events;
    tempo_events.sort_by(|a, b| cmp_pos(&a.pos, &b.pos));
    tempo_events = ensure_tempo_zero(tempo_events);

    if let Some(base_lrc_path) = base_lrc {
        let word_timings = build_word_timings(&lyric_events);
        let lrc_lines = read_lrc_lines(base_lrc_path)?;
        let metadata_tags = extract_metadata(&doc);

        let enhanced_lines = merge_enhanced_lrc(
            &lrc_lines,
            &word_timings,
            &tempo_events,
            common.force,
            common.length_tolerance,
            &metadata_tags,
        )?;
        Ok(Processed { lines: enhanced_lines })
    } else {
        let lines = positions_to_lrc_lines(&lyric_events, &tempo_events)?;
        Ok(Processed { lines })
    }
}

fn find_part<'a>(doc: &'a Document, part_id: &str) -> Option<Node<'a, 'a>> {
    doc.descendants().find(|n| {
        n.is_element()
            && n.tag_name().name() == "part"
            && n.attribute("id") == Some(part_id)
    })
}

fn parse_tempo_from_direction(direction: Node) -> Option<f64> {
    // <direction><sound tempo="..."/></direction>
    if let Some(sound) = direction
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "sound")
    {
        if let Some(attr) = sound.attribute("tempo") {
            if let Ok(v) = attr.trim().parse::<f64>() {
                return Some(v);
            }
        }
    }

    // <direction> ... <per-minute>120</per-minute> ...
    for n in direction.descendants() {
        if n.is_element() && n.tag_name().name() == "per-minute" {
            if let Some(text) = n.text() {
                if let Ok(v) = text.trim().parse::<f64>() {
                    return Some(v);
                }
            }
        }
    }
    None
}

fn collect_events(part: Node) -> Result<(Vec<LyricEvent>, Vec<TempoEvent>)> {
    let mut divisions: i64 = 1;
    let mut global_pos: Pos = Pos::new(0, 1);
    let mut lyric_events: Vec<LyricEvent> = Vec::new();
    let mut tempo_events: Vec<TempoEvent> = Vec::new();

    for measure in part
        .children()
        .filter(|n| n.is_element() && n.tag_name().name() == "measure")
    {
        let mut current_pos: Pos = Pos::new(0, 1);
        let mut max_pos: Pos = Pos::new(0, 1);

        for child in measure.children().filter(|n| n.is_element()) {
            let tag = child.tag_name().name();
            match tag {
                "attributes" => {
                    if let Some(div_node) = child
                        .children()
                        .find(|n| n.is_element() && n.tag_name().name() == "divisions")
                    {
                        if let Some(text) = div_node.text() {
                            if let Ok(v) = text.trim().parse::<i64>() {
                                divisions = v.max(1);
                            }
                        }
                    }
                }
                "direction" => {
                    if let Some(bpm) = parse_tempo_from_direction(child) {
                        let mut offset: Pos = Pos::new(0, 1);
                        if let Some(offset_node) = child
                            .children()
                            .find(|n| n.is_element() && n.tag_name().name() == "offset")
                        {
                            if let Some(text) = offset_node.text() {
                                if let Ok(v) = text.trim().parse::<i64>() {
                                    offset = Pos::new(v, divisions);
                                }
                            }
                        }
                        tempo_events.push(TempoEvent {
                            pos: global_pos + current_pos + offset,
                            bpm,
                        });
                    }
                }
                "sound" => {
                    // <sound tempo="..."/>
                    if let Some(attr) = child.attribute("tempo") {
                        if let Ok(bpm) = attr.trim().parse::<f64>() {
                            tempo_events.push(TempoEvent {
                                pos: global_pos + current_pos,
                                bpm,
                            });
                        }
                    }
                }
                "note" => {
                    // duration is required for time accounting
                    let duration_node = child
                        .children()
                        .find(|n| n.is_element() && n.tag_name().name() == "duration");
                    let duration_node = match duration_node {
                        Some(n) => n,
                        None => continue,
                    };
                    let duration_text = match duration_node.text() {
                        Some(t) => t,
                        None => continue,
                    };
                    let duration_int: i64 = match duration_text.trim().parse() {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let duration: Pos = Pos::new(duration_int, divisions);

                    let is_chord = child
                        .children()
                        .any(|n| n.is_element() && n.tag_name().name() == "chord");

                    // lyrics
                    for lyric in child
                        .children()
                        .filter(|n| n.is_element() && n.tag_name().name() == "lyric")
                    {
                        if let Some(text_node) = lyric
                            .children()
                            .find(|n| n.is_element() && n.tag_name().name() == "text")
                        {
                            if let Some(text) = text_node.text() {
                                let cleaned = text.trim();
                                if !cleaned.is_empty() {
                                    let idx = lyric_events.len();
                                    lyric_events.push(LyricEvent {
                                        pos: global_pos + current_pos,
                                        text: cleaned.to_string(),
                                        idx,
                                    });
                                }
                            }
                        }
                    }

                    // advance time unless it's a chord tone
                    if !is_chord {
                        current_pos += duration;
                        if cmp_pos(&current_pos, &max_pos) == Ordering::Greater {
                            max_pos = current_pos;
                        }
                    }
                }
                "backup" | "forward" => {
                    let duration_node = child
                        .children()
                        .find(|n| n.is_element() && n.tag_name().name() == "duration");
                    let duration_node = match duration_node {
                        Some(n) => n,
                        None => continue,
                    };
                    let duration_text = match duration_node.text() {
                        Some(t) => t,
                        None => continue,
                    };
                    let duration_int: i64 = match duration_text.trim().parse() {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let duration: Pos = Pos::new(duration_int, divisions);

                    if tag == "backup" {
                        current_pos -= duration;
                    } else {
                        current_pos += duration;
                        if cmp_pos(&current_pos, &max_pos) == Ordering::Greater {
                            max_pos = current_pos;
                        }
                    }
                }
                _ => {}
            }
        }

        if !max_pos.is_zero() {
            global_pos += max_pos;
        }
    }

    if lyric_events.is_empty() {
        bail!("No lyrics found in target part");
    }

    Ok((lyric_events, tempo_events))
}

fn sort_lyric_events(mut ev: Vec<LyricEvent>) -> Vec<LyricEvent> {
    ev.sort_by(|a, b| {
        let c = cmp_pos(&a.pos, &b.pos);
        if c != Ordering::Equal {
            return c;
        }
        a.idx.cmp(&b.idx)
    });
    ev
}

fn dedupe_lyric_events(sorted: Vec<LyricEvent>) -> Vec<LyricEvent> {
    let mut out: Vec<LyricEvent> = Vec::with_capacity(sorted.len());
    let mut last_key: Option<(Pos, String)> = None;

    for e in sorted {
        let key = (e.pos, e.text.clone());
        if let Some((lp, lt)) = &last_key {
            if *lp == key.0 && *lt == key.1 {
                continue;
            }
        }
        last_key = Some(key);
        out.push(e);
    }
    out
}

fn ensure_tempo_zero(mut tempo: Vec<TempoEvent>) -> Vec<TempoEvent> {
    if let Some(first) = tempo.first().cloned() {
        if first.pos > Pos::new(0, 1) {
            tempo.insert(
                0,
                TempoEvent {
                    pos: Pos::new(0, 1),
                    bpm: first.bpm,
                },
            );
        }
    } else {
        tempo.push(TempoEvent {
            pos: Pos::new(0, 1),
            bpm: 120.0,
        });
    }
    tempo
}

fn positions_to_lrc_lines(lyrics: &[LyricEvent], tempo: &[TempoEvent]) -> Result<Vec<String>> {
    if tempo.is_empty() {
        bail!("tempo must be non-empty");
    }

    let mut tempo_idx: usize = 0;
    let mut current_pos: Pos = Pos::new(0, 1);
    let mut current_time: f64 = 0.0;
    let mut current_tempo: f64 = tempo[0].bpm;

    let mut lines: Vec<String> = Vec::with_capacity(lyrics.len());

    for e in lyrics {
        while tempo_idx + 1 < tempo.len() && tempo[tempo_idx + 1].pos <= e.pos {
            let next = &tempo[tempo_idx + 1];
            let delta = next.pos - current_pos;
            current_time += pos_to_f64(delta) * 60.0 / current_tempo;
            current_pos = next.pos;
            tempo_idx += 1;
            current_tempo = next.bpm;
        }

        let delta = e.pos - current_pos;
        if !delta.is_zero() {
            current_time += pos_to_f64(delta) * 60.0 / current_tempo;
            current_pos = e.pos;
        }

        let tag = format_lrc_time_tag(current_time);
        lines.push(format!("{} {}", tag, e.text));
    }

    Ok(lines)
}

fn build_word_timings(lyrics: &[LyricEvent]) -> Vec<(Pos, String)> {
    // Join hyphenated syllables; assign start time of the first syllable.
    let mut out: Vec<(Pos, String)> = Vec::new();
    let mut buf_text = String::new();
    let mut buf_time: Option<Pos> = None;

    for e in lyrics {
        if buf_time.is_none() {
            buf_time = Some(e.pos);
        }
        let cleaned = e.text.trim();
        if let Some(stripped) = cleaned.strip_suffix('-') {
            buf_text.push_str(stripped);
            continue;
        }
        buf_text.push_str(cleaned);
        if let Some(t) = buf_time.take() {
            out.push((t, buf_text.clone()));
        }
        buf_text.clear();
    }

    if let (Some(t), false) = (buf_time.take(), buf_text.is_empty()) {
        out.push((t, buf_text));
    }

    out
}

fn read_lrc_lines(path: &Path) -> Result<Vec<LrcLine>> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("Failed reading base LRC: {}", path.display()))?;
    let mut out: Vec<LrcLine> = Vec::new();
    for raw_line in raw.lines() {
        let line = raw_line.trim_end_matches('\n');
        if line.is_empty() {
            out.push(LrcLine { tag: "".into(), text: "".into() });
            continue;
        }
        if !line.starts_with('[') || !line.contains(']') {
            out.push(LrcLine { tag: "".into(), text: line.to_string() });
            continue;
        }
        let tag_end = line.find(']').unwrap();
        let tag = &line[..=tag_end];
        let text = line[tag_end + 1..].trim_start().to_string();
        out.push(LrcLine { tag: tag.to_string(), text });
    }
    Ok(out)
}

fn parse_time_tag(tag: &str) -> Option<f64> {
    // Strict: [mm:ss.cc]
    if tag.len() != 10 {
        return None;
    }
    let bytes = tag.as_bytes();
    if bytes[0] != b'[' || bytes[3] != b':' || bytes[6] != b'.' || bytes[9] != b']' {
        return None;
    }
    let mm = tag.get(1..3)?.parse::<u32>().ok()?;
    let ss = tag.get(4..6)?.parse::<u32>().ok()?;
    let cc = tag.get(7..9)?.parse::<u32>().ok()?;
    Some(mm as f64 * 60.0 + ss as f64 + cc as f64 / 100.0)
}

fn last_lrc_time(lines: &[LrcLine]) -> Option<f64> {
    let mut last: Option<f64> = None;
    for l in lines {
        if l.tag.is_empty() { continue; }
        if let Some(t) = parse_time_tag(&l.tag) {
            last = Some(t);
        }
    }
    last
}

fn format_timecode(seconds: f64) -> String {
    let total_centis = (seconds * 100.0).round() as i64;
    let minutes = total_centis / 6000;
    let secs = (total_centis / 100) % 60;
    let centis = total_centis % 100;
    format!("{:02}:{:02}.{:02}", minutes, secs, centis)
}

fn format_lrc_time_tag(seconds: f64) -> String {
    format!("[{}]", format_timecode(seconds))
}

fn normalize_token(token: &str, re_leading: &Regex, re_trailing: &Regex) -> String {
    let mut s = re_leading.replace_all(token, "").to_string();
    s = re_trailing.replace_all(&s, "").to_string();
    s = s.trim().to_string();
    s.to_lowercase()
}

fn extract_metadata(doc: &Document) -> Vec<String> {
    // Ordered emission: ti, ar, by, al (matches python insertion order)
    let mut tags: Vec<(String, String)> = Vec::new();

    let work_title = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "work-title")
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let movement_title = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "movement-title")
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if let Some(ti) = work_title.or(movement_title) {
        tags.push(("ti".into(), ti));
    }

    // creators
    let creators: Vec<(Option<String>, String)> = doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "creator")
        .filter_map(|n| {
            let text = n.text()?.trim().to_string();
            if text.is_empty() { return None; }
            let ty = n.attribute("type").map(|s| s.to_string());
            Some((ty, text))
        })
        .collect();

    if !creators.is_empty() {
        let mut ar_value: Option<String> = None;
        for (ty, text) in &creators {
            if ty.as_deref() == Some("composer") {
                ar_value = Some(text.clone());
                break;
            }
        }
        if ar_value.is_none() {
            let joined = creators.iter().map(|(_, t)| t.clone()).collect::<Vec<_>>().join(", ");
            if !joined.is_empty() { ar_value = Some(joined); }
        }
        if let Some(ar) = ar_value {
            tags.push(("ar".into(), ar));
        }
    }

    let by = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "software")
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(v) = by {
        tags.push(("by".into(), v));
    }

    let al = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "source")
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(v) = al {
        tags.push(("al".into(), v));
    }

    tags.into_iter()
        .filter(|(_, v)| !v.is_empty())
        .map(|(k, v)| format!("[{}:{}]", k, v))
        .collect()
}

fn merge_enhanced_lrc(
    lrc_lines: &[LrcLine],
    word_timings: &[(Pos, String)],
    tempo_events: &[TempoEvent],
    force: bool,
    length_tolerance: f64,
    metadata_tags: &[String],
) -> Result<Vec<String>> {
    // Convert word positions to absolute times once for efficient consumption.
    let mut tempo_events = tempo_events.to_vec();
    tempo_events.sort_by(|a, b| cmp_pos(&a.pos, &b.pos));
    tempo_events = ensure_tempo_zero(tempo_events);

    let word_times: Vec<(String, String)> = positions_to_times(word_timings, &tempo_events)?
        .into_iter()
        .map(|(sec, w)| (format_timecode(sec), w))
        .collect();

    let lrc_length = last_lrc_time(lrc_lines);
    if let (Some(lrc_len), Some(last)) = (lrc_length, word_times.last()) {
        let last_word_seconds = parse_time_tag(&format!("[{}]", last.0));
        if let Some(last_word_seconds) = last_word_seconds {
            let delta = last_word_seconds - lrc_len;
            if delta > length_tolerance && !force {
                bail!(
                    "Song length mismatch between MusicXML and LRC. LRC end: {:.2}s, MusicXML end: {:.2}s. Use --force to override or --length-tolerance to adjust.",
                    lrc_len,
                    last_word_seconds
                );
            }
        }
    }

    // Existing metadata-like tags already present in base LRC (non-time tags with empty text).
    let mut existing_tags: HashSet<String> = HashSet::new();
    for l in lrc_lines {
        if !l.tag.is_empty() && l.text.is_empty() && parse_time_tag(&l.tag).is_none() {
            existing_tags.insert(l.tag.clone());
        }
    }

    let mut output: Vec<String> = Vec::new();
    for tag in metadata_tags {
        if !existing_tags.contains(tag) {
            output.push(tag.clone());
        }
    }

    let re_leading = Regex::new(r#"^["'“”‘’\(\)\[\]{}<>]+"#).unwrap();
    let re_trailing = Regex::new(r#"["'“”‘’\(\)\[\]{}<>:;,\.\?!]+$"#).unwrap();

    // Apply word times sequentially across all lyric lines.
    let mut word_index: usize = 0;
    for line in lrc_lines {
        if line.text.is_empty() {
            output.push(line.tag.clone());
            continue;
        }

        let mut enhanced_tokens: Vec<String> = Vec::new();
        for token in line.text.split(' ') {
            if token.is_empty() { continue; }
            let normalized = normalize_token(token, &re_leading, &re_trailing);
            if normalized.is_empty() {
                enhanced_tokens.push(token.to_string());
                continue;
            }
            if word_index >= word_times.len() {
                enhanced_tokens.push(token.to_string());
                continue;
            }
            let (timecode, _word_text) = &word_times[word_index];
            word_index += 1;
            enhanced_tokens.push(format!("<{}>{}", timecode, token));
        }

        let enhanced_text = enhanced_tokens.join(" ");
        let merged = format!("{} {}", line.tag, enhanced_text).trim_end().to_string();
        output.push(merged);
    }

    Ok(output)
}

fn positions_to_times(positions: &[(Pos, String)], tempo_events: &[TempoEvent]) -> Result<Vec<(f64, String)>> {
    if tempo_events.is_empty() { bail!("tempo_events must be non-empty"); }

    let mut out: Vec<(f64, String)> = Vec::with_capacity(positions.len());
    let mut current_pos: Pos = Pos::new(0, 1);
    let mut current_time: f64 = 0.0;
    let mut tempo_idx: usize = 0;
    let mut current_tempo: f64 = tempo_events[0].bpm;

    for (pos, text) in positions {
        while tempo_idx + 1 < tempo_events.len() && tempo_events[tempo_idx + 1].pos <= *pos {
            let next = &tempo_events[tempo_idx + 1];
            let delta = next.pos - current_pos;
            current_time += pos_to_f64(delta) * 60.0 / current_tempo;
            current_pos = next.pos;
            tempo_idx += 1;
            current_tempo = next.bpm;
        }
        let delta = *pos - current_pos;
        if !delta.is_zero() {
            current_time += pos_to_f64(delta) * 60.0 / current_tempo;
            current_pos = *pos;
        }
        out.push((current_time, text.clone()));
    }

    Ok(out)
}

fn pos_to_f64(p: Pos) -> f64 {
    p.to_f64().unwrap_or(0.0)
}

fn cmp_pos(a: &Pos, b: &Pos) -> Ordering {
    a.cmp(b)
}

// --- IO helpers ---

fn write_lrc_atomic(path: &Path, lines: &[String]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let tmp = path.with_extension("lrc.tmp");
    {
        let f = fs::File::create(&tmp).with_context(|| format!("Create {}", tmp.display()))?;
        let mut w = BufWriter::with_capacity(256 * 1024, f);
        for (i, line) in lines.iter().enumerate() {
            if i > 0 {
                w.write_all(b"\n")?;
            }
            w.write_all(line.as_bytes())?;
        }
        w.write_all(b"\n")?;
        w.flush()?;
    }
    fs::rename(&tmp, path).with_context(|| format!("Rename {} -> {}", tmp.display(), path.display()))?;
    Ok(())
}

fn atomic_move(src: &Path, dst: &Path) -> Result<()> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).ok();
    }
    match fs::rename(src, dst) {
        Ok(_) => Ok(()),
        Err(e) => {
            // Try copy+remove as fallback (cross-device). More expensive, but better than losing the file.
            fs::copy(src, dst).with_context(|| format!("Copy {} -> {} after rename error: {}", src.display(), dst.display(), e))?;
            fs::remove_file(src).with_context(|| format!("Remove {} after copy", src.display()))?;
            Ok(())
        }
    }
}
