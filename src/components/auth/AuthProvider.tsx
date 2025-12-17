"use client"

import { accountStore, favoritesStore, recentSongsStore } from "@/core"
import { fetchFavorites, fetchHistory } from "@/lib/sync-service"
import { SessionProvider } from "next-auth/react"
import { type ReactNode, useEffect } from "react"

interface AuthProviderProps {
  readonly children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  useEffect(() => {
    async function initAndSync() {
      const hasCache = recentSongsStore.hasLoadedFromCache()

      await accountStore.initialize()

      const isAuth = accountStore.isAuthenticated()

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

        if (serverHistory.length > 0) {
          recentSongsStore.replaceFromServer(serverHistory)
        }
        if (serverFavorites.length > 0) {
          favoritesStore.replaceFromServer(serverFavorites)
        }
      } catch {
        // Failed to fetch server data
      } finally {
        recentSongsStore.setSyncing(false)
      }
    }

    initAndSync()
  }, [])

  return <SessionProvider>{children}</SessionProvider>
}
