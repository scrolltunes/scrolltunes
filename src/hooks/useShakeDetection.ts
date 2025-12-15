"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface UseShakeDetectionOptions {
  readonly onShake: () => void
  readonly threshold?: number
  readonly debounceMs?: number
  readonly enabled?: boolean
}

export interface UseShakeDetectionResult {
  readonly isSupported: boolean
  readonly isListening: boolean
  readonly requestPermission: () => Promise<boolean>
  readonly start: () => void
  readonly stop: () => void
}

interface DeviceMotionEventWithPermission extends DeviceMotionEvent {
  requestPermission?: () => Promise<"granted" | "denied">
}

declare global {
  interface DeviceMotionEvent {
    requestPermission?: () => Promise<"granted" | "denied">
  }
}

const DEFAULT_THRESHOLD = 15
const DEFAULT_DEBOUNCE_MS = 1000

function getIsSupported(): boolean {
  if (typeof window === "undefined") return false
  return "DeviceMotionEvent" in window
}

function needsPermission(): boolean {
  if (typeof window === "undefined") return false
  return (
    typeof (DeviceMotionEvent as unknown as DeviceMotionEventWithPermission).requestPermission ===
    "function"
  )
}

export function useShakeDetection(options: UseShakeDetectionOptions): UseShakeDetectionResult {
  const {
    onShake,
    threshold = DEFAULT_THRESHOLD,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    enabled = false,
  } = options

  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState(getIsSupported)

  const lastShakeRef = useRef<number>(0)
  const onShakeRef = useRef(onShake)

  useEffect(() => {
    onShakeRef.current = onShake
  }, [onShake])

  const handleMotion = useCallback(
    (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity
      if (!acceleration) return

      const x = acceleration.x ?? 0
      const y = acceleration.y ?? 0
      const z = acceleration.z ?? 0

      const magnitude = Math.sqrt(x * x + y * y + z * z)

      const gravityMagnitude = 9.81
      const netAcceleration = Math.abs(magnitude - gravityMagnitude)

      if (netAcceleration > threshold) {
        const now = Date.now()
        if (now - lastShakeRef.current > debounceMs) {
          lastShakeRef.current = now
          onShakeRef.current()
        }
      }
    },
    [threshold, debounceMs],
  )

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false

    if (!needsPermission()) {
      return true
    }

    try {
      const permission = await (
        DeviceMotionEvent as unknown as DeviceMotionEventWithPermission
      ).requestPermission?.()
      return permission === "granted"
    } catch {
      return false
    }
  }, [isSupported])

  const start = useCallback(() => {
    if (!isSupported || isListening) return
    window.addEventListener("devicemotion", handleMotion)
    setIsListening(true)
  }, [isSupported, isListening, handleMotion])

  const stop = useCallback(() => {
    if (!isListening) return
    window.removeEventListener("devicemotion", handleMotion)
    setIsListening(false)
  }, [isListening, handleMotion])

  useEffect(() => {
    if (!enabled) {
      stop()
      return
    }

    if (enabled && isSupported) {
      if (needsPermission()) {
        return
      }
      start()
    }

    return () => {
      stop()
    }
  }, [enabled, isSupported, start, stop])

  return {
    isSupported,
    isListening,
    requestPermission,
    start,
    stop,
  }
}
