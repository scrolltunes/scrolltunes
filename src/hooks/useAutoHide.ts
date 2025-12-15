"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface UseAutoHideOptions {
  readonly timeoutMs?: number
  readonly enabled?: boolean
  readonly initialVisible?: boolean
}

export interface UseAutoHideResult {
  readonly isVisible: boolean
  readonly show: () => void
  readonly hide: () => void
  readonly toggle: () => void
}

export function useAutoHide(options?: UseAutoHideOptions): UseAutoHideResult {
  const { timeoutMs = 5000, enabled = true, initialVisible = true } = options ?? {}
  const [isVisible, setIsVisible] = useState(initialVisible)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHideTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const startHideTimeout = useCallback(() => {
    clearHideTimeout()
    if (timeoutMs > 0) {
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false)
      }, timeoutMs)
    }
  }, [clearHideTimeout, timeoutMs])

  const show = useCallback(() => {
    setIsVisible(true)
    startHideTimeout()
  }, [startHideTimeout])

  const hide = useCallback(() => {
    clearHideTimeout()
    setIsVisible(false)
  }, [clearHideTimeout])

  const toggle = useCallback(() => {
    setIsVisible(prev => {
      const next = !prev
      if (next) {
        startHideTimeout()
      } else {
        clearHideTimeout()
      }
      return next
    })
  }, [startHideTimeout, clearHideTimeout])

  useEffect(() => {
    if (!enabled) {
      clearHideTimeout()
      return
    }

    if (timeoutMs === 0) {
      setIsVisible(true)
      return
    }

    const handleActivity = () => {
      setIsVisible(true)
      startHideTimeout()
    }

    const events = ["touchstart", "mousemove", "scroll", "keydown"] as const

    for (const event of events) {
      window.addEventListener(event, handleActivity, { passive: true })
    }

    startHideTimeout()

    return () => {
      for (const event of events) {
        window.removeEventListener(event, handleActivity)
      }
      clearHideTimeout()
    }
  }, [enabled, timeoutMs, startHideTimeout, clearHideTimeout])

  return { isVisible, show, hide, toggle }
}
