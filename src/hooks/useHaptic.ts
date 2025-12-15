import { type HapticPattern, isHapticSupported, haptic as triggerHaptic } from "@/lib/haptics"
import { useCallback, useMemo } from "react"

export type { HapticPattern } from "@/lib/haptics"

export interface UseHapticResult {
  haptic: (pattern: HapticPattern) => void
  isSupported: boolean
}

export function useHaptic(): UseHapticResult {
  const isSupported = useMemo(() => isHapticSupported(), [])

  const haptic = useCallback((pattern: HapticPattern) => {
    triggerHaptic(pattern)
  }, [])

  return { haptic, isSupported }
}
