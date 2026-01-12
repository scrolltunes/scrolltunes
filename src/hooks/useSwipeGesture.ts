"use client"

import { useCallback, useRef } from "react"

export interface UseSwipeGestureOptions {
  readonly onSwipeLeft?: () => void
  readonly onSwipeRight?: () => void
  readonly threshold?: number
  readonly enabled?: boolean
}

export interface UseSwipeGestureHandlers {
  readonly onTouchStart: (e: React.TouchEvent) => void
  readonly onTouchEnd: (e: React.TouchEvent) => void
}

export interface UseSwipeGestureResult {
  readonly handlers: UseSwipeGestureHandlers
}

const DEFAULT_THRESHOLD = 50

export function useSwipeGesture(options: UseSwipeGestureOptions): UseSwipeGestureResult {
  const { onSwipeLeft, onSwipeRight, threshold = DEFAULT_THRESHOLD, enabled = true } = options

  const touchStartXRef = useRef<number | null>(null)

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return

      const touch = e.touches[0]
      if (touch) {
        touchStartXRef.current = touch.clientX
      }
    },
    [enabled],
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || touchStartXRef.current === null) return

      const touch = e.changedTouches[0]
      if (!touch) {
        touchStartXRef.current = null
        return
      }

      const deltaX = touch.clientX - touchStartXRef.current
      touchStartXRef.current = null

      if (Math.abs(deltaX) < threshold) return

      if (deltaX < 0) {
        onSwipeLeft?.()
      } else {
        onSwipeRight?.()
      }
    },
    [enabled, threshold, onSwipeLeft, onSwipeRight],
  )

  const handlers: UseSwipeGestureHandlers = {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  }

  return { handlers }
}
