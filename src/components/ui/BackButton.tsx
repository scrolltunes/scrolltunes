"use client"

import { ArrowLeft } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useState } from "react"

export interface BackButtonProps {
  readonly fallbackHref?: string
  readonly ariaLabel?: string
  readonly className?: string
}

export const BackButton = memo(function BackButton({
  fallbackHref = "/",
  ariaLabel = "Back",
  className = "",
}: BackButtonProps) {
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    setCanGoBack(typeof window !== "undefined" && window.history.length > 1)
  }, [])

  const handleClick = useCallback(() => {
    if (canGoBack) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }, [canGoBack, fallbackHref, router])

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-10 h-10 rounded-sm flex items-center justify-center transition-colors hover:brightness-110 ${className}`}
      style={{ background: "var(--color-surface2)" }}
      aria-label={ariaLabel}
    >
      <ArrowLeft size={20} />
    </button>
  )
})
