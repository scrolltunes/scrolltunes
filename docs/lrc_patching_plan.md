# Design Doc: LRC Word-Level Enhancing in Web App (Vercel + Next.js + Neon + Redis)

This document covers the **web runtime** system:
- Store base LRC normally (line-level timestamps)
- Store only **enhancement metadata** (word-level timings) as a compact “patch” in Postgres
- Reconstruct enhanced LRC at load time in the web app

> **Naming policy:** DB stays boring and literal (*patch*). App/API/UI uses *enhancement/enhancing*.

---

## 0) High-level architecture

### Runtime data flow
1. Web app loads **base LRC** (line timestamps + text).
2. Web app requests an **enhancement bundle** identified by:
   - `track_key`, `lrc_hash`, `algo_version`, `tokenizer_version`, `patch_format_version`
3. API checks **Redis** first → if miss, loads from **Neon Postgres** → caches in Redis.
4. Client applies enhancement metadata to base LRC and renders word-level highlight timing.

### Source of truth vs cache
- **Neon (Postgres):** authoritative patch sets + per-line patch payloads (BYTEA)
- **Redis:** read-through cache for bundle payloads
- **Client:** optional IndexedDB caching for hot tracks

---

## 1) Canonical keys, hashing, versions

### 1.1 Track key
Use a stable track identifier:
- `track_key`: internal ID, or deterministic fingerprint key

### 1.2 Base LRC hash
Compute `lrc_hash = sha256(canonical_lrc_string)` where canonicalization:
- normalizes line endings to `\n`
- trims trailing whitespace per line
- preserves timestamps and text

### 1.3 Versioning
Persist versions in the patch set row:
- `algo_version` (alignment/enhancer version)
- `tokenizer_version` (token split rules)
- `patch_format_version` (binary layout, e.g. `pbf-v1`)

Any change that affects tokenization or timing mapping must bump versions.

---

## 2) Patch format (stored data, no full enhanced lyrics stored)

### 2.1 Line identity (for resilience)
Each base LRC line has:
- `line_index` (fast-path)
- `line_key = sha256(normalize(text) + "|" + start_ms)` (fallback)

`normalize(text)`:
- Unicode NFC
- collapse whitespace runs
- trim

### 2.2 Binary payload (recommended)
Store word timings **relative to line start** using varint + delta encoding:

Per line:
- `token_count` (varint)
- repeated entries:
  - `token_index_delta` (varint)
  - `start_delta_from_prev_start_ms` (varint)
  - `dur_ms` (varint)

This is compact and fast to decode.

---

## 3) Database schema (Neon Postgres)

### 3.1 Tables
```sql
CREATE TABLE IF NOT EXISTS lrc_word_patch_sets (
  patch_set_id       BIGSERIAL PRIMARY KEY,
  track_key          TEXT NOT NULL,
  lrc_hash           TEXT NOT NULL,
  algo_version       TEXT NOT NULL,
  tokenizer_version  TEXT NOT NULL,
  patch_format_version TEXT NOT NULL DEFAULT 'pbf-v1',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_key, lrc_hash, algo_version, tokenizer_version, patch_format_version)
);

CREATE INDEX IF NOT EXISTS idx_lrc_patch_sets_track_key
  ON lrc_word_patch_sets(track_key);

CREATE TABLE IF NOT EXISTS lrc_word_patches (
  patch_set_id   BIGINT NOT NULL REFERENCES lrc_word_patch_sets(patch_set_id) ON DELETE CASCADE,
  line_index     INT NOT NULL,
  line_key       TEXT NOT NULL,
  payload        BYTEA NOT NULL,
  PRIMARY KEY (patch_set_id, line_index)
);

CREATE INDEX IF NOT EXISTS idx_lrc_word_patches_line_key
  ON lrc_word_patches(patch_set_id, line_key);
```

---

## 4) Server implementation (Next.js on Vercel)

### 4.1 Runtime
Prefer **Node.js runtime** for:
- Neon DB drivers
- Redis clients
- binary handling

### 4.2 Env vars
- `DATABASE_URL` (Neon)
- `REDIS_URL`
- Optional constants in code:
  - `ALGO_VERSION`
  - `TOKENIZER_VERSION`
  - `PATCH_FORMAT_VERSION`

---

## 5) API design

### 5.1 Endpoint
Implement:
- `GET /api/lrc/enhancement?track_key=...&lrc_hash=...&algo_version=...&tokenizer_version=...`

Response (preferred):
- one base64 **bundle** containing all per-line payloads
- plus metadata:
  - versions, `patch_set_id`, `lrc_hash`

### 5.2 Bundle format (recommended)
Return one blob to reduce JSON overhead:

Bundle:
- header: `patch_format_version`, `line_count`
- per line:
  - `line_index` (varint)
  - `payload_len` (varint)
  - `payload_bytes`

---

## 6) Redis caching (read-through)

Cache key:
```
lrc:enhancement:{track_key}:{lrc_hash}:{algo}:{tok}:{fmt}
```

Behavior:
1. GET from Redis
2. On miss: fetch patch_set + patches from Postgres, build bundle, SET with TTL
3. Return bundle

TTL guidance: 1–24 hours (immutable by hash/version).

---

## 7) Client apply + rendering

### 7.1 Parse base LRC
Parse to:
- `[{ line_index, start_ms, text }]`
Compute `lrc_hash`.

### 7.2 Tokenize lines
Tokenize using `tokenizer_version`, returning:
- token strings
- char offsets for rendering
- token index mapping

### 7.3 Apply enhancement
For each line:
- locate payload by `line_index`
- decode timings
- map to tokens
- compute absolute times:
  - `word_start = line_start + start_rel`
  - `word_end = word_start + dur`

### 7.4 Render
Maintain render model:
- word spans with absolute times
- playback currentTime drives highlight

---

## 8) Optional browser caching (IndexedDB)
For instant replays:
- Store bundle in IndexedDB keyed by:
  `lrc_enhancement_v1:{track_key}:{lrc_hash}:{algo}:{tok}:{fmt}`
- TTL 1–7 days
- cap total size and evict oldest

---

## 9) Security and caching
If patches are permissioned:
- include user scope in cache key OR enforce auth and avoid public CDN caching.

If public:
- you may also add HTTP caching headers on the API response.

---

## 10) JSONB → BYTEA migration (if starting from JSONB)

### 10.1 Strategy
Dual-write + dual-read + backfill:
1. Add `payload_bin BYTEA` + `payload_format` columns
2. Read both (prefer binary), write both temporarily
3. Backfill existing JSONB rows → binary
4. Switch reads to binary-only
5. Stop JSON writes
6. Drop JSONB column later

(Keep the DB names boring while evolving app semantics.)

---

## 11) Naming conventions (boring DB, semantic app)

### Database layer (do NOT rename)
- Tables: `lrc_word_patch_sets`, `lrc_word_patches`
- Concepts: patch, patch set, payload

### App/API/UI layer (semantic)
- Route: `/api/lrc/enhancement`
- Types: `EnhancementSet`, `applyEnhancement(...)`
- UI: “Enhanced lyrics”, “word-level enhancements”

Mapping happens in repository/service layer.
---

## Offline ingest integration (from Rust CLI outputs)

The offline Rust CLI outputs enhanced/extracted `.lrc` files and (optionally) base MusicXML is bucketed.
For web ingestion, recommended flow:

1. Ingest produced `.lrc` files into your existing storage (e.g., object storage or your DB blob store).
2. For word-level enhancing in the web app:
   - Either ingest the **binary patch payloads** directly (preferred), or
   - Keep enhanced `.lrc` only for offline validation and continue storing patches for runtime.

The web runtime continues to treat Postgres as the source of truth for patch sets and Redis as cache.
