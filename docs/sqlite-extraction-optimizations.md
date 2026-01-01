# SQLite Extraction Optimizations

> Lessons learned from the LRCLIB extraction tool (72GB → 580MB in 5 minutes)

## The Problem

Initial extraction ran at **1.5 rows/second** with an ETA of 13 weeks. After optimizations: **114,000 rows/second** — a 75,000x speedup.

## Key Optimizations

### 1. Memory-Mapped I/O (Critical)

```sql
PRAGMA mmap_size = 8589934592;  -- 8GB memory-mapped I/O
```

This was the single biggest improvement. Instead of reading through the filesystem, SQLite maps the database file directly into memory, allowing the OS to handle caching efficiently.

**When to use:** Always for read-heavy operations on large databases.

### 2. Large Page Cache

```sql
PRAGMA cache_size = -1000000;  -- 1GB page cache (negative = KB)
```

Keeps more database pages in memory, reducing disk reads for repeated access patterns.

**When to use:** When you have available RAM and are doing full table scans or index lookups.

### 3. In-Memory Temp Storage

```sql
PRAGMA temp_store = MEMORY;
```

Stores temporary tables and indices in RAM instead of disk.

**When to use:** Always for extraction tools (they don't need crash recovery).

### 4. Query Structure: Subquery vs JOIN

**Slow (nested loop join):**
```sql
SELECT t.* FROM tracks t
JOIN lyrics l ON l.id = t.last_lyrics_id
WHERE l.has_synced_lyrics = 1
```

Query plan: Scans 12.6M lyrics rows, then nested loop join.

**Fast (subquery with covering index):**
```sql
SELECT t.* FROM tracks t
WHERE t.last_lyrics_id IN (
  SELECT id FROM lyrics WHERE has_synced_lyrics = 1
)
```

Query plan: Uses covering index on `has_synced_lyrics`, then index lookup on `last_lyrics_id`.

**Key insight:** The subquery approach lets SQLite use covering indices more effectively.

### 5. Avoid LIMIT/OFFSET Pagination

**Slow:**
```sql
SELECT * FROM tracks ORDER BY id LIMIT 50000 OFFSET 1000000;
```

OFFSET must scan and skip all previous rows — O(n) per batch.

**Fast (cursor-based):**
```sql
SELECT * FROM tracks WHERE id > ?last_id ORDER BY id LIMIT 50000;
```

Uses index directly — O(1) per batch.

**Even faster:** Just read everything in one query if it fits in memory.

### 6. Handle SQLite Type Mismatches

SQLite `FLOAT` columns return as `f64`, not `i64`:

```rust
// Wrong: panics with "Invalid column type Real"
let duration: i64 = row.get(4)?;

// Correct: read as f64, convert
let duration_float: f64 = row.get(4)?;
let duration_sec = duration_float.round() as i64;
```

### 7. Batched Writes with Transactions

```rust
for chunk in tracks.chunks(WRITE_BATCH_SIZE) {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare_cached("INSERT INTO ...")?;
        for item in chunk {
            stmt.execute(params![...])?;
        }
    }
    tx.commit()?;
}
```

- **Batch size:** 10,000 rows per transaction is a good balance
- **prepare_cached:** Reuses prepared statements across batches
- **Transaction per batch:** Limits WAL growth and memory usage

### 8. Output Database Optimizations

```sql
PRAGMA journal_mode = WAL;      -- Write-ahead logging
PRAGMA synchronous = NORMAL;    -- Relaxed durability (OK for extraction)
PRAGMA cache_size = -64000;     -- 64MB cache for writes
PRAGMA temp_store = MEMORY;
```

## Complete PRAGMA Setup

### For Source (Read-Only) Database
```rust
conn.execute_batch(
    "PRAGMA mmap_size = 8589934592;
     PRAGMA cache_size = -1000000;
     PRAGMA temp_store = MEMORY;",
)?;
```

### For Output (Write) Database
```rust
conn.execute_batch(
    "PRAGMA journal_mode = WAL;
     PRAGMA synchronous = NORMAL;
     PRAGMA cache_size = -64000;
     PRAGMA temp_store = MEMORY;",
)?;
```

## Performance Results

| Phase | Rows | Speed | Time |
|-------|------|-------|------|
| Read 12.2M tracks | 10M valid | 114K/s | 1m 47s |
| Group & dedupe | 4.17M groups | 456K/s | 9s |
| Write output | 4.17M rows | 60K/s | 1m 10s |
| Build FTS5 index | — | — | 9s |
| VACUUM + ANALYZE | — | — | 2s |
| **Total** | — | — | **5m 7s** |

## Rust Dependencies

```toml
[dependencies]
rusqlite = { version = "0.31", features = ["bundled"] }
rayon = "1.10"           # Parallel processing
indicatif = "0.17"       # Progress bars
regex = "1.10"           # Pattern matching
once_cell = "1.19"       # Lazy static initialization
anyhow = "1.0"           # Error handling
clap = { version = "4.5", features = ["derive"] }
```

## FTS5 Search Optimization

### Weighted BM25 Ranking

```sql
-- Weight title matches 10x more than artist matches
ORDER BY bm25(tracks_fts, 10.0, 1.0)
```

The `bm25()` function returns negative values (lower = better match). Arguments after the table name are column weights in order of FTS column definition.

### Combined Relevance + Quality Score

```sql
-- Combine text relevance with precomputed quality score
SELECT *
FROM tracks_fts fts
JOIN tracks t ON fts.rowid = t.id
WHERE tracks_fts MATCH 'query terms'
ORDER BY -bm25(tracks_fts, 10.0, 1.0) + t.quality * 0.1 DESC
```

- **`-bm25(...)`** — flip sign so higher = better
- **`+ quality * 0.1`** — add quality as tiebreaker (scaled down)

### FTS5 Schema Design

```sql
CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title,                    -- First column, weight 10.0
    artist,                   -- Second column, weight 1.0
    content='tracks',         -- External content table
    content_rowid='id',       -- Link to tracks.id
    tokenize='porter'         -- Porter stemming for better recall
);
```

**Key decisions:**
- **External content** (`content='tracks'`) — saves space, FTS only stores index
- **Porter tokenizer** — matches "running" when searching "run"
- **Column order** — determines weight argument positions in `bm25()`

## Checklist for Future Extraction Tools

- [ ] Add mmap + cache PRAGMAs before any queries
- [ ] Use subqueries instead of JOINs when possible
- [ ] Avoid OFFSET pagination — use cursor-based or single query
- [ ] Handle FLOAT → i64 conversions explicitly
- [ ] Batch writes in 10K row transactions
- [ ] Use `prepare_cached` for repeated statements
- [ ] Add progress bars for user feedback
- [ ] Use rayon for CPU-bound parallel processing
- [ ] Use weighted `bm25()` for FTS5 search ranking
- [ ] Combine text relevance with quality scores for final ranking
