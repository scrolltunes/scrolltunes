"use client"

import {
  accountStore,
  favoritesStore,
  preferencesStore,
  recentSongsStore,
  setlistsStore,
} from "@/core"
import { fetchFavorites, fetchHistory } from "@/lib/sync-service"
import type { Session } from "next-auth"
import { SessionProvider } from "next-auth/react"
import { type ReactNode, useEffect } from "react"

interface AuthProviderProps {
  readonly children: ReactNode
  readonly session: Session | null
}

export function AuthProvider({ children, session }: AuthProviderProps) {
  useEffect(() => {
    accountStore.initializeFromSession(session)

    // Initialize stores for authenticated users (no await - fire and forget)
    if (session !== null) {
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
      } catch {
        // Failed to fetch server data
      } finally {
        recentSongsStore.setSyncing(false)
      }
    }

    initAndSync()
  }, [session])

  return <SessionProvider>{children}</SessionProvider>
}
