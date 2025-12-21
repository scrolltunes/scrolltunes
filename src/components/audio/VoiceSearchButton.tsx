"use client"

import { springs } from "@/animations"
import { CircleNotch, Microphone, MicrophoneSlash } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo } from "react"

export interface VoiceSearchButtonProps {
  readonly onClick: () => void
  readonly isRecording: boolean
  readonly isConnecting: boolean
  readonly hasError: boolean
  readonly className?: string
}

export const VoiceSearchButton = memo(function VoiceSearchButton({
  onClick,
  isRecording,
  isConnecting,
  hasError,
  className = "",
}: VoiceSearchButtonProps) {
  const getBackgroundColor = () => {
    if (hasError) return "bg-red-500/10"
    if (isRecording) return "bg-indigo-500/20"
    return "bg-neutral-800 hover:bg-neutral-700"
  }

  const getBorderColor = () => {
    if (hasError) return "border-red-500"
    if (isRecording) return "border-indigo-500"
    return "border-transparent"
  }

  const getIconColor = () => {
    if (hasError) return "text-red-400"
    if (isRecording) return "text-indigo-400"
    return "text-neutral-400"
  }

  const getAriaLabel = () => {
    if (hasError) return "Voice search error"
    if (isConnecting) return "Connecting microphone"
    if (isRecording) return "Stop voice search"
    return "Start voice search"
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isConnecting}
      className={`
        relative flex h-8 w-8 items-center justify-center rounded-full
        border transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        disabled:cursor-wait
        ${getBackgroundColor()}
        ${getBorderColor()}
        ${className}
      `}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={getAriaLabel()}
    >
      {/* Pulsing ring when recording */}
      <AnimatePresence>
        {isRecording && !hasError && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-indigo-500"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.6, 0.3, 0.6],
            }}
            exit={{ scale: 1, opacity: 0 }}
            transition={{
              duration: 1.5,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
        )}
      </AnimatePresence>

      {/* Spinner overlay when connecting */}
      <AnimatePresence>
        {isConnecting && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
              }}
            >
              <CircleNotch size={16} className="text-neutral-400" weight="bold" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Icon */}
      <motion.div
        className={getIconColor()}
        animate={{
          scale: isRecording ? 1.05 : 1,
          opacity: isConnecting ? 0.3 : 1,
        }}
        transition={springs.snap}
      >
        {hasError ? (
          <MicrophoneSlash size={16} weight="fill" />
        ) : (
          <Microphone size={16} weight={isRecording ? "fill" : "regular"} />
        )}
      </motion.div>
    </motion.button>
  )
})
