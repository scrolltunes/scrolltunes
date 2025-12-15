"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface UseWakeLockOptions {
  readonly enabled?: boolean
}

export interface UseWakeLockResult {
  readonly isSupported: boolean
  readonly isActive: boolean
  readonly request: () => Promise<void>
  readonly release: () => Promise<void>
}

export function useWakeLock(options: UseWakeLockOptions = {}): UseWakeLockResult {
  const { enabled = false } = options

  const [isSupported] = useState(() => typeof navigator !== "undefined" && "wakeLock" in navigator)
  const [isActive, setIsActive] = useState(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const request = useCallback(async () => {
    if (!isSupported || wakeLockRef.current) return

    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen")
      setIsActive(true)

      wakeLockRef.current.addEventListener("release", () => {
        wakeLockRef.current = null
        setIsActive(false)
      })
    } catch {
      setIsActive(false)
    }
  }, [isSupported])

  const release = useCallback(async () => {
    if (!wakeLockRef.current) return

    try {
      await wakeLockRef.current.release()
      wakeLockRef.current = null
      setIsActive(false)
    } catch {
      // Ignore release errors
    }
  }, [])

  useEffect(() => {
    if (!isSupported) return

    if (enabled) {
      request()
    } else {
      release()
    }

    return () => {
      release()
    }
  }, [enabled, isSupported, request, release])

  useEffect(() => {
    if (!isSupported || !enabled) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        request()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isSupported, enabled, request])

  return {
    isSupported,
    isActive,
    request,
    release,
  }
}
