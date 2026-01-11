/**
 * useShareGestures - Pan/zoom gesture handling for image editing
 *
 * Handles:
 * - Pointer events for drag (pan)
 * - Touch events for pinch (zoom)
 * - Wheel events for scroll zoom
 * - Keyboard events for arrow keys and +/-
 *
 * Extracts gesture logic from ShareDesignerPreview for reusability.
 */

import { useHaptic } from "@/hooks/useHaptic"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ImageEditState } from "../designer/types"

// ============================================================================
// Constants
// ============================================================================

const PAN_STEP = 5 // 5% per key press
const ZOOM_STEP = 0.1 // 0.1x per key press
const ZOOM_WHEEL_SENSITIVITY = 0.001 // per pixel of scroll
const MIN_SCALE = 1
const MAX_SCALE = 3
const MIN_OFFSET = -100
const MAX_OFFSET = 100

// ============================================================================
// Types
// ============================================================================

export interface UseShareGesturesOptions {
  /**
   * Whether image edit mode is active.
   * Gestures are only processed when this is true.
   */
  readonly isEnabled: boolean

  /**
   * Current image edit state (offset and scale).
   */
  readonly imageEdit: ImageEditState

  /**
   * Callback when offset changes from pan gesture.
   */
  readonly onOffsetChange: (offsetX: number, offsetY: number) => void

  /**
   * Callback when scale changes from zoom gesture.
   */
  readonly onScaleChange: (scale: number) => void

  /**
   * Optional callback when reset key (R) is pressed.
   */
  readonly onReset?: () => void

  /**
   * Optional callback when escape key is pressed to exit edit mode.
   */
  readonly onExit?: () => void
}

export interface UseShareGesturesResult {
  /**
   * Ref to attach to the target element for gesture handling.
   */
  readonly elementRef: React.RefObject<HTMLDivElement | null>

  /**
   * Whether user is currently dragging.
   */
  readonly isDragging: boolean

  /**
   * Event handlers to attach to the element.
   * Only active when isEnabled is true.
   */
  readonly handlers: {
    readonly onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
    readonly onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
    readonly onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void
    readonly onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void
    readonly onTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void
    readonly onTouchMove?: (e: React.TouchEvent<HTMLDivElement>) => void
    readonly onTouchEnd?: (e: React.TouchEvent<HTMLDivElement>) => void
    readonly onTouchCancel?: (e: React.TouchEvent<HTMLDivElement>) => void
    readonly onWheel?: (e: React.WheelEvent<HTMLDivElement>) => void
  }

  /**
   * Style props to apply when gestures are enabled.
   */
  readonly gestureStyles: React.CSSProperties
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useShareGestures({
  isEnabled,
  imageEdit,
  onOffsetChange,
  onScaleChange,
  onReset,
  onExit,
}: UseShareGesturesOptions): UseShareGesturesResult {
  const { haptic } = useHaptic()

  // Element ref for calculating dimensions
  const elementRef = useRef<HTMLDivElement | null>(null)

  // Drag state
  const isDraggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })

  // Pinch-to-zoom state
  const isPinchingRef = useRef(false)
  const initialPinchDistanceRef = useRef(0)
  const initialScaleRef = useRef(1)

  // Track zoom limit haptic feedback to avoid repeated feedback
  const zoomLimitHapticRef = useRef<"min" | "max" | null>(null)

  // ---------------------------------------------------------------------------
  // Helper: Clamp offset value
  // ---------------------------------------------------------------------------
  const clampOffset = useCallback((value: number): number => {
    return Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, value))
  }, [])

  // ---------------------------------------------------------------------------
  // Helper: Clamp scale value
  // ---------------------------------------------------------------------------
  const clampScale = useCallback((value: number): number => {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value))
  }, [])

  // ---------------------------------------------------------------------------
  // Helper: Calculate distance between two touch points
  // ---------------------------------------------------------------------------
  const getTouchDistance = useCallback((touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX
    const dy = touch1.clientY - touch2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }, [])

  // ---------------------------------------------------------------------------
  // Pointer Events (Drag/Pan)
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isEnabled) return

      e.preventDefault()
      isDraggingRef.current = true
      setIsDragging(true)
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      offsetStartRef.current = { x: imageEdit.offsetX, y: imageEdit.offsetY }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [isEnabled, imageEdit.offsetX, imageEdit.offsetY],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return

      const element = elementRef.current
      if (!element) return

      // Calculate movement as percentage of element dimensions
      const rect = element.getBoundingClientRect()
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y

      // Convert pixel movement to percentage offset (scaled by zoom level)
      const scale = imageEdit.scale
      const offsetDeltaX = ((deltaX / rect.width) * 100) / scale
      const offsetDeltaY = ((deltaY / rect.height) * 100) / scale

      const newOffsetX = clampOffset(offsetStartRef.current.x + offsetDeltaX)
      const newOffsetY = clampOffset(offsetStartRef.current.y + offsetDeltaY)

      onOffsetChange(newOffsetX, newOffsetY)
    },
    [imageEdit.scale, onOffsetChange, clampOffset],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      setIsDragging(false)
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Touch Events (Pinch-to-Zoom)
  // ---------------------------------------------------------------------------

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isEnabled) return

      // Detect two-finger touch for pinch
      if (e.touches.length === 2) {
        e.preventDefault()
        isPinchingRef.current = true
        // Stop any ongoing drag when pinch starts
        isDraggingRef.current = false

        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        if (touch1 && touch2) {
          initialPinchDistanceRef.current = getTouchDistance(touch1, touch2)
          initialScaleRef.current = imageEdit.scale
        }
      }
    },
    [isEnabled, imageEdit.scale, getTouchDistance],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isPinchingRef.current) return

      if (e.touches.length === 2) {
        e.preventDefault()

        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        if (touch1 && touch2) {
          const currentDistance = getTouchDistance(touch1, touch2)
          const scaleFactor = currentDistance / initialPinchDistanceRef.current
          const rawScale = initialScaleRef.current * scaleFactor

          // Calculate new scale, clamped to valid range
          const newScale = clampScale(rawScale)

          // Provide haptic feedback when hitting zoom limits (once per limit hit)
          if (rawScale <= MIN_SCALE && zoomLimitHapticRef.current !== "min") {
            haptic("light")
            zoomLimitHapticRef.current = "min"
          } else if (rawScale >= MAX_SCALE && zoomLimitHapticRef.current !== "max") {
            haptic("light")
            zoomLimitHapticRef.current = "max"
          } else if (rawScale > MIN_SCALE && rawScale < MAX_SCALE) {
            zoomLimitHapticRef.current = null
          }

          onScaleChange(newScale)
        }
      }
    },
    [getTouchDistance, clampScale, haptic, onScaleChange],
  )

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    // End pinch when less than 2 fingers remain
    if (e.touches.length < 2) {
      isPinchingRef.current = false
      zoomLimitHapticRef.current = null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Wheel Event (Desktop Zoom)
  // ---------------------------------------------------------------------------

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!isEnabled) return

      // Prevent page scroll when zooming
      e.preventDefault()

      // Calculate zoom delta from wheel movement
      // Negative deltaY = scroll up = zoom in, positive = scroll down = zoom out
      const delta = -e.deltaY * ZOOM_WHEEL_SENSITIVITY
      const rawScale = imageEdit.scale + delta
      const newScale = clampScale(rawScale)

      // Provide haptic feedback when hitting zoom limits
      if (rawScale <= MIN_SCALE && imageEdit.scale > MIN_SCALE) {
        haptic("light")
      } else if (rawScale >= MAX_SCALE && imageEdit.scale < MAX_SCALE) {
        haptic("light")
      }

      onScaleChange(newScale)
    },
    [isEnabled, imageEdit.scale, clampScale, haptic, onScaleChange],
  )

  // ---------------------------------------------------------------------------
  // Keyboard Navigation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isEnabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault()
          onOffsetChange(imageEdit.offsetX, clampOffset(imageEdit.offsetY - PAN_STEP))
          break

        case "ArrowDown":
          e.preventDefault()
          onOffsetChange(imageEdit.offsetX, clampOffset(imageEdit.offsetY + PAN_STEP))
          break

        case "ArrowLeft":
          e.preventDefault()
          onOffsetChange(clampOffset(imageEdit.offsetX - PAN_STEP), imageEdit.offsetY)
          break

        case "ArrowRight":
          e.preventDefault()
          onOffsetChange(clampOffset(imageEdit.offsetX + PAN_STEP), imageEdit.offsetY)
          break

        case "+":
        case "=": // Handle both + and = (for keyboards where + requires shift)
          e.preventDefault()
          onScaleChange(clampScale(imageEdit.scale + ZOOM_STEP))
          break

        case "-":
          e.preventDefault()
          onScaleChange(clampScale(imageEdit.scale - ZOOM_STEP))
          break

        case "r":
        case "R":
          e.preventDefault()
          onReset?.()
          break

        case "Escape":
          e.preventDefault()
          onExit?.()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    isEnabled,
    imageEdit.offsetX,
    imageEdit.offsetY,
    imageEdit.scale,
    onOffsetChange,
    onScaleChange,
    onReset,
    onExit,
    clampOffset,
    clampScale,
  ])

  // ---------------------------------------------------------------------------
  // Return handlers and styles
  // ---------------------------------------------------------------------------

  const handlers = isEnabled
    ? {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerUp,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onTouchCancel: handleTouchEnd,
        onWheel: handleWheel,
      }
    : {}

  const gestureStyles: React.CSSProperties = isEnabled
    ? {
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
        userSelect: "none",
      }
    : {}

  return {
    elementRef,
    isDragging,
    handlers,
    gestureStyles,
  }
}

// ============================================================================
// Re-export constants for consumers
// ============================================================================

export { MIN_SCALE, MAX_SCALE, MIN_OFFSET, MAX_OFFSET, PAN_STEP, ZOOM_STEP }
