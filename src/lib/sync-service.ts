import type { RecentSong } from "@/lib/recent-songs-types"

export interface HistorySyncItem {
  readonly songId: string
  readonly songProvider: string
  readonly title: string
  readonly artist: string
  readonly lastPlayedAt: string
  readonly playCount: number
}

export function recentSongToHistorySyncItem(song: RecentSong): HistorySyncItem {
  return {
    songId: `lrclib:${song.id}`,
    songProvider: "lrclib",
    title: song.title,
    artist: song.artist,
    lastPlayedAt: new Date(song.lastPlayedAt).toISOString(),
    playCount: 1,
  }
}

export async function syncHistory(items: HistorySyncItem[]): Promise<void> {
  const response = await fetch("/api/user/history/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ songs: items }),
  })

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`)
  }
}

export interface HistoryItem {
  readonly songId: string
  readonly songProvider: string
  readonly title: string
  readonly artist: string
  readonly lastPlayedAt: string | null
  readonly playCount: number
}

export async function fetchHistory(): Promise<HistoryItem[]> {
  const response = await fetch("/api/user/history")

  if (!response.ok) {
    throw new Error(`Fetch history failed: ${response.status}`)
  }

  const data = (await response.json()) as { history: HistoryItem[] }
  return data.history
}
