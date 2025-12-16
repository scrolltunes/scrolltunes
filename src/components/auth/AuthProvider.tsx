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

      await accountStore.initialize()

      const isAuth = accountStore.isAuthenticated()

      if (!isAuth) {
        return
      }

      await recentSongsStore.syncAllToServer()

      try {
        const countResponse = await fetch("/api/user/history/count")
        if (countResponse.ok) {
          const { count } = (await countResponse.json()) as { count: number }
          recentSongsStore.setExpectedCount(count)

          if (count > 0 && !hasCache) {
            recentSongsStore.setSyncing(true)
          }
        }

        const serverHistory = await fetchHistory()
        if (serverHistory.length > 0) {
          recentSongsStore.replaceFromServer(serverHistory)
        }
      } catch {
        // Failed to fetch server history
      } finally {
        recentSongsStore.setSyncing(false)
      }
    }

    initAndSync()
  }, [])

  return <SessionProvider>{children}</SessionProvider>
}
