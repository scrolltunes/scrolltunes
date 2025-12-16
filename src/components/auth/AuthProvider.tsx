"use client"

import { accountStore, recentSongsStore } from "@/core"
import { fetchHistory } from "@/lib/sync-service"
import { SessionProvider } from "next-auth/react"
import { type ReactNode, useEffect } from "react"

interface AuthProviderProps {
  readonly children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  useEffect(() => {
    async function initAndSync() {
      const hasCache = recentSongsStore.hasLoadedFromCache()

      // If we have cached items, mark as initialized immediately so they show
      if (hasCache) {
        recentSongsStore.setInitialized(true)
      }

      await accountStore.initialize()

      const isAuth = accountStore.isAuthenticated()

      if (!isAuth) {
        // Not authenticated - mark initialized and done
        recentSongsStore.setInitialized(true)
        return
      }

      // Authenticated - start spinning immediately while we probe for count
      if (!hasCache) {
        recentSongsStore.setSyncing(true)
      }

      // Fetch count first to determine skeleton size
      try {
        const countResponse = await fetch("/api/user/history/count")
        if (countResponse.ok) {
          const { count } = (await countResponse.json()) as { count: number }
          recentSongsStore.setExpectedCount(count)

          // Allow skeleton/empty state to show now that we know the count
          recentSongsStore.setInitialized(true)

          // If no items, stop syncing early
          if (count === 0) {
            recentSongsStore.setSyncing(false)
            return
          }
        }
      } catch {
        // Failed to fetch count, continue anyway
        recentSongsStore.setInitialized(true)
      }

      await recentSongsStore.syncAllToServer()

      try {
        const serverHistory = await fetchHistory()
        if (serverHistory.length > 0) {
          recentSongsStore.replaceFromServer(serverHistory)
        }
      } catch {
        // Failed to fetch server history
      } finally {
        recentSongsStore.setSyncing(false)
        recentSongsStore.setInitialized(true)
      }
    }

    initAndSync()
  }, [])

  return <SessionProvider>{children}</SessionProvider>
}
