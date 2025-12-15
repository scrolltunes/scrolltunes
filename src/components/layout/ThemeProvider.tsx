"use client"

import { preferencesStore } from "@/core"
import { type ReactNode, useEffect } from "react"

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    function applyTheme() {
      const themeMode = preferencesStore.get("themeMode")
      const isDark = themeMode === "dark" || (themeMode === "system" && mediaQuery.matches)

      if (isDark) {
        document.documentElement.classList.add("dark")
        document.documentElement.classList.remove("light")
      } else {
        document.documentElement.classList.add("light")
        document.documentElement.classList.remove("dark")
      }
    }

    applyTheme()

    const unsubscribe = preferencesStore.subscribe(applyTheme)
    mediaQuery.addEventListener("change", applyTheme)

    return () => {
      unsubscribe()
      mediaQuery.removeEventListener("change", applyTheme)
    }
  }, [])

  return <>{children}</>
}
