"use client"

import { motion, useMotionValue, useTransform, type PanInfo } from "motion/react"
import { memo, useCallback, useEffect, useRef, useState } from "react"

type SheetState = "peek" | "half" | "full"

interface BottomSheetProps {
  readonly children: React.ReactNode
  readonly peekHeight?: number
  readonly halfHeight?: number
  readonly fullHeight?: number
  readonly state: SheetState
  readonly onStateChange: (state: SheetState) => void
}

export const BottomSheet = memo(function BottomSheet({
  children,
  peekHeight = 200,
  halfHeight = 0.5,
  fullHeight = 0.85,
  state,
  onStateChange,
}: BottomSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [windowHeight, setWindowHeight] = useState(0)

  useEffect(() => {
    const updateHeight = () => setWindowHeight(window.innerHeight)
    updateHeight()
    window.addEventListener("resize", updateHeight)
    return () => window.removeEventListener("resize", updateHeight)
  }, [])

  const getHeightForState = useCallback(
    (s: SheetState): number => {
      switch (s) {
        case "peek":
          return peekHeight
        case "half":
          return windowHeight * halfHeight
        case "full":
          return windowHeight * fullHeight
      }
    },
    [peekHeight, halfHeight, fullHeight, windowHeight],
  )

  const currentHeight = getHeightForState(state)
  const y = useMotionValue(0)

  // Calculate opacity for backdrop based on sheet position
  const backdropOpacity = useTransform(y, [-windowHeight * 0.3, 0], [0.4, 0])

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const velocity = info.velocity.y
      const offset = info.offset.y

      // Velocity-based detection
      if (Math.abs(velocity) > 500) {
        if (velocity < 0) {
          // Swiping up
          onStateChange(state === "peek" ? "half" : "full")
        } else {
          // Swiping down
          onStateChange(state === "full" ? "half" : "peek")
        }
        return
      }

      // Offset-based detection
      const threshold = 50
      if (offset < -threshold) {
        onStateChange(state === "peek" ? "half" : "full")
      } else if (offset > threshold) {
        onStateChange(state === "full" ? "half" : "peek")
      }
    },
    [state, onStateChange],
  )

  if (windowHeight === 0) return null

  return (
    <>
      {/* Backdrop (only visible when expanded) */}
      {state === "full" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-30 bg-black"
          onClick={() => onStateChange("half")}
          style={{ opacity: backdropOpacity }}
        />
      )}

      {/* Sheet */}
      <motion.div
        ref={containerRef}
        className="fixed bottom-0 left-0 right-0 z-40 flex flex-col overflow-hidden rounded-t-2xl"
        style={{
          background: "var(--color-surface1)",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
          height: currentHeight,
          y,
        }}
        animate={{ height: currentHeight }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
      >
        {/* Drag handle */}
        <div className="flex shrink-0 items-center justify-center py-3">
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: "var(--color-surface3)" }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      </motion.div>
    </>
  )
})
