/**
 * Structured metrics logging for observability
 */

interface SearchMetric {
  readonly event: "search"
  readonly query: string
  readonly resultCount: number
  readonly source: "turso" | "lrclib-api"
  readonly latencyMs: number
  readonly timestamp: string
}

interface BpmMetric {
  readonly event: "bpm_lookup"
  readonly lrclibId: number
  readonly source: "embedded" | "reccobeats" | "getsongbpm" | "deezer" | "rapidapi" | "none"
  readonly latencyMs: number
  readonly timestamp: string
}

interface AlbumArtMetric {
  readonly event: "album_art"
  readonly source: "stored" | "isrc" | "search" | "none"
  readonly latencyMs: number
  readonly timestamp: string
}

export function logSearchMetrics(
  query: string,
  resultCount: number,
  source: SearchMetric["source"],
  latencyMs: number,
): void {
  const metric: SearchMetric = {
    event: "search",
    query: query.slice(0, 50), // Truncate for privacy
    resultCount,
    source,
    latencyMs,
    timestamp: new Date().toISOString(),
  }
  console.log(JSON.stringify(metric))
}

export function logBpmMetrics(
  lrclibId: number,
  source: BpmMetric["source"],
  latencyMs: number,
): void {
  const metric: BpmMetric = {
    event: "bpm_lookup",
    lrclibId,
    source,
    latencyMs,
    timestamp: new Date().toISOString(),
  }
  console.log(JSON.stringify(metric))
}

export function logAlbumArtMetrics(source: AlbumArtMetric["source"], latencyMs: number): void {
  const metric: AlbumArtMetric = {
    event: "album_art",
    source,
    latencyMs,
    timestamp: new Date().toISOString(),
  }
  console.log(JSON.stringify(metric))
}
