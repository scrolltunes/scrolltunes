"use client"

import { useIsAuthenticated } from "@/core"
import { Analytics } from "@vercel/analytics/next"

export function AnalyticsProvider() {
  const isAuthenticated = useIsAuthenticated()

  if (!isAuthenticated) {
    return null
  }

  return <Analytics />
}
