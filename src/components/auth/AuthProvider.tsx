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
      await accountStore.initialize()

      const isAuth = accountStore.isAuthenticated()

      if (isAuth) {
        await recentSongsStore.syncAllToServer()

        try {
          const serverHistory = await fetchHistory()
          if (serverHistory.length > 0) {
            recentSongsStore.replaceFromServer(serverHistory)
          }
        } catch {
          // Failed to fetch server history
        }
      }
    }

    initAndSync()
  }, [])

  return <SessionProvider>{children}</SessionProvider>
}
