export type HapticPattern = "light" | "medium" | "heavy" | "success" | "warning" | "error"

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 10],
  warning: [30, 30, 30],
  error: [50, 100, 50],
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function isHapticSupported(): boolean {
  if (typeof navigator === "undefined") return false
  return "vibrate" in navigator
}

export function haptic(pattern: HapticPattern): void {
  if (!isHapticSupported()) return
  if (prefersReducedMotion()) return

  const vibrationPattern = HAPTIC_PATTERNS[pattern]
  navigator.vibrate(vibrationPattern)
}
