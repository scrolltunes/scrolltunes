"use client"

import { AnimatePresence, motion } from "motion/react"
import { memo } from "react"

import { springs } from "@/animations"
import { ChordDiagram } from "./ChordDiagram"

export interface ChordHintOverlayProps {
  readonly chord: string
  readonly isVisible: boolean
  readonly position?: { x: number; y: number }
}

export const ChordHintOverlay = memo(function ChordHintOverlay({
  chord,
  isVisible,
  position,
}: ChordHintOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={springs.snap}
          className="absolute z-50"
          style={
            position
              ? { left: position.x, top: position.y }
              : { left: "50%", transform: "translateX(-50%)" }
          }
        >
          <div className="relative mt-2">
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-0 w-0 border-x-[6px] border-b-[6px] border-x-transparent border-b-white" />
            <div className="rounded-lg bg-white p-2 shadow-lg">
              <ChordDiagram chord={chord} size="sm" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
