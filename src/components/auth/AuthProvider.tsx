"use client"

import {
  accountStore,
  favoritesStore,
  preferencesStore,
  recentSongsStore,
  setlistsStore,
} from "@/core"
import { fetchFavorites, fetchHistory, fetchTopCatalogSongs } from "@/lib/sync-service"
import type { Session } from "next-auth"
import { SessionProvider } from "next-auth/react"
import { type ReactNode, useEffect } from "react"
import { AnalyticsProvider } from "./AnalyticsProvider"

interface AuthProviderProps {
  readonly children: ReactNode
  readonly session: Session | null
}

export function AuthProvider({ children, session }: AuthProviderProps) {
  useEffect(() => {
    accountStore.initializeFromSession(session)

    // Initialize stores for authenticated users (no await - fire and forget)
    if (session !== null) {
      accountStore.initialize() // Fetch full profile including isAdmin
      setlistsStore.fetchAll()
      preferencesStore.initialize()
    }
  }, [session])

  useEffect(() => {
    async function initAndSync() {
      const hasCache = recentSongsStore.hasLoadedFromCache()
      const isAuth = session !== null

      if (!isAuth) {
        if (!hasCache) {
          recentSongsStore.setInitialized(true)
        }
        return
      }

      if (!hasCache) {
        recentSongsStore.setSyncing(true)
      }

      try {
        const countResponse = await fetch("/api/user/history/count")
        if (countResponse.ok) {
          const { count } = (await countResponse.json()) as { count: number }
          recentSongsStore.setExpectedCount(count)

          if (!hasCache) {
            recentSongsStore.setInitialized(true)
          }

          if (count === 0) {
            recentSongsStore.setSyncing(false)
            return
          }
        }
      } catch {
        if (!hasCache) {
          recentSongsStore.setInitialized(true)
        }
      }

      await recentSongsStore.syncAllToServer()
      await favoritesStore.syncAllToServer()

      try {
        const [serverHistory, serverFavorites] = await Promise.all([
          fetchHistory(),
          fetchFavorites(),
        ])

        recentSongsStore.replaceFromServer(serverHistory)
        favoritesStore.replaceFromServer(serverFavorites)

        // Pre-load top catalog songs if user has no local data
        // This ensures album art is cached for popular songs
        const historyIds = new Set(
          serverHistory.map(h => {
            const numericId = Number.parseInt(h.songId.replace("lrclib:", ""), 10)
            return Number.isNaN(numericId) ? -1 : numericId
          }),
        )
        const favoriteIds = new Set(
          serverFavorites.map(f => {
            const numericId = Number.parseInt(f.songId.replace("lrclib:", ""), 10)
            return Number.isNaN(numericId) ? -1 : numericId
          }),
        )

        // Only preload if user has few songs cached
        const totalUserSongs = historyIds.size + favoriteIds.size
        if (totalUserSongs < 10) {
          const topSongs = await fetchTopCatalogSongs(20)
          // Filter out songs user already has
          const songsToPreload = topSongs.filter(
            s => !historyIds.has(s.lrclibId) && !favoriteIds.has(s.lrclibId),
          )
          // Preload album art for these songs (background fetch)
          if (songsToPreload.length > 0) {
            recentSongsStore.preloadCatalogSongs(songsToPreload)
          }
        }
      } catch {
        // Failed to fetch server data
      } finally {
        recentSongsStore.setSyncing(false)
      }
    }

    initAndSync()
  }, [session])

  return (
    <SessionProvider>
      <AnalyticsProvider />
      {children}
    </SessionProvider>
  )
}
