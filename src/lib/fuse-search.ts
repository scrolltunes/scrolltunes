import type { SongIndexEntry } from "@/core/SongIndexStore"
import Fuse, { type IFuseOptions } from "fuse.js"

export interface FuseSearchResult {
  readonly item: SongIndexEntry
  readonly score: number
}

const fuseOptions: IFuseOptions<SongIndexEntry> = {
  keys: [
    { name: "t", weight: 0.6 },
    { name: "a", weight: 0.4 },
    { name: "al", weight: 0.1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 2,
}

let fuseInstance: Fuse<SongIndexEntry> | null = null
let lastSongsRef: readonly SongIndexEntry[] | null = null

export function searchSongIndex(
  query: string,
  songs: readonly SongIndexEntry[],
  limit = 10,
): FuseSearchResult[] {
  if (!query.trim() || songs.length === 0) {
    return []
  }

  if (lastSongsRef !== songs) {
    fuseInstance = new Fuse([...songs], fuseOptions)
    lastSongsRef = songs
  }

  if (!fuseInstance) {
    fuseInstance = new Fuse([...songs], fuseOptions)
    lastSongsRef = songs
  }

  const results = fuseInstance.search(query, { limit })

  return results.map(r => ({
    item: r.item,
    score: 1 - (r.score ?? 0),
  }))
}

export function resetFuseInstance(): void {
  fuseInstance = null
  lastSongsRef = null
}
