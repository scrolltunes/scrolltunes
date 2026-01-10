"use client"

import { MusicNote } from "@phosphor-icons/react"
import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import type {
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
  readonly getDisplayText: (lineId: string) => string
  readonly previewRef?: React.RefObject<HTMLDivElement | null>
  readonly cardRef?: React.RefObject<HTMLDivElement | null>
  readonly isEditing?: boolean
  readonly onTextChange?: (lineId: string, text: string) => void
  readonly isImageEditing?: boolean
  readonly imageEdit?: ImageEditState
  readonly onImageOffsetChange?: (offsetX: number, offsetY: number) => void
  readonly onImageScaleChange?: (scale: number) => void
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
  getDisplayText,
  previewRef,
  cardRef,
  isEditing = false,
  onTextChange,
  isImageEditing = false,
  imageEdit,
  onImageOffsetChange,
  onImageScaleChange,
}: ShareDesignerPreviewProps) {
  const isRTL = lyrics.direction === "rtl"

  // Drag state for image panning
  const isDraggingRef = useRef(false)
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

      e.preventDefault()
      isDraggingRef.current = true
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
      const scale = imageEdit.scale
      const offsetDeltaX = ((deltaX / rect.width) * 100) / scale
      const offsetDeltaY = ((deltaY / rect.height) * 100) / scale

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

          // Calculate new scale, clamped to 1.0-3.0 range
          const newScale = Math.max(1, Math.min(3, initialScaleRef.current * scaleFactor))
          onImageScaleChange(newScale)
        }
      }
    },
    [onImageScaleChange, imageEdit, getTouchDistance],
  )

  // Handle touch end for pinch-to-zoom
  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    // End pinch when less than 2 fingers remain
    if (e.touches.length < 2) {
      isPinchingRef.current = false
    }
  }, [])

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

      case "albumArt": {
        // Apply offset and scale transforms when image edit state is available
        const scale = imageEdit?.scale ?? 1
        const offsetX = imageEdit?.offsetX ?? 0
        const offsetY = imageEdit?.offsetY ?? 0

        // Calculate background position based on offset
        // offset of 0 = center (50%), offset of -100 = 0%, offset of 100 = 100%
        const posX = 50 + offsetX * 0.5
        const posY = 50 + offsetY * 0.5

        // Scale the background size (100% * scale)
        const sizePercent = 100 * scale

        return {
          background: albumArt ? `url(${albumArt})` : "#1a1a2e",
          backgroundSize: `${sizePercent}%`,
          backgroundPosition: `${posX}% ${posY}%`,
        }
      }

      case "pattern":
        return { background: background.baseColor }

      default:
        return { background: "#1a1a2e" }
    }
  }, [background, albumArt, imageEdit])

  // Pattern overlay for pattern backgrounds
  const patternOverlay = useMemo(() => {
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

  // Album art blur overlay
  const albumArtOverlay = useMemo(() => {
    if (background.type !== "albumArt") return null

    return (
      <>
        {/* Blur filter */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backdropFilter: `blur(${background.blur}px)`,
            WebkitBackdropFilter: `blur(${background.blur}px)`,
            pointerEvents: "none",
          }}
        />
        {/* Color overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: background.overlayColor,
            opacity: background.overlayOpacity,
            pointerEvents: "none",
          }}
        />
      </>
    )
  }, [background])

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
          cursor: isImageEditing ? "grab" : undefined,
          touchAction: isImageEditing ? "none" : undefined,
          userSelect: isImageEditing ? "none" : undefined,
        }}
      >
        {/* Background overlays */}
        {patternOverlay}
        {albumArtOverlay}
        {vignetteOverlay}

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
                      const newText = e.currentTarget.textContent ?? ""
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
                    whiteSpace: lyricsElement.wrapText ? "normal" : "nowrap",
                    textShadow: typography.textShadow ? "0 2px 4px rgba(0,0,0,0.3)" : "none",
                    outline: "none",
                    cursor: isEditing ? "text" : "default",
                    minWidth: isEditing ? "20px" : undefined,
                    textDecoration: isEditing ? "underline" : "none",
                    textDecorationStyle: isEditing ? "dashed" : undefined,
                    textDecorationColor: isEditing ? "rgba(255,255,255,0.5)" : undefined,
                    textUnderlineOffset: isEditing ? "4px" : undefined,
                    caretColor: isEditing ? "white" : undefined,
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
    </div>
  )
})
