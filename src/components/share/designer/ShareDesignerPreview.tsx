"use client"

import { useHaptic } from "@/hooks/useHaptic"
import { MusicNote } from "@phosphor-icons/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { applyEffect } from "../effects"
import type {
  AlbumArtEffectConfig,
  AlbumArtElementConfig,
  BackgroundConfig,
  BrandingElementConfig,
  EffectsConfig,
  ImageEditState,
  LyricsElementConfig,
  LyricsSelectionConfig,
  MetadataElementConfig,
  PatternVariant,
  SpotifyCodeElementConfig,
  TypographyConfig,
} from "./types"

// ============================================================================
// Pattern Utilities
// ============================================================================

function generateSmokeWaves(seed: number): string {
  const seededRandom = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000
    return x - Math.floor(x)
  }

  const paths: string[] = []
  const numWaves = 5 + Math.floor(seededRandom(0) * 4)

  for (let i = 0; i < numWaves; i++) {
    const startY = seededRandom(i * 10) * 100
    const amplitude = 10 + seededRandom(i * 20) * 25
    const frequency = 0.5 + seededRandom(i * 30) * 1.5
    const phaseShift = seededRandom(i * 40) * Math.PI * 2
    const opacity = 0.03 + seededRandom(i * 50) * 0.05

    let d = `M 0 ${startY}`
    for (let x = 0; x <= 100; x += 2) {
      const y = startY + Math.sin((x * frequency * Math.PI) / 50 + phaseShift) * amplitude
      d += ` L ${x} ${y}`
    }

    paths.push(
      `<path d="${d}" fill="none" stroke="rgba(255,255,255,${opacity})" stroke-width="${0.5 + seededRandom(i * 60) * 1}"/>`,
    )
  }

  return paths.join("")
}

function getPatternStyle(pattern: PatternVariant): React.CSSProperties {
  switch (pattern) {
    case "dots":
      return {
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }
    case "grid":
      return {
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }
    default:
      return {}
  }
}

// ============================================================================
// Font Utilities
// ============================================================================

function getFontFamily(fontFamily: string): string {
  switch (fontFamily) {
    case "inter":
      return "'Inter', sans-serif"
    case "roboto":
      return "'Roboto', sans-serif"
    case "playfair":
      return "'Playfair Display', serif"
    case "merriweather":
      return "'Merriweather', serif"
    case "montserrat":
      return "'Montserrat', sans-serif"
    case "bebas":
      return "'Bebas Neue', sans-serif"
    case "oswald":
      return "'Oswald', sans-serif"
    case "lora":
      return "'Lora', serif"
    default:
      return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  }
}

// ============================================================================
// Shape Utilities
// ============================================================================

function getShapeBorderRadius(shape: "square" | "rounded" | "circle", size: number): number {
  switch (shape) {
    case "square":
      return 0
    case "rounded":
      return 8
    case "circle":
      return size / 2
    default:
      return 8
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Pattern overlay configuration for compact mode.
 * Allows rendering a pattern on top of any background type (gradient, solid, etc.)
 */
export interface PatternOverlayConfig {
  readonly pattern: PatternVariant
  readonly seed: number
}

export interface ShareDesignerPreviewProps {
  readonly title: string
  readonly artist: string
  readonly albumArt?: string | null
  readonly spotifyId?: string | null
  readonly lyrics: LyricsSelectionConfig
  readonly background: BackgroundConfig
  readonly typography: TypographyConfig
  readonly padding: number
  readonly albumArtElement: AlbumArtElementConfig
  readonly metadataElement: MetadataElementConfig
  readonly lyricsElement: LyricsElementConfig
  readonly spotifyCodeElement: SpotifyCodeElementConfig
  readonly brandingElement: BrandingElementConfig
  readonly effects: EffectsConfig
  readonly albumArtEffect?: AlbumArtEffectConfig
  readonly getDisplayText: (lineId: string) => string
  readonly previewRef?: React.RefObject<HTMLDivElement | null>
  readonly cardRef?: React.RefObject<HTMLDivElement | null>
  readonly isEditing?: boolean
  readonly onTextChange?: (lineId: string, text: string) => void
  readonly isImageEditing?: boolean
  readonly imageEdit?: ImageEditState
  readonly onImageOffsetChange?: (offsetX: number, offsetY: number) => void
  readonly onImageScaleChange?: (scale: number) => void
  readonly onExitImageEdit?: () => void
  readonly onResetImagePosition?: () => void
  /** Optional pattern overlay to render on top of any background (used in compact mode) */
  readonly patternOverlay?: PatternOverlayConfig | undefined
}

// ============================================================================
// Card Styles
// ============================================================================

const cardBaseStyles: React.CSSProperties = {
  fontKerning: "none",
  letterSpacing: "0px",
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
  textRendering: "geometricPrecision",
}

// ============================================================================
// Main Component
// ============================================================================

export const ShareDesignerPreview = memo(function ShareDesignerPreview({
  title,
  artist,
  albumArt,
  spotifyId,
  lyrics,
  background,
  typography,
  padding,
  albumArtElement,
  metadataElement,
  lyricsElement,
  spotifyCodeElement,
  brandingElement,
  effects,
  albumArtEffect,
  getDisplayText,
  previewRef,
  cardRef,
  isEditing = false,
  onTextChange,
  isImageEditing = false,
  imageEdit,
  onImageOffsetChange,
  onImageScaleChange,
  onExitImageEdit,
  onResetImagePosition,
  patternOverlay,
}: ShareDesignerPreviewProps) {
  const isRTL = lyrics.direction === "rtl"
  const { haptic } = useHaptic()

  // Drag state for image panning
  const isDraggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })
  const cardElementRef = useRef<HTMLDivElement | null>(null)

  // Pinch-to-zoom state
  const isPinchingRef = useRef(false)
  const initialPinchDistanceRef = useRef(0)
  const initialScaleRef = useRef(1)

  // Handle pointer down for drag start
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isImageEditing || !onImageOffsetChange || !imageEdit) return

      // Skip drag if clicking on editable text
      const target = e.target as HTMLElement
      if (target.isContentEditable) return

      e.preventDefault()
      isDraggingRef.current = true
      setIsDragging(true)
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      offsetStartRef.current = { x: imageEdit.offsetX, y: imageEdit.offsetY }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [isImageEditing, onImageOffsetChange, imageEdit],
  )

  // Handle pointer move for dragging
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || !onImageOffsetChange || !imageEdit) return

      const element = cardElementRef.current
      if (!element) return

      // Calculate movement as percentage of element dimensions
      const rect = element.getBoundingClientRect()
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y

      // Convert pixel movement to percentage offset (scaled by zoom level)
      // Multiply by 2 to compensate for the 0.5 multiplier in transform application
      const scale = imageEdit.scale
      const offsetDeltaX = ((deltaX / rect.width) * 200) / scale
      const offsetDeltaY = ((deltaY / rect.height) * 200) / scale

      const newOffsetX = Math.max(-100, Math.min(100, offsetStartRef.current.x + offsetDeltaX))
      const newOffsetY = Math.max(-100, Math.min(100, offsetStartRef.current.y + offsetDeltaY))

      onImageOffsetChange(newOffsetX, newOffsetY)
    },
    [onImageOffsetChange, imageEdit],
  )

  // Handle pointer up for drag end
  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      setIsDragging(false)
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  // Calculate distance between two touch points
  const getTouchDistance = useCallback((touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX
    const dy = touch1.clientY - touch2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }, [])

  // Handle touch start for pinch-to-zoom
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isImageEditing || !onImageScaleChange || !imageEdit) return

      // Skip if touching editable text (for single touch)
      const target = e.target as HTMLElement
      if (e.touches.length === 1 && target.isContentEditable) return

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
    [isImageEditing, onImageScaleChange, imageEdit, getTouchDistance],
  )

  // Track if we already provided haptic feedback for current zoom limit hit
  const zoomLimitHapticRef = useRef<"min" | "max" | null>(null)

  // Handle touch move for pinch-to-zoom
  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isPinchingRef.current || !onImageScaleChange || !imageEdit) return

      if (e.touches.length === 2) {
        e.preventDefault()

        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        if (touch1 && touch2) {
          const currentDistance = getTouchDistance(touch1, touch2)
          const scaleFactor = currentDistance / initialPinchDistanceRef.current
          const rawScale = initialScaleRef.current * scaleFactor

          // Calculate new scale, clamped to 1.0-3.0 range
          const newScale = Math.max(1, Math.min(3, rawScale))

          // Provide haptic feedback when hitting zoom limits (once per limit hit)
          if (rawScale <= 1 && zoomLimitHapticRef.current !== "min") {
            haptic("light")
            zoomLimitHapticRef.current = "min"
          } else if (rawScale >= 3 && zoomLimitHapticRef.current !== "max") {
            haptic("light")
            zoomLimitHapticRef.current = "max"
          } else if (rawScale > 1 && rawScale < 3) {
            zoomLimitHapticRef.current = null
          }

          onImageScaleChange(newScale)
        }
      }
    },
    [onImageScaleChange, imageEdit, getTouchDistance, haptic],
  )

  // Handle touch end for pinch-to-zoom
  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    // End pinch when less than 2 fingers remain
    if (e.touches.length < 2) {
      isPinchingRef.current = false
      zoomLimitHapticRef.current = null
    }
  }, [])

  // Handle wheel for desktop zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!isImageEditing || !onImageScaleChange || !imageEdit) return

      // Prevent page scroll when zooming
      e.preventDefault()

      // Calculate zoom delta from wheel movement
      // Negative deltaY = scroll up = zoom in, positive = scroll down = zoom out
      const zoomSensitivity = 0.001
      const delta = -e.deltaY * zoomSensitivity
      const rawScale = imageEdit.scale + delta
      const newScale = Math.max(1, Math.min(3, rawScale))

      // Provide haptic feedback when hitting zoom limits
      if (rawScale <= 1 && imageEdit.scale > 1) {
        haptic("light")
      } else if (rawScale >= 3 && imageEdit.scale < 3) {
        haptic("light")
      }

      onImageScaleChange(newScale)
    },
    [isImageEditing, onImageScaleChange, imageEdit, haptic],
  )

  // Keyboard navigation for image edit mode
  useEffect(() => {
    if (!isImageEditing) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      const PAN_STEP = 5 // 5% per key press
      const ZOOM_STEP = 0.1

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault()
          if (onImageOffsetChange && imageEdit) {
            const newOffsetY = Math.max(-100, imageEdit.offsetY - PAN_STEP)
            onImageOffsetChange(imageEdit.offsetX, newOffsetY)
          }
          break

        case "ArrowDown":
          e.preventDefault()
          if (onImageOffsetChange && imageEdit) {
            const newOffsetY = Math.min(100, imageEdit.offsetY + PAN_STEP)
            onImageOffsetChange(imageEdit.offsetX, newOffsetY)
          }
          break

        case "ArrowLeft":
          e.preventDefault()
          if (onImageOffsetChange && imageEdit) {
            const newOffsetX = Math.max(-100, imageEdit.offsetX - PAN_STEP)
            onImageOffsetChange(newOffsetX, imageEdit.offsetY)
          }
          break

        case "ArrowRight":
          e.preventDefault()
          if (onImageOffsetChange && imageEdit) {
            const newOffsetX = Math.min(100, imageEdit.offsetX + PAN_STEP)
            onImageOffsetChange(newOffsetX, imageEdit.offsetY)
          }
          break

        case "+":
        case "=": // Handle both + and = (for keyboards where + requires shift)
          e.preventDefault()
          if (onImageScaleChange && imageEdit) {
            const newScale = Math.min(3, imageEdit.scale + ZOOM_STEP)
            onImageScaleChange(newScale)
          }
          break

        case "-":
          e.preventDefault()
          if (onImageScaleChange && imageEdit) {
            const newScale = Math.max(1, imageEdit.scale - ZOOM_STEP)
            onImageScaleChange(newScale)
          }
          break

        case "r":
        case "R":
          e.preventDefault()
          onResetImagePosition?.()
          break

        case "Escape":
          e.preventDefault()
          onExitImageEdit?.()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    isImageEditing,
    imageEdit,
    onImageOffsetChange,
    onImageScaleChange,
    onExitImageEdit,
    onResetImagePosition,
  ])

  // Store caret position when switching out of edit mode
  const savedCaretRef = useRef<{ lineId: string; offset: number } | null>(null)
  const lyricsContainerRef = useRef<HTMLDivElement>(null)

  // Save caret position before exiting edit mode
  const saveCaretPosition = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const container = range.startContainer

    // Find which line element contains the caret
    let element: Node | null = container
    while (element?.parentNode) {
      if (element instanceof HTMLElement && element.dataset.lineId) {
        savedCaretRef.current = {
          lineId: element.dataset.lineId,
          offset: range.startOffset,
        }
        return
      }
      element = element.parentNode
    }
  }, [])

  // Restore caret position when entering edit mode
  const restoreCaretPosition = useCallback(() => {
    if (!savedCaretRef.current || !lyricsContainerRef.current) return

    const { lineId, offset } = savedCaretRef.current
    const lineElement = lyricsContainerRef.current.querySelector(`[data-line-id="${lineId}"]`)
    if (!lineElement) return

    // Focus the element and restore caret
    const textNode = lineElement.firstChild
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const range = document.createRange()
      const selection = window.getSelection()
      if (!selection) return

      const safeOffset = Math.min(offset, textNode.textContent?.length ?? 0)
      range.setStart(textNode, safeOffset)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    } else {
      // If no text node, just focus the element
      if (lineElement instanceof HTMLElement) {
        lineElement.focus()
      }
    }
  }, [])

  // Handle edit mode changes
  useEffect(() => {
    if (isEditing) {
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        restoreCaretPosition()
      })
    } else {
      saveCaretPosition()
    }
  }, [isEditing, saveCaretPosition, restoreCaretPosition])

  // -------------------------------------------------------------------------
  // Background Rendering
  // -------------------------------------------------------------------------

  const backgroundStyle = useMemo((): React.CSSProperties => {
    switch (background.type) {
      case "solid":
        return { background: background.color }

      case "gradient":
        return { background: background.gradient }

      case "albumArt":
        // Album art is now rendered as a separate img element for export compatibility
        // Just use a fallback color here
        return { background: "#1a1a2e" }

      case "pattern":
        return { background: background.baseColor }

      default:
        return { background: "#1a1a2e" }
    }
  }, [background])

  // Album art background layer - rendered as img element for CSS filter support in export
  const albumArtBackgroundLayer = useMemo(() => {
    if (background.type !== "albumArt" || !albumArt) return null

    // Apply offset and scale transforms
    const scale = imageEdit?.scale ?? 1
    const offsetX = imageEdit?.offsetX ?? 0
    const offsetY = imageEdit?.offsetY ?? 0

    // Calculate transform for position and scale
    // offset of 0 = center, offset of -100/+100 = move by 50% of container
    const translateX = offsetX * 0.5
    const translateY = offsetY * 0.5

    // Build CSS filter string from effect settings
    // This applies directly to the img element so it works in canvas export
    let filterString = ""

    // Add background blur if configured
    if (background.blur > 0) {
      filterString += `blur(${background.blur}px) `
    }

    // Add album art effect filters
    if (albumArtEffect && albumArtEffect.effect !== "none") {
      const effectStyles = applyEffect(albumArtEffect.effect, albumArtEffect.settings)
      if (effectStyles.filter) {
        filterString += effectStyles.filter
      }
    }

    return (
      <img
        src={albumArt}
        alt=""
        crossOrigin="anonymous"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: `${100 * scale}%`,
          height: `${100 * scale}%`,
          objectFit: "cover",
          transform: `translate(calc(-50% + ${translateX}%), calc(-50% + ${translateY}%))`,
          filter: filterString || undefined,
          pointerEvents: "none",
        }}
      />
    )
  }, [background, albumArt, imageEdit, albumArtEffect])

  // Pattern overlay for pattern backgrounds (when background.type is "pattern")
  const backgroundPatternOverlay = useMemo(() => {
    if (background.type !== "pattern" || background.pattern === "none") {
      return null
    }

    if (background.pattern === "waves") {
      const paths = generateSmokeWaves(background.patternSeed)
      const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`
      const dataUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: dataUrl,
            backgroundSize: "100% 100%",
            pointerEvents: "none",
          }}
        />
      )
    }

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          ...getPatternStyle(background.pattern),
          pointerEvents: "none",
        }}
      />
    )
  }, [background])

  // Compact pattern overlay (renders pattern on top of any background type)
  const compactPatternOverlayElement = useMemo(() => {
    if (!patternOverlay || patternOverlay.pattern === "none") {
      return null
    }

    if (patternOverlay.pattern === "waves") {
      const paths = generateSmokeWaves(patternOverlay.seed)
      const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`
      const dataUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: dataUrl,
            backgroundSize: "100% 100%",
            pointerEvents: "none",
          }}
        />
      )
    }

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          ...getPatternStyle(patternOverlay.pattern),
          pointerEvents: "none",
        }}
      />
    )
  }, [patternOverlay])

  // Album art color overlay (blur is now applied directly to the img element)
  const albumArtOverlay = useMemo(() => {
    if (background.type !== "albumArt") return null

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: background.overlayColor,
          opacity: background.overlayOpacity,
          pointerEvents: "none",
        }}
      />
    )
  }, [background])

  // Album art effect overlay (from effects system)
  // Note: CSS filters (blur, grayscale, brightness, contrast) are applied directly
  // to the album art img element for export compatibility. Only overlay-based effects
  // (vignette, tint, gradient, duotone color layers) are rendered here.
  const albumArtEffectOverlay = useMemo(() => {
    if (background.type !== "albumArt" || !albumArtEffect) return null
    if (albumArtEffect.effect === "none") return null

    const effectStyles = applyEffect(albumArtEffect.effect, albumArtEffect.settings)

    // Only render overlays - filters are applied to the img element directly
    const hasOverlays = effectStyles.overlay || effectStyles.secondaryOverlay
    if (!hasOverlays) return null

    return (
      <>
        {/* Primary overlay (vignette, tint, gradient, duotone shadow) */}
        {effectStyles.overlay && <div style={effectStyles.overlay} />}
        {/* Secondary overlay (duotone highlight) */}
        {effectStyles.secondaryOverlay && <div style={effectStyles.secondaryOverlay} />}
      </>
    )
  }, [background.type, albumArtEffect])

  // -------------------------------------------------------------------------
  // Spotify Code URL
  // -------------------------------------------------------------------------

  const spotifyCodeUrl = useMemo(() => {
    if (!spotifyId) return null
    return `https://scannables.scdn.co/uri/plain/png/000000/white/280/spotify:track:${spotifyId}`
  }, [spotifyId])

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  const cardShadow = effects.shadow.enabled
    ? `0 ${effects.shadow.offsetY}px ${effects.shadow.blur}px ${effects.shadow.spread}px ${effects.shadow.color}`
    : "none"

  const cardBorder = effects.border.enabled
    ? `${effects.border.width}px solid ${effects.border.color}`
    : "none"

  const vignetteOverlay = effects.vignette.enabled ? (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,${effects.vignette.intensity}) 100%)`,
        pointerEvents: "none",
        borderRadius: effects.border.radius,
      }}
    />
  ) : null

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasFooter =
    (brandingElement.visible && brandingElement.opacity > 0) ||
    (spotifyCodeElement.visible && spotifyCodeElement.opacity > 0 && spotifyCodeUrl)

  return (
    <div
      ref={previewRef}
      style={{
        padding: effects.shadow.enabled
          ? `16px 16px ${effects.shadow.offsetY + effects.shadow.blur}px 16px`
          : "0",
        background: "transparent",
      }}
    >
      <div
        ref={el => {
          cardElementRef.current = el
          if (cardRef && "current" in cardRef) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el
          }
        }}
        onPointerDown={isImageEditing ? handlePointerDown : undefined}
        onPointerMove={isImageEditing ? handlePointerMove : undefined}
        onPointerUp={isImageEditing ? handlePointerUp : undefined}
        onPointerCancel={isImageEditing ? handlePointerUp : undefined}
        onTouchStart={isImageEditing ? handleTouchStart : undefined}
        onTouchMove={isImageEditing ? handleTouchMove : undefined}
        onTouchEnd={isImageEditing ? handleTouchEnd : undefined}
        onTouchCancel={isImageEditing ? handleTouchEnd : undefined}
        onWheel={isImageEditing ? handleWheel : undefined}
        style={{
          ...cardBaseStyles,
          ...backgroundStyle,
          borderRadius: effects.border.radius,
          padding: `${padding}px`,
          boxShadow: cardShadow,
          border: cardBorder,
          position: "relative",
          overflow: "hidden",
          fontFamily: getFontFamily(typography.fontFamily),
          cursor: isImageEditing ? (isDragging ? "grabbing" : "grab") : undefined,
          touchAction: isImageEditing ? "none" : undefined,
          userSelect: isImageEditing ? "none" : undefined,
        }}
      >
        {/* Album art background layer - rendered as img for export compatibility */}
        {albumArtBackgroundLayer}
        {/* Background overlays */}
        {backgroundPatternOverlay}
        {compactPatternOverlayElement}
        {albumArtOverlay}
        {albumArtEffectOverlay}
        {vignetteOverlay}

        {/* Image edit mode border indicator */}
        {isImageEditing && (
          <div
            className="image-edit-border"
            style={{
              position: "absolute",
              inset: 4,
              border: "2px dashed rgba(255,255,255,0.6)",
              borderRadius: Math.max(0, effects.border.radius - 4),
              pointerEvents: "none",
            }}
          />
        )}

        {/* Content */}
        <div style={{ position: "relative" }}>
          {/* Header: Album Art + Metadata */}
          {(albumArtElement.visible || metadataElement.visible) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "16px",
                flexDirection: isRTL ? "row-reverse" : "row",
              }}
            >
              {/* Album Art */}
              {albumArtElement.visible && (
                <div
                  style={{
                    width: `${albumArtElement.size}px`,
                    height: `${albumArtElement.size}px`,
                    borderRadius: getShapeBorderRadius(albumArtElement.shape, albumArtElement.size),
                    overflow: "hidden",
                    flexShrink: 0,
                    backgroundColor: "rgba(0,0,0,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: albumArtElement.opacity,
                  }}
                >
                  {albumArt ? (
                    <img
                      src={albumArt}
                      alt=""
                      crossOrigin="anonymous"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <MusicNote
                      size={albumArtElement.size * 0.5}
                      weight="fill"
                      style={{ color: "rgba(255,255,255,0.6)" }}
                    />
                  )}
                </div>
              )}

              {/* Metadata */}
              {metadataElement.visible && (
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: isRTL ? "right" : "left",
                    opacity: metadataElement.opacity,
                  }}
                >
                  {metadataElement.showTitle && (
                    <p
                      style={{
                        fontSize: `${metadataElement.fontSize}px`,
                        fontWeight: 600,
                        color: metadataElement.color,
                        margin: 0,
                        wordBreak: "break-word",
                      }}
                    >
                      {title}
                    </p>
                  )}
                  {metadataElement.showArtist && (
                    <p
                      style={{
                        fontSize: `${metadataElement.fontSize}px`,
                        color: metadataElement.color,
                        opacity: 0.7,
                        margin: 0,
                        wordBreak: "break-word",
                      }}
                    >
                      {artist}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lyrics */}
          {lyricsElement.visible && lyrics.selectedLines.length > 0 && (
            <div
              ref={lyricsContainerRef}
              style={{
                marginBottom: hasFooter ? "16px" : 0,
                textAlign: typography.alignment,
                direction: isRTL ? "rtl" : "ltr",
                opacity: lyricsElement.opacity,
                maxWidth:
                  lyricsElement.wrapText && lyricsElement.maxWidth
                    ? `${lyricsElement.maxWidth}px`
                    : undefined,
              }}
            >
              {lyrics.selectedLines.map(line => (
                <p
                  key={line.id}
                  data-line-id={line.id}
                  contentEditable={isEditing}
                  suppressContentEditableWarning
                  onBlur={e => {
                    if (isEditing && onTextChange) {
                      // Use innerText to preserve line breaks from Enter key
                      const newText = e.currentTarget.innerText ?? ""
                      onTextChange(line.id, newText)
                    }
                  }}
                  style={{
                    fontSize: `${typography.fontSize}px`,
                    fontWeight: typography.fontWeight,
                    lineHeight: typography.lineHeight,
                    letterSpacing: `${typography.letterSpacing}px`,
                    color: typography.color,
                    margin: "4px 0",
                    whiteSpace: lyricsElement.wrapText ? "pre-line" : "nowrap",
                    textShadow: typography.textShadow ? "0 2px 4px rgba(0,0,0,0.3)" : "none",
                    outline: "none",
                    cursor: isEditing ? "text" : "default",
                    minWidth: isEditing ? "20px" : undefined,
                    textDecoration: isEditing ? "underline" : "none",
                    textDecorationStyle: isEditing ? "dashed" : undefined,
                    textDecorationColor: isEditing ? "rgba(255,255,255,0.5)" : undefined,
                    textUnderlineOffset: isEditing ? "4px" : undefined,
                    caretColor: isEditing ? "white" : undefined,
                    // Allow text selection even when image editing is active
                    userSelect: isEditing ? "text" : undefined,
                  }}
                >
                  {getDisplayText(line.id)}
                </p>
              ))}
            </div>
          )}

          {/* Footer: Branding + Spotify Code */}
          {hasFooter && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              {brandingElement.visible && (
                <p
                  style={{
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.5)",
                    margin: 0,
                    opacity: brandingElement.opacity,
                  }}
                >
                  {brandingElement.showEmoji && "❤️ "}
                  {brandingElement.text}
                </p>
              )}
              {spotifyCodeElement.visible && spotifyCodeUrl && (
                <img
                  src={spotifyCodeUrl}
                  alt="Spotify Code"
                  crossOrigin="anonymous"
                  style={{
                    height: `${spotifyCodeElement.size}px`,
                    opacity: spotifyCodeElement.opacity,
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        .image-edit-border {
          animation: borderPulse 1.5s ease-in-out infinite;
        }
        @keyframes borderPulse {
          0%,
          100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
})
