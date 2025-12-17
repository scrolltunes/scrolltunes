"use client"

import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useRef, useState } from "react"

import { springs } from "@/animations"
import { useIsMobile } from "@/hooks/useMediaQuery"

import { ChordBadge } from "./ChordBadge"
import { ChordDiagram } from "./ChordDiagram"

export interface InteractiveChordBadgeProps {
  readonly chord: string
  readonly size?: "sm" | "md"
  readonly isActive?: boolean
}

export const InteractiveChordBadge = memo(function InteractiveChordBadge({
  chord,
  size = "sm",
  isActive = false,
}: InteractiveChordBadgeProps) {
  const [isOverlayVisible, setIsOverlayVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const showOverlay = useCallback(() => setIsOverlayVisible(true), [])
  const hideOverlay = useCallback(() => setIsOverlayVisible(false), [])
  const toggleOverlay = useCallback(() => setIsOverlayVisible(prev => !prev), [])

  useEffect(() => {
    if (!isOverlayVisible || isMobile) return

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        hideOverlay()
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        hideOverlay()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOverlayVisible, isMobile, hideOverlay])

  const mobileHandlers = isMobile
    ? {
        onTouchStart: showOverlay,
        onTouchEnd: hideOverlay,
        onTouchCancel: hideOverlay,
      }
    : {}

  return (
    <div ref={containerRef} className="relative inline-block">
      <div {...mobileHandlers} onContextMenu={isMobile ? e => e.preventDefault() : undefined}>
        <ChordBadge
          chord={chord}
          size={size}
          isActive={isActive}
          {...(isMobile ? {} : { onClick: toggleOverlay })}
        />
      </div>
      <AnimatePresence>
        {isOverlayVisible && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={springs.snap}
            className="absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl"
            role="tooltip"
            aria-label={`Chord diagram for ${chord}`}
          >
            <ChordDiagram chord={chord} size="md" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
