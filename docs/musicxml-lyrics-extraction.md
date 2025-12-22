# Design Doc: Offline MusicXML → Enhanced LRC CLI (Rust, Local SSD, SQLite Tracking)

This document covers the **offline ingestion tool**:
- Scan a folder containing large numbers of MusicXML files (hundreds of thousands)
- Process them in parallel
- Classify inputs early (unprocessable, no-lyrics, success, failed)
- Move files into bucket folders accordingly
- Produce enhanced LRC outputs for later ingest (or store alongside)
- Track outcomes in a durable local DB (SQLite), restartable and crash-safe

---

## 0) Goals and constraints
- Max throughput on a single local machine with fast SSD
- Safe restarts (no “lost” work on crash)
- Idempotent: rerun should skip completed items
- Clear accounting: which files succeeded/failed and why
- Efficient: minimal extra syscalls, minimal DB contention

---

## 1) Folder layout (bucketization)
Keep everything on the **same filesystem** to enable atomic `rename()` moves:

```
root/
  input/
  out_success/
  out_no_lyrics/
  out_unprocessable/
  out_failed/
  lrc/                 (optional separate output tree)
  logs/
  state.sqlite
```

---

## 2) Status model (SQLite)
Suggested statuses:
- `pending`
- `validating`
- `unprocessable`   (won’t retry)
- `no_lyrics`       (valid but unusable)
- `processing`
- `done`
- `failed`          (retryable)

Store:
- `dest_path`
- `output_path`
- `reason_code` (e.g. `NO_LYRICS`, `PARSE_ERROR`, `VALIDATION_FAIL`)
- `error` (truncated)
- `attempt_count`
- timing fields

---

## 3) SQLite schema
```sql
CREATE TABLE IF NOT EXISTS jobs (
  input_path   TEXT PRIMARY KEY,
  input_mtime  INTEGER NOT NULL,
  input_size   INTEGER NOT NULL,
  status       TEXT NOT NULL,          -- see status model
  reason_code  TEXT,
  error        TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  started_at   INTEGER,
  finished_at  INTEGER,
  dest_path    TEXT,
  output_path  TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
```

### SQLite pragmas (speed + reliability)
```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA busy_timeout=5000;
```

---

## 4) Concurrency architecture (recommended)
Use a **pipeline with bounded channels**:

1. **Scanner thread**: Walks `input/` and emits jobs.
2. **Worker pool**: Validates + classifies + converts + writes outputs + moves files.
3. **DB writer thread**: Single writer, batched updates.

Key rule:
- Workers never write to SQLite. Writer batches results into transactions.

---

## 5) Validation and classification (early exit)
Workers perform initial validation and classification:

### A) Unprocessable
Examples:
- invalid XML
- unsupported MusicXML variant
- required structures missing

Action:
- status: `unprocessable`
- move to: `out_unprocessable/`

### B) No lyrics
Valid MusicXML but contains no lyrics usable for LRC generation.

Action:
- status: `no_lyrics`
- move to: `out_no_lyrics/`

### C) Processable with lyrics
Proceed to conversion.

---

## 6) Processing and outputs
For successful processing:

1. Convert MusicXML → enhanced LRC (word-level timings)
2. Write output **atomically**:
   - write `*.tmp` in final output directory
   - flush + close
   - `rename(tmp, final)` (atomic)
3. Move input file to `out_success/`
4. Record status `done` with `dest_path` and `output_path`

For failures during conversion:
- status: `failed`
- move to `out_failed/` (or keep in place if using attempt-based retry policy)

---

## 7) Atomic moves and collision avoidance
### Preserve directory structure
Avoid filename collisions by mirroring relative paths:
- `input/a/b/c.xml` → `out_success/a/b/c.xml`

Create parent dirs before rename.

### Atomic move
Prefer `std::fs::rename(src, dst)` (atomic on same filesystem).

If `dst` exists:
- treat as already processed if metadata matches
- else create a `-dupN` suffix

---

## 8) Crash safety and restart behavior
### Ordering (filesystem truth first)
For a job:
1. write output (tmp → rename)
2. move input file to bucket folder
3. emit outcome → DB writer updates status

### Startup recovery
On startup:
- set stale `validating`/`processing` jobs back to `pending`
- optionally reconcile file locations (if file moved but DB not updated)

---

## 9) Skip logic (already processed)
Default: skip based on `(mtime, size)`:
- if DB says `done` and metadata matches → skip

Hashing inputs is optional and typically unnecessary at this scale.

---

## 10) Performance optimizations
- bounded queues to prevent memory blowup
- worker count: start with physical cores, then measure
- streaming XML parsing (e.g. `quick-xml`), avoid full DOM
- reuse buffers, pre-allocate vectors
- large `BufWriter` buffer (64KB–256KB)
- no per-file stdout logging; periodic progress only
- SQLite single writer + batch commits (200–2000 per txn)
- keep all folders on same filesystem to ensure atomic renames

---

## 11) Deliverables
- Rust CLI:
  - scan + pipeline processing
  - validation and classification
  - atomic output write
  - bucket moves
  - SQLite tracking with WAL tuning
  - restart recovery
- Output enhanced LRC files ready for later ingestion
---

## MusicXML → LRC extraction and LRC enhancing details (from reference Python implementation)

This CLI’s MusicXML lyric extraction and optional LRC *enhancing* behavior should match the reference algorithm:

### MusicXML parsing model

- Read lyrics from `<note><lyric><text>...</text></lyric></note>` elements. fileciteturn2file0L78-L83
- Compute musical positions using:
  - `<attributes><divisions>` for duration scaling (duration/divisions). fileciteturn2file0L44-L47
  - `<backup>` and `<forward>` to move the measure cursor. fileciteturn2file0L88-L101
  - Do **not** advance time for chord notes (`<chord>` present). fileciteturn2file0L77-L85
- Build a continuous timeline by accumulating each measure’s `max_pos` into `global_pos`. fileciteturn2file0L100-L103

### Tempo map

Capture tempo events at musical positions:
- From `<direction>` via `<sound tempo="...">` or embedded `<per-minute>`. fileciteturn2file0L13-L28
- From top-level `<sound tempo="...">` elements inside measures. fileciteturn2file0L61-L68
- Support `<direction><offset>` (scaled by divisions). fileciteturn2file0L51-L60
- If no tempo exists, default to **120 BPM**, and ensure an event at position 0. fileciteturn2file0L130-L136

### Converting musical positions → wall-clock time

- Sort lyric events by `(position, original_index)` to preserve stable order for same-position events. fileciteturn2file0L138-L139
- Walk tempo segments and accumulate seconds:
  - `seconds += float(delta_beats) * 60 / bpm`. fileciteturn2file0L158-L169
- Output LRC timestamps in **centiseconds**: `[mm:ss.cc]`. fileciteturn2file0L171-L177

### Optional de-duplication

Some exports duplicate lyric events at identical timestamps; default behavior is to remove *consecutive* identical `(position, text)` entries after sorting. fileciteturn2file0L138-L149  
A CLI flag should allow keeping duplicates (`--no-dedupe`). fileciteturn2file0L422-L426

### Enhanced LRC “word timings” construction

- Convert per-lyric tokens into word timings by joining hyphenated syllables:
  - `glit-` + `ters` → `glitters`
  - The time assigned to the joined word is the start time of the first syllable. fileciteturn2file0L181-L203

### Enhancing an existing base LRC file

When `--lrc <base.lrc>` is provided, enhance each LRC line by prefixing words with `<mm:ss.cc>` tags:

- Parse LRC lines as `(tag, text)`. Lines without a leading time tag are preserved with empty `tag`. fileciteturn2file0L206-L218
- Normalize tokens (strip common leading/trailing punctuation and lowercase) to decide whether a token “counts” as a word; tokens that normalize to empty should not consume word timings. fileciteturn2file0L229-L233
- Apply word timing tags sequentially to tokens that normalize non-empty; if timings run out, leave remaining tokens untagged. fileciteturn2file0L381-L401

#### Length mismatch guardrail

Compare the last timestamp in the base LRC to the last generated word time:
- If `MusicXML_end - LRC_end > --length-tolerance` (default 5.0s), error unless `--force` is used. fileciteturn2file0L349-L360

### Metadata tag extraction

Emit MusicXML-derived metadata tags before lyric lines, but only if they do not already exist in the base LRC:
- `ti`: `work/work-title` else `movement-title`
- `ar`: comma-separated creators, but prefer `creator[@type="composer"]` if present
- `by`: `identification/encoding/software`
- `al`: `identification/source` fileciteturn2file0L274-L305

### CLI flags (parity)

Rust CLI should support:
- `--part` (default `P1`) fileciteturn2file0L417-L421
- `--no-dedupe` fileciteturn2file0L422-L426
- `--lrc <path>` (base LRC to enhance) fileciteturn2file0L427-L431
- `--force` fileciteturn2file0L432-L436
- `--length-tolerance <seconds>` default 5.0 fileciteturn2file0L437-L442
- `--output <path>` default `<input>.lrc` fileciteturn2file0L445-L448
---

## Batch processing mode (parallel, restartable, bucket moves)

The Rust CLI now supports **two modes**:

### `single` subcommand
Processes one MusicXML file, optionally enhancing a provided base LRC.

Example:
```bash
musicxml-lrc single ./song.musicxml --part P1 --output ./song.lrc
musicxml-lrc single ./song.musicxml --lrc ./base.lrc --output ./enhanced.lrc
```

### `batch` subcommand
Scans an input directory tree, processes many files in parallel, and tracks results in SQLite.

Example:
```bash
musicxml-lrc batch --root ./root --workers 12
```

#### Expected folder layout (under `--root`)
```
root/
  input/
  out_success/
  out_no_lyrics/
  out_unprocessable/
  out_failed/
  lrc/
  state.sqlite
```

#### Enhancing from an existing base-LRC directory
If you have base LRC files already, provide `--base-lrc-dir` and the tool will look for a `.lrc`
with the same relative path as the input (but `.lrc` extension) and enhance it.

Example:
```bash
musicxml-lrc batch --root ./root --base-lrc-dir ./base_lrc
```

#### Concurrency design
- Scanner thread enumerates files under `input/`
- Worker pool processes files in parallel
- A single DB writer thread batches SQLite updates (WAL mode)

This avoids SQLite write contention and keeps throughput stable at scale.

#### Output and moves
For each file:
1. Generate output LRC (atomic tmp-write + rename) into `lrc/<relative>.lrc`
2. Move input into the appropriate bucket folder (`out_success/`, `out_no_lyrics/`, etc.)
3. Update SQLite status and paths

#### Skip logic
The batch tool skips inputs already marked `done` with matching `(mtime, size)` in the DB.

#### Rust implementation file
Reference implementation (single-file CLI with subcommands + batch pipeline):
- `musicxml_lrc_cli.rs`
