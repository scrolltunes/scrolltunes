# Spec: Add Track to Catalog

## Overview

Create endpoint to add a Turso track to the Neon catalog when selected from search results.

## Why

When admin finds a track via search, they should be able to add it to the catalog with one click. This fetches all Turso data and creates the Neon entry.

## API Design

### Endpoint

`POST /api/admin/tracks/[lrclibId]/add-to-catalog`

### Request

No body required. LRCLIB ID from URL path.

### Response

```typescript
interface AddToCatalogResponse {
  success: true
  songId: string           // New Neon song ID
  lrclibId: number
  title: string
  artist: string

  // Copied enrichment
  bpm: number | null
  musicalKey: string | null
  spotifyId: string | null
}
```

### Error Responses

- `404`: Track not found in Turso
- `409`: Track already in catalog (return existing songId)
- `401`: Not authenticated
- `403`: Not admin

## Implementation

### File

`src/app/api/admin/tracks/[lrclibId]/add-to-catalog/route.ts`

### Flow

1. **Validate** - Check admin auth
2. **Check existing** - Look for existing `song_lrclib_ids` entry
3. **Fetch Turso** - Get full track data from Turso
4. **Create song** - Insert into Neon `songs` table
5. **Link ID** - Insert into `song_lrclib_ids`
6. **Copy enrichment** - If Turso has tempo/key, copy to song

### SQL Operations

**Check existing**:
```sql
SELECT song_id FROM song_lrclib_ids WHERE lrclib_id = ?
```

**Create song**:
```sql
INSERT INTO songs (id, title, artist, album, created_at)
VALUES (?, ?, ?, ?, NOW())
RETURNING id
```

**Link LRCLIB ID**:
```sql
INSERT INTO song_lrclib_ids (song_id, lrclib_id, created_at)
VALUES (?, ?, NOW())
```

**Copy enrichment** (if available):
```sql
UPDATE songs SET
  bpm = ?,
  musical_key = ?,
  bpm_source = 'turso'
WHERE id = ?
```

## Dependencies

- `@/services/turso` - TursoService.getById
- `@/lib/db` - Neon client
- `@/lib/db/schema` - songs, song_lrclib_ids tables
- `nanoid` or similar for song ID generation

## Acceptance Criteria

- [ ] Creates new catalog entry from Turso data
- [ ] Returns 409 with existing songId if already in catalog
- [ ] Copies BPM/key from Turso if available
- [ ] Links LRCLIB ID properly
- [ ] Admin auth required
