import type { RecentSong } from "@/lib/recent-songs-types"
import { userApi } from "@/lib/user-api"

export interface HistorySyncItem {
  readonly songId: string
  readonly songProvider: string
  readonly title: string
  readonly artist: string
  readonly album?: string
  readonly durationMs?: number
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
    ...(song.album && { album: song.album }),
    ...(song.durationSeconds && { durationMs: song.durationSeconds * 1000 }),
  }
}

export function syncHistory(items: HistorySyncItem[]): void {
  userApi.post("/api/user/history/sync", { songs: items })
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
  const result = await userApi.get<{ history: HistoryItem[] }>("/api/user/history")
  return result?.history ?? []
}

export interface ServerFavorite {
  readonly songId: string
  readonly songProvider: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string
  readonly addedAt: string
}

export async function fetchFavorites(): Promise<ServerFavorite[]> {
  const result = await userApi.get<{ favorites: ServerFavorite[] }>("/api/user/favorites/sync")
  return result?.favorites ?? []
}

export interface TopCatalogSong {
  readonly lrclibId: number
  readonly title: string
  readonly artist: string
  readonly album: string | null
}

export async function fetchTopCatalogSongs(limit = 20): Promise<TopCatalogSong[]> {
  const response = await fetch(`/api/songs/top?limit=${limit}`)

  if (!response.ok) {
    throw new Error(`Fetch top catalog songs failed: ${response.status}`)
  }

  const data = (await response.json()) as { songs: TopCatalogSong[] }
  return data.songs
}
