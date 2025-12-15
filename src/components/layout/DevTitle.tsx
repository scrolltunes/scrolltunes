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

    // Watch for title changes and re-apply prefix
    const titleElement = document.querySelector("title")
    if (!titleElement) return

    const observer = new MutationObserver(prefixTitle)
    observer.observe(titleElement, { childList: true, characterData: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  return null
}
