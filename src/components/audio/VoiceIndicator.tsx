"use client"

import { springs } from "@/animations"
import { Microphone, MicrophoneSlash, Waveform } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo } from "react"

export interface VoiceIndicatorProps {
  /** Whether currently listening for voice */
  readonly isListening: boolean
  /** Whether voice is currently detected */
  readonly isSpeaking: boolean
  /** Current audio level (0-1) */
  readonly level: number
  /** Permission was denied */
  readonly permissionDenied?: boolean
  /** Click handler to toggle listening */
  readonly onToggle?: () => void
  /** Size variant */
  readonly size?: "sm" | "md" | "lg"
}

const sizeClasses = {
  sm: "w-10 h-10",
  md: "w-14 h-14",
  lg: "w-20 h-20",
}

const iconSizes = {
  sm: 20,
  md: 28,
  lg: 40,
}

/**
 * Visual indicator for voice activity detection state
 *
 * Shows microphone icon with pulsing animation when listening,
 * waveform animation when speaking, and error state for permission denied.
 */
export const VoiceIndicator = memo(function VoiceIndicator({
  isListening,
  isSpeaking,
  level,
  permissionDenied = false,
  onToggle,
  size = "md",
}: VoiceIndicatorProps) {
  const baseClasses = `
    relative flex items-center justify-center rounded-full
    transition-colors cursor-pointer
    focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
    ${sizeClasses[size]}
  `

  const getBackgroundColor = () => {
    if (permissionDenied) return "bg-red-500/20"
    if (isSpeaking) return "bg-green-500/20"
    if (isListening) return "bg-indigo-500/20"
    return "bg-neutral-800"
  }

  const getIconColor = () => {
    if (permissionDenied) return "text-red-400"
    if (isSpeaking) return "text-green-400"
    if (isListening) return "text-indigo-400"
    return "text-neutral-500"
  }

  const iconSize = iconSizes[size]

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      className={`${baseClasses} ${getBackgroundColor()}`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={
        permissionDenied
          ? "Microphone permission denied"
          : isListening
            ? isSpeaking
              ? "Voice detected"
              : "Listening for voice"
            : "Start voice detection"
      }
    >
      {/* Pulsing ring when listening */}
      <AnimatePresence>
        {isListening && !permissionDenied && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-indigo-500/50"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.5, 0, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
        )}
      </AnimatePresence>

      {/* Level indicator ring when speaking */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-green-500"
            initial={{ scale: 1 }}
            animate={{
              scale: 1 + level * 0.3,
              opacity: 0.3 + level * 0.7,
            }}
            transition={springs.snap}
          />
        )}
      </AnimatePresence>

      {/* Icon */}
      <motion.div
        className={getIconColor()}
        animate={{
          scale: isSpeaking ? 1 + level * 0.2 : 1,
        }}
        transition={springs.snap}
      >
        {permissionDenied ? (
          <MicrophoneSlash size={iconSize} weight="fill" />
        ) : isSpeaking ? (
          <Waveform size={iconSize} weight="fill" />
        ) : (
          <Microphone size={iconSize} weight={isListening ? "fill" : "regular"} />
        )}
      </motion.div>
    </motion.button>
  )
})
