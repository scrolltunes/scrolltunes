"use client"

import { AnimatePresence, motion } from "motion/react"
import { memo } from "react"

import { TransposeControl } from "./TransposeControl"

export interface ChordInfoPanelProps {
  readonly isOpen: boolean
  readonly tuning?: string
  readonly musicalKey?: string
  readonly capo?: number
  readonly transpose: number
  readonly onTransposeChange: (value: number) => void
}

export const ChordInfoPanel = memo(function ChordInfoPanel({
  isOpen,
  tuning,
  musicalKey,
  capo,
  transpose,
  onTransposeChange,
}: ChordInfoPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute left-0 right-0 z-30 bg-neutral-900/95 backdrop-blur-lg border-b border-neutral-800 shadow-lg"
        >
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {/* Tuning */}
              {tuning && <span className="text-sm text-neutral-300 font-medium">{tuning}</span>}

              {/* Key */}
              {musicalKey && (
                <span className="text-sm text-neutral-400">
                  Key: <span className="text-neutral-200 font-medium">{musicalKey}</span>
                </span>
              )}

              {/* Capo */}
              <span className="text-sm text-neutral-400">
                {capo !== undefined && capo > 0 ? (
                  <>
                    Capo: <span className="text-neutral-200 font-medium">{capo}</span>
                  </>
                ) : (
                  "No capo"
                )}
              </span>

              {/* Separator */}
              <div className="w-px h-5 bg-neutral-700 shrink-0" />

              {/* Transpose */}
              <TransposeControl value={transpose} onChange={onTransposeChange} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
