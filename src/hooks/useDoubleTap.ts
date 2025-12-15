"use client"

import { useCallback, useEffect, useRef } from "react"

export interface UseDoubleTapOptions {
  readonly onDoubleTap: () => void
  readonly threshold?: number
  readonly enabled?: boolean
}

export function useDoubleTap<T extends HTMLElement = HTMLElement>(
  options: UseDoubleTapOptions,
): React.RefObject<T | null> {
  const { onDoubleTap, threshold = 300, enabled = true } = options
  const ref = useRef<T>(null)
  const lastTapTimeRef = useRef<number>(0)

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (!enabled) return

      const now = Date.now()
      const timeSinceLastTap = now - lastTapTimeRef.current

      if (timeSinceLastTap < threshold && timeSinceLastTap > 0) {
        event.preventDefault()
        lastTapTimeRef.current = 0
        onDoubleTap()
      } else {
        lastTapTimeRef.current = now
      }
    },
    [enabled, threshold, onDoubleTap],
  )

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    element.addEventListener("touchend", handleTouchEnd)
    return () => element.removeEventListener("touchend", handleTouchEnd)
  }, [enabled, handleTouchEnd])

  return ref
}
