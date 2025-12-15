"use client"

import { useEffect } from "react"

/**
 * Adds [DEV] prefix to page title when running on localhost
 */
export function DevTitle() {
  useEffect(() => {
    const isLocalhost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"

    if (!isLocalhost) return

    const prefixTitle = () => {
      if (!document.title.startsWith("[DEV]")) {
        document.title = `[DEV] ${document.title}`
      }
    }

    prefixTitle()

    // Watch for title changes in <head> (Next.js may replace the title element)
    const observer = new MutationObserver(prefixTitle)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })

    return () => observer.disconnect()
  }, [])

  return null
}
