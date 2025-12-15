"use client"

import { type ReactNode, createContext, useContext, useState } from "react"

interface FooterContextValue {
  readonly slot: ReactNode
  readonly setSlot: (content: ReactNode) => void
}

const FooterContext = createContext<FooterContextValue | null>(null)

export function FooterProvider({ children }: { readonly children: ReactNode }) {
  const [slot, setSlot] = useState<ReactNode>(null)

  return <FooterContext.Provider value={{ slot, setSlot }}>{children}</FooterContext.Provider>
}

export function useFooterSlot() {
  const context = useContext(FooterContext)
  if (!context) {
    throw new Error("useFooterSlot must be used within FooterProvider")
  }
  return context
}
