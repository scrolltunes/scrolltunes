# Spec 07: Instrumentation and Evaluation

> Add counters, structured logs, and audit sampling to measure and validate improvements

## Problem Statement

Current logging only provides aggregate match rate. We cannot:
1. Measure impact of individual changes (ablation)
2. Identify which improvements help which categories
3. Validate precision of new matching strategies
4. Detect regressions when making changes

## Requirements

### R7.1: Per-Phase Counters

Add structured counters for each matching phase:

```rust
#[derive(Default, Debug)]
struct MatchingStats {
    // Phase 1: Main index lookup
    main_exact_matches: usize,
    main_primary_artist_fallback: usize,
    main_no_candidates: usize,
    main_all_rejected: usize,

    // Phase 2: Title-first rescue (Spec 06)
    rescue_attempted: usize,
    rescue_skipped_common_title: usize,
    rescue_matches: usize,
    rescue_rejected_low_similarity: usize,
    rescue_rejected_low_margin: usize,

    // Phase 3: Pop=0 fallback
    pop0_eligible: usize,
    pop0_from_no_candidates: usize,
    pop0_from_rejected: usize,  // NEW: Spec 04
    pop0_matches: usize,

    // Duration relaxation (Spec 05)
    duration_relaxed_matches: usize,
    duration_relaxed_31_45: usize,
    duration_relaxed_46_60: usize,
    duration_relaxed_61_plus: usize,

    // Multi-artist (Spec 03)
    multi_artist_rescues: usize,

    // Final
    total_matches: usize,
    total_failures: usize,
}
```

### R7.2: Structured Logging

Output JSON-formatted stats at end of each phase:

```rust
fn log_phase_stats(phase: &str, stats: &MatchingStats) {
    let json = serde_json::to_string_pretty(stats).unwrap();
    log::info!("[STATS:{}]\n{}", phase, json);
}

// Usage
log_phase_stats("MAIN", &stats);
log_phase_stats("RESCUE", &stats);
log_phase_stats("POP0", &stats);
log_phase_stats("FINAL", &stats);
```

### R7.3: Per-Match Metadata

Store detailed match information for analysis:

```rust
struct MatchMetadata {
    // Identifiers
    lrclib_id: i64,
    spotify_track_id: String,

    // Match quality
    score: i32,
    runner_up_score: Option<i32>,
    margin: i32,

    // Duration
    lrclib_duration_sec: i32,
    spotify_duration_ms: i32,
    duration_diff: i32,

    // Artist
    artist_similarity: f32,
    artist_match_type: String,  // "exact", "primary_fallback", "fuzzy"

    // Match source
    match_phase: String,  // "main", "rescue", "pop0"
    was_duration_relaxed: bool,
    was_multi_artist_rescue: bool,

    // Categorization
    script_type: String,  // "latin", "cyrillic", "hebrew", "cjk"
    title_length: usize,
    artist_length: usize,
}
```

### R7.4: Audit Sample Export

Export stratified sample for manual validation:

```rust
fn export_audit_sample(matches: &[MatchMetadata], output_path: &Path) {
    let mut sample = Vec::new();

    // Stratify by category
    let categories = [
        ("duration_relaxed", |m: &MatchMetadata| m.was_duration_relaxed),
        ("rescue_phase", |m| m.match_phase == "rescue"),
        ("pop0_phase", |m| m.match_phase == "pop0"),
        ("low_margin", |m| m.margin < 20),
        ("cyrillic", |m| m.script_type == "cyrillic"),
        ("hebrew", |m| m.script_type == "hebrew"),
        ("short_title", |m| m.title_length < 5),
        ("long_title", |m| m.title_length > 50),
    ];

    for (name, filter) in categories {
        let filtered: Vec<_> = matches.iter().filter(|m| filter(m)).collect();
        let n = 25.min(filtered.len());  // 25 per category
        sample.extend(filtered.choose_multiple(&mut rand::thread_rng(), n));
    }

    // Export as CSV/JSON for review
    export_sample(&sample, output_path);
}
```

### R7.5: Regression Detection

Compare stats against baseline:

```rust
struct Baseline {
    match_rate: f32,
    main_matches: usize,
    rescue_matches: usize,
    pop0_matches: usize,
}

fn check_regression(current: &MatchingStats, baseline: &Baseline) -> Vec<String> {
    let mut warnings = Vec::new();

    let current_rate = current.total_matches as f32 /
        (current.total_matches + current.total_failures) as f32;

    if current_rate < baseline.match_rate - 0.01 {
        warnings.push(format!(
            "Match rate regression: {:.1}% -> {:.1}%",
            baseline.match_rate * 100.0,
            current_rate * 100.0
        ));
    }

    if current.main_exact_matches < baseline.main_matches * 95 / 100 {
        warnings.push("Main phase matches decreased by >5%".to_string());
    }

    warnings
}
```

## Implementation Notes

### Cargo Dependencies

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
rand = "0.8"
```

### Stats Collection Pattern

```rust
// Global stats (or pass through functions)
static STATS: Lazy<Mutex<MatchingStats>> = Lazy::new(|| Mutex::new(Default::default()));

fn record_match(phase: MatchPhase, metadata: MatchMetadata) {
    let mut stats = STATS.lock().unwrap();
    match phase {
        MatchPhase::Main => {
            stats.main_exact_matches += 1;
            if metadata.artist_match_type == "primary_fallback" {
                stats.main_primary_artist_fallback += 1;
            }
        }
        MatchPhase::Rescue => stats.rescue_matches += 1,
        MatchPhase::Pop0 => stats.pop0_matches += 1,
    }
    stats.total_matches += 1;
}
```

### Output Files

| File | Purpose |
|------|---------|
| `extraction_stats.json` | Full stats breakdown |
| `audit_sample.csv` | Stratified sample for validation |
| `match_metadata.parquet` | Full match details (optional, large) |

### CLI Flag

```bash
./lrclib-extract ... --export-stats /path/to/stats.json --export-audit /path/to/audit.csv
```

## Acceptance Criteria

- [ ] Per-phase counters track all match sources
- [ ] JSON stats output at end of extraction
- [ ] Audit sample exported with stratified categories
- [ ] Match metadata includes all quality signals
- [ ] Regression detection warns on significant drops

## Dependencies

- None (can be implemented independently)
- Should be done early to measure other specs' impact

## Estimated Impact

- **No direct match rate impact**
- Enables measurement of all other improvements
- Prevents regressions during development
- Supports precision validation via audit samples

## Audit Workflow

1. Run extraction with `--export-audit audit.csv`
2. Open audit.csv in spreadsheet
3. For each row, verify:
   - LRCLIB title/artist matches Spotify title/artist
   - Duration difference is acceptable for the match type
4. Calculate precision per category
5. If precision < 95%, investigate and tighten constraints
