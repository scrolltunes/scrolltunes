"use client"

import { springs, timing } from "@/animations"
import { AnimatePresence, motion } from "motion/react"
import { memo } from "react"

export interface LiveTranscriptPreviewProps {
  readonly partialTranscript: string
  readonly finalTranscript: string | null
  readonly detectedLanguageCode: string | null
  readonly isRecording: boolean
  readonly className?: string
}

export const LiveTranscriptPreview = memo(function LiveTranscriptPreview({
  partialTranscript,
  finalTranscript,
  detectedLanguageCode,
  isRecording,
  className = "",
}: LiveTranscriptPreviewProps) {
  const displayText = finalTranscript ?? partialTranscript

  if (!displayText && !isRecording) {
    return null
  }

  return (
    <motion.div
      className={`mt-2 flex items-center justify-between text-sm text-neutral-300 ${className}`}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={springs.default}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={displayText}
          className="truncate"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
          }}
          exit={{ opacity: 0 }}
          transition={springs.default}
        >
          {displayText}
        </motion.span>
      </AnimatePresence>

      <AnimatePresence>
        {isRecording && (
          <motion.span
            className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-red-500"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0.4, 1, 0.4],
              scale: 1,
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{
              opacity: {
                duration: timing.pulse.duration,
                repeat: timing.pulse.repeat,
                ease: timing.pulse.ease,
              },
              scale: springs.snap,
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detectedLanguageCode && (
          <motion.span
            className="ml-2 shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
            initial={{ opacity: 0, scale: 0.8, x: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 8 }}
            transition={springs.snap}
          >
            {detectedLanguageCode}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
