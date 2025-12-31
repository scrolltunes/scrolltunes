# Search Optimization Plan

> Goal: Near-instant search results (<50ms perceived latency) to beat Google for lyrics lookup

## Current State Analysis

### Current Architecture

```
User Types → 300ms debounce → Parallel:
  ├─ Local: fuzzyMatchSongs(localStorage) → ~5-50 songs, <10ms
  └─ API: /api/search
       ├─ Spotify Search (200-400ms)
       ├─ LRCLIB availability check per track (50-200ms each, 4 parallel)
       └─ Normalize & dedupe
     Total: 600-1500ms
```

### Current Data Sources

| Source | Key | Contents | Size |
|--------|-----|----------|------|
| Recent Songs | `scrolltunes:recents` | Max 5 songs with metadata | ~2KB |
| Lyrics Cache | `scrolltunes:lyrics:{id}` | Full lyrics + BPM + enhancement | ~10KB each |
| Favorites | `scrolltunes:favorites` | Song metadata list | ~5KB |
| Setlists | localStorage via SetlistsStore | Songs in setlists | Variable |

### Identified Bottlenecks

1. **300ms debounce** - Necessary evil, but adds perceived latency
2. **Spotify API** - 200-400ms per search request
3. **LRCLIB availability checks** - 50-200ms per track, even with parallelism
4. **Limited local cache** - Only ~50 songs searchable offline
5. **No query caching** - Same query hits external APIs every time
6. **Cold start** - First search after page load is always slow

## Optimization Strategies

### Strategy 1: Local Song Index (Priority: HIGH)

Create a compact, searchable index of ~2000 songs in localStorage.

#### Index Format

```typescript
interface SongIndexEntry {
  id: number          // lrclibId
  t: string           // title (normalized, lowercase)
  a: string           // artist (normalized, lowercase)
  al?: string         // album (optional, normalized)
  art?: string        // albumArt URL
  dur?: number        // duration in seconds
  pop?: number        // popularity score (0-100)
}

interface SongIndex {
  version: number
  updatedAt: number
  songs: SongIndexEntry[]
}
```

**Size estimation:** 2000 songs × ~100 bytes = ~200KB (gzipped: ~40KB)

#### Index Population Sources

1. **Top songs from catalog** - `/api/songs/top?limit=500` (already exists)
2. **User's history + favorites** - Already tracked
3. **Related artists** - When user plays Artist X, prefetch Artist X's discography
4. **Trending songs** - New endpoint: `/api/songs/trending`

#### Search with Fuse.js

```typescript
import Fuse from 'fuse.js'

const fuse = new Fuse(songIndex.songs, {
  keys: ['t', 'a', 'al'],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
})

// Search completes in <10ms for 2000 entries
const results = fuse.search(query)
```

### Strategy 2: Tiered Search Architecture

```
Tier 1: Local Index (<10ms)
  └─ Fuse.js on localStorage song index
  
Tier 2: Edge Cache (<50ms)
  └─ Vercel KV or Edge Config for popular queries
  
Tier 3: Full Search (200-500ms)
  └─ Spotify + LRCLIB (current implementation)
```

#### Implementation

```typescript
async function tieredSearch(query: string): Promise<SearchResult[]> {
  // Tier 1: Instant local results
  const localResults = searchLocalIndex(query)
  
  if (localResults.length >= 5 && localResults[0].score > 0.85) {
    // High confidence local match - return immediately
    return localResults
  }
  
  // Show local results immediately, fetch more in background
  yield localResults
  
  // Tier 2: Check edge cache
  const cached = await checkEdgeCache(query)
  if (cached) {
    yield mergeResults(localResults, cached)
    return
  }
  
  // Tier 3: Full API search
  const apiResults = await searchAPI(query)
  await cacheToEdge(query, apiResults)
  yield mergeResults(localResults, apiResults)
}
```

### Strategy 3: Proactive Prefetching

#### On App Load

```typescript
// AuthProvider.tsx
useEffect(() => {
  // Current: prefetch top 20 songs
  runPrefetchTopSongs(20)
  
  // NEW: Download song index
  downloadSongIndex()
}, [])

async function downloadSongIndex() {
  const cached = loadSongIndex()
  if (cached && Date.now() - cached.updatedAt < 24 * 60 * 60 * 1000) {
    return // Fresh enough
  }
  
  const response = await fetch('/api/songs/index')
  const index = await response.json()
  saveSongIndex(index)
}
```

#### After Playing a Song

```typescript
// After user plays a song by Artist X
async function prefetchRelatedSongs(artistName: string) {
  const songs = await fetch(`/api/songs/by-artist?artist=${artistName}`)
  addToLocalIndex(songs)
}
```

### Strategy 4: Reduce Debounce with Smart Prefetch

```typescript
// Start prefetching on 2 characters, but only show after 3
function useSmartSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const prefetchCache = useRef(new Map<string, SearchResult[]>())
  
  useEffect(() => {
    if (query.length >= 2) {
      // Prefetch but don't display
      prefetchSearch(query).then(r => {
        prefetchCache.current.set(query, r)
      })
    }
    
    if (query.length >= 3) {
      // Check if we already prefetched this
      const cached = prefetchCache.current.get(query)
      if (cached) {
        setResults(cached)
        return
      }
      
      // Otherwise wait for debounce
      const timeout = setTimeout(() => {
        search(query).then(setResults)
      }, 200) // Reduced from 300ms
      
      return () => clearTimeout(timeout)
    }
  }, [query])
  
  return results
}
```

## Vercel-Specific Optimizations

### Vercel KV (Redis)

Serverless Redis for caching popular search queries at the edge.

```typescript
import { kv } from '@vercel/kv'

// /api/search/route.ts
const QUERY_CACHE_TTL = 60 * 60 // 1 hour

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')
  const normalizedQuery = normalizeQuery(query)
  const cacheKey = `search:${normalizedQuery}`
  
  // Check KV cache first
  const cached = await kv.get<SearchApiResponse>(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT' }
    })
  }
  
  // Perform search
  const results = await searchSpotifyFirst(query, limit)
  
  // Cache result
  await kv.set(cacheKey, { tracks: results }, { ex: QUERY_CACHE_TTL })
  
  return NextResponse.json({ tracks: results }, {
    headers: { 'X-Cache': 'MISS' }
  })
}
```

**Pricing:** Free tier includes 30K requests/month, 256MB storage.

### Vercel Edge Config

For static configuration that rarely changes (e.g., song index).

```typescript
import { get } from '@vercel/edge-config'

// Ultra-fast reads (<1ms) for static data
export async function GET() {
  const songIndex = await get<SongIndex>('songIndex')
  return NextResponse.json(songIndex)
}
```

**Use case:** Store the top 500 songs index in Edge Config for instant access.

**Limitation:** 512KB max size, so fits ~5000 minimal song entries.

### Edge Functions

Move search to the edge for lower latency:

```typescript
// /api/search/route.ts
export const runtime = 'edge' // Run at edge, not serverless

export async function GET(request: NextRequest) {
  // Runs in the edge location closest to the user
  // Reduces cold start and network latency
}
```

**Note:** Edge functions have limitations (no Node.js APIs, 128KB code limit).

### HTTP Cache Headers

Leverage Vercel's CDN for caching API responses:

```typescript
// /api/search/route.ts
return NextResponse.json(
  { tracks: result.value },
  {
    headers: {
      // Cache at edge for 60 seconds
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      // Vary by query parameter
      'Vary': 'Accept-Encoding',
    },
  },
)
```

**`s-maxage=60`**: Edge cache for 60 seconds
**`stale-while-revalidate=300`**: Serve stale while fetching fresh for 5 minutes

### ISR for Song Index

Use Incremental Static Regeneration for the song index:

```typescript
// /api/songs/index/route.ts
export const revalidate = 3600 // Regenerate every hour

export async function GET() {
  const songs = await fetchTopSongs(2000)
  
  return NextResponse.json({
    version: 1,
    updatedAt: Date.now(),
    songs: songs.map(s => ({
      id: s.lrclibId,
      t: normalizeTitle(s.title),
      a: normalizeArtist(s.artist),
      al: s.album,
      art: s.albumArt,
      dur: s.durationMs / 1000,
    }))
  })
}
```

### Vercel Blob (Future)

For larger static assets like a complete song database:

```typescript
import { put, get } from '@vercel/blob'

// Store large song index as blob
await put('song-index.json', JSON.stringify(index), {
  access: 'public',
  contentType: 'application/json',
})

// Serve via CDN URL
const blobUrl = 'https://xxx.public.blob.vercel-storage.com/song-index.json'
```

**Use case:** If index grows beyond Edge Config limits (>512KB).

## New API Endpoints

### GET /api/songs/index

Returns the searchable song index:

```typescript
// Response
{
  version: 1,
  updatedAt: 1703980800000,
  songs: [
    { id: 12345, t: "bohemian rhapsody", a: "queen", al: "a night at the opera", art: "https://...", dur: 354, pop: 95 },
    // ... ~2000 entries
  ]
}
```

### GET /api/songs/by-artist

Returns songs by a specific artist:

```typescript
// GET /api/songs/by-artist?artist=queen&limit=20
{
  songs: [
    { id: 12345, t: "bohemian rhapsody", ... },
    { id: 12346, t: "we will rock you", ... },
  ]
}
```

### GET /api/songs/trending

Returns trending songs this week:

```typescript
// GET /api/songs/trending?limit=50
{
  songs: [
    { id: 12345, t: "...", playCountThisWeek: 150 },
  ]
}
```

## What to Cache from LRCLIB

For the song index, we only need:

| Field | Source | Purpose |
|-------|--------|---------|
| `id` | LRCLIB | Navigation to `/song/.../...-{id}` |
| `trackName` | LRCLIB | Display + search |
| `artistName` | LRCLIB | Display + search |
| `albumName` | LRCLIB/Spotify | Display (optional) |
| `duration` | LRCLIB | Display |
| `hasValidSyncedLyrics` | LRCLIB | Filter (only include valid) |

**NOT needed for search:**
- Full lyrics content (10KB per song)
- BPM data
- Enhancement payloads
- Chord data

## Implementation Phases

### Phase 1: Vercel KV Query Cache (Week 1)

1. Add `@vercel/kv` dependency
2. Cache popular search queries for 1 hour
3. Add `X-Cache` headers for monitoring
4. Measure cache hit rate

### Phase 2: Song Index Infrastructure (Week 2)

1. Create `SongIndexStore` with Effect.ts patterns
2. Create `/api/songs/index` endpoint with ISR
3. Add `SongIndexService` to prefetch layer
4. Integrate Fuse.js for local search

### Phase 3: Tiered Search (Week 3)

1. Refactor `SongSearch.tsx` to use tiered approach
2. Show local results immediately
3. Stream API results as they arrive
4. Reduce debounce to 150ms

### Phase 4: Proactive Prefetch (Week 4)

1. Prefetch artist discographies after song play
2. Add trending songs endpoint
3. Background index updates

## Expected Performance

| Scenario | Current | After Optimization |
|----------|---------|-------------------|
| First keystroke | 300ms wait | 0ms (prefetch started) |
| Local match (cached song) | 50ms | <10ms |
| Popular song (KV hit) | 800-1500ms | <50ms |
| Popular song (CDN hit) | 800-1500ms | <100ms |
| Obscure song (cold) | 1000-2000ms | 200-500ms (unchanged) |
| Perceived latency | 800ms avg | <50ms for 80% of queries |

## Success Metrics

- **P50 search latency**: <50ms
- **P95 search latency**: <200ms
- **KV cache hit rate**: >50%
- **CDN cache hit rate**: >30%
- **Local index coverage**: >90% of user queries

## Cost Considerations

| Service | Free Tier | Paid |
|---------|-----------|------|
| Vercel KV | 30K req/mo, 256MB | $0.20/100K req |
| Edge Config | 512KB, unlimited reads | Included |
| Edge Functions | 100K/mo | $0.65/M |
| Bandwidth | 100GB/mo | $0.15/GB |

For ScrollTunes scale, free tier should suffice initially.

## Open Questions

1. Should we use IndexedDB instead of localStorage for larger indexes?
2. How often should we refresh the song index? (Hourly via ISR?)
3. Should we implement service worker for offline search?
4. How do we handle index versioning and migrations?
