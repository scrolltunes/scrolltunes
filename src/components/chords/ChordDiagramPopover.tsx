"use client"

import { X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef } from "react"

import { springs } from "@/animations"

import { ChordDiagram } from "./ChordDiagram"

export interface ChordDiagramPopoverProps {
  readonly chord: string
  readonly isOpen: boolean
  readonly onClose: () => void
}

export function ChordDiagramPopover({ chord, isOpen, onClose }: ChordDiagramPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden="true"
          />
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={springs.snap}
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chord-diagram-title"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="chord-diagram-title" className="text-lg font-semibold text-white">
                {chord}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                aria-label="Close chord diagram"
              >
                <X size={20} weight="bold" />
              </button>
            </div>
            <div className="flex flex-col items-center justify-center py-2">
              <ChordDiagram chord={chord} size="lg" showPositionSelector />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
