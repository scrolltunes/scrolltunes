"use client"

import { type ReactNode, useEffect } from "react"

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark")
  }, [])

  return <>{children}</>
}
