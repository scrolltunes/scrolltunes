"use client"

import { springs } from "@/animations"
import { Microphone, MicrophoneSlash, Waveform } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useMemo } from "react"

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

const CONCENTRIC_RING_COUNT = 3
const LEVEL_DOT_COUNT = 8

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
    transition-colors
    focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
    ${sizeClasses[size]}
    ${permissionDenied ? "cursor-not-allowed opacity-60" : "cursor-pointer"}
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

  const getTooltip = () => {
    if (permissionDenied) return "Microphone blocked – enable in browser settings"
    if (isSpeaking) return "Voice detected"
    if (isListening) return "Listening for voice"
    return "Start voice detection"
  }

  const iconSize = iconSizes[size]

  const levelDots = useMemo(() => {
    return Array.from({ length: LEVEL_DOT_COUNT }, (_, i) => {
      const angle = (i / LEVEL_DOT_COUNT) * 2 * Math.PI - Math.PI / 2
      return { angle, index: i }
    })
  }, [])

  const concentricRings = useMemo(() => {
    return Array.from({ length: CONCENTRIC_RING_COUNT }, (_, i) => i)
  }, [])

  return (
    <motion.button
      type="button"
      onClick={permissionDenied ? undefined : onToggle}
      disabled={permissionDenied}
      className={`${baseClasses} ${getBackgroundColor()}`}
      whileHover={permissionDenied ? {} : { scale: 1.05 }}
      whileTap={permissionDenied ? {} : { scale: 0.95 }}
      title={getTooltip()}
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
      {/* Activation flash when starting to listen */}
      <AnimatePresence>
        {isListening && !permissionDenied && (
          <motion.div
            className="absolute inset-0 rounded-full bg-indigo-400"
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Ready glow effect when listening (not speaking) */}
      <AnimatePresence>
        {isListening && !isSpeaking && !permissionDenied && (
          <motion.div
            className="absolute inset-[-4px] rounded-full bg-indigo-500/20"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0.2, 0.4, 0.2],
              scale: [1, 1.05, 1],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 3,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
        )}
      </AnimatePresence>

      {/* Organic breathing pulse when listening */}
      <AnimatePresence>
        {isListening && !isSpeaking && !permissionDenied && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-indigo-500/40"
            initial={{ scale: 1, opacity: 0 }}
            animate={{
              scale: [1, 1.2, 1.15, 1.25, 1],
              opacity: [0.4, 0.2, 0.3, 0.1, 0.4],
            }}
            exit={{ opacity: 0, scale: 1 }}
            transition={{
              duration: 4,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
        )}
      </AnimatePresence>

      {/* Multiple concentric rings when speaking */}
      <AnimatePresence>
        {isSpeaking &&
          concentricRings.map(ringIndex => (
            <motion.div
              key={`ring-${ringIndex}`}
              className="absolute inset-0 rounded-full border-2 border-green-500"
              initial={{ scale: 1, opacity: 0 }}
              animate={{
                scale: 1 + level * 0.3 + ringIndex * 0.15,
                opacity: Math.max(0, (0.6 - ringIndex * 0.15) * (0.5 + level * 0.5)),
              }}
              exit={{ scale: 1, opacity: 0 }}
              transition={{
                ...springs.snap,
                delay: ringIndex * 0.05,
              }}
            />
          ))}
      </AnimatePresence>

      {/* Level indicator dots around the icon */}
      <AnimatePresence>
        {isListening && !permissionDenied && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {levelDots.map(({ angle, index }) => {
              const dotThreshold = index / LEVEL_DOT_COUNT
              const isActive = isSpeaking && level > dotThreshold
              const radius = size === "sm" ? 22 : size === "md" ? 30 : 42
              const x = Math.cos(angle) * radius
              const y = Math.sin(angle) * radius

              return (
                <motion.div
                  key={`dot-${index}`}
                  className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                  style={{
                    x: x - 3,
                    y: y - 3,
                  }}
                  animate={{
                    backgroundColor: isActive ? "rgb(34 197 94)" : "rgb(99 102 241 / 0.3)",
                    scale: isActive ? 1 + level * 0.5 : 0.8,
                  }}
                  transition={springs.snap}
                />
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Icon with smooth transitions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={permissionDenied ? "denied" : isSpeaking ? "speaking" : "idle"}
          className={getIconColor()}
          initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
          animate={{
            scale: isSpeaking ? 1 + level * 0.2 : 1,
            opacity: 1,
            rotate: 0,
          }}
          exit={{ scale: 0.8, opacity: 0, rotate: 10 }}
          transition={springs.default}
        >
          {permissionDenied ? (
            <MicrophoneSlash size={iconSize} weight="fill" />
          ) : isSpeaking ? (
            <Waveform size={iconSize} weight="fill" />
          ) : (
            <Microphone size={iconSize} weight={isListening ? "fill" : "regular"} />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  )
})
