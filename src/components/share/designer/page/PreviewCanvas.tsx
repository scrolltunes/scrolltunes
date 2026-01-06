"use client"

import { ArrowsIn, ArrowsOut, Check, PencilSimple } from "@phosphor-icons/react"
import { memo, useCallback, useEffect, useLayoutEffect, useState } from "react"

interface PreviewCanvasProps {
  readonly children: React.ReactNode
  readonly cardRef: React.RefObject<HTMLDivElement | null>
  readonly isEditing: boolean
  readonly expandedWidth: boolean
  readonly onEditToggle: () => void
  readonly onWidthToggle: () => void
  readonly hasShadow?: boolean
}

export const PreviewCanvas = memo(function PreviewCanvas({
  children,
  cardRef,
  isEditing,
  expandedWidth,
  onEditToggle,
  onWidthToggle,
  hasShadow = true,
}: PreviewCanvasProps) {
  const [previewScale, setPreviewScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState<number | null>(null)
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null)

  const calculateScale = useCallback(() => {
    if (!containerRef || !cardRef.current) return

    const availableWidth = containerRef.clientWidth * 0.92
    const cardWidth = cardRef.current.scrollWidth
    const cardHeight = cardRef.current.scrollHeight

    if (cardWidth > availableWidth) {
      const scale = Math.max(0.5, availableWidth / cardWidth)
      const roundedScale = Math.round(scale * 1000) / 1000
      setPreviewScale(roundedScale)
      setScaledHeight(Math.round(cardHeight * roundedScale))
    } else {
      setPreviewScale(1)
      setScaledHeight(null)
    }
  }, [containerRef, cardRef])

  useLayoutEffect(() => {
    calculateScale()
  }, [calculateScale, expandedWidth])

  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const observer = new ResizeObserver(() => calculateScale())
    observer.observe(card)
    window.addEventListener("resize", calculateScale)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", calculateScale)
    }
  }, [calculateScale, cardRef])

  return (
    <div
      ref={setContainerRef}
      className="relative flex-1 rounded-2xl p-4 lg:p-6"
      style={{ background: "#1a1a1a" }}
    >
      {/* Floating action buttons */}
      <div className="absolute left-3 top-3 z-10 flex gap-1 lg:left-4 lg:top-4">
        <button
          type="button"
          onClick={onEditToggle}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors lg:h-9 lg:w-9"
          style={{
            background: isEditing ? "var(--color-accent)" : "rgba(0,0,0,0.5)",
            color: isEditing ? "white" : "rgba(255,255,255,0.8)",
          }}
          aria-label={isEditing ? "Done editing" : "Edit text"}
        >
          {isEditing ? (
            <Check size={18} weight="bold" />
          ) : (
            <PencilSimple size={18} weight="bold" />
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onWidthToggle}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors lg:right-4 lg:top-4 lg:h-9 lg:w-9"
        style={{ background: "rgba(0,0,0,0.5)", color: "rgba(255,255,255,0.8)" }}
        aria-label={expandedWidth ? "Shrink width" : "Expand width"}
      >
        {expandedWidth ? (
          <ArrowsIn size={18} weight="bold" />
        ) : (
          <ArrowsOut size={18} weight="bold" />
        )}
      </button>

      {/* Card preview with scaling */}
      <div
        className="flex items-center justify-center"
        style={{
          minHeight: scaledHeight !== null ? `${scaledHeight}px` : "200px",
          marginBottom: hasShadow ? "-24px" : "0",
        }}
      >
        <div
          style={{
            transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
            transformOrigin: "top center",
            maxWidth: expandedWidth ? "600px" : "384px",
            width: "100%",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
})
