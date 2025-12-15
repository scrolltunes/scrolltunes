"use client"

import { type ReactNode, useEffect } from "react"
import { useFooterSlot } from "./FooterContext"

interface FooterSlotProps {
  readonly children: ReactNode
}

export function FooterSlot({ children }: FooterSlotProps) {
  const { setSlot } = useFooterSlot()

  useEffect(() => {
    setSlot(children)
    return () => setSlot(null)
  }, [children, setSlot])

  return null
}
