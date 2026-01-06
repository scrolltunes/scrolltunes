"use client"

import { useActivationState } from "@/audio/activation"
import { usePreference } from "@/core"
import { motion } from "motion/react"
import { memo } from "react"

/**
 * Debug indicator for singing detection mode
 * Shows the current singing probability when debug mode is enabled in settings
 */
export const SingingDebugIndicator = memo(function SingingDebugIndicator() {
  const activationMode = usePreference("activationMode")
  const singingConfig = usePreference("singingDetectorConfig")
  const activationState = useActivationState()

  // Only show in singing mode with debug enabled
  if (activationMode !== "singing" || !singingConfig.debug) {
    return null
  }

  // Only show when listening
  if (!activationState.isListening) {
    return null
  }

  const pSinging = activationState.lastProbability?.pSinging ?? 0
  const pSpeech = activationState.lastProbability?.pSpeech

  // Color based on probability (red -> yellow -> green)
  const getColor = (p: number) => {
    if (p >= 0.9) return "text-green-400"
    if (p >= 0.6) return "text-yellow-400"
    if (p >= 0.3) return "text-orange-400"
    return "text-red-400"
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="fixed bottom-20 left-4 z-50 font-mono text-xs px-3 py-2 rounded-lg backdrop-blur-sm"
      style={{ background: "rgba(0, 0, 0, 0.7)" }}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">Singing:</span>
          <span className={getColor(pSinging)}>{(pSinging * 100).toFixed(0)}%</span>
          <motion.div
            className="h-1 rounded-full bg-neutral-700 w-16"
            style={{ overflow: "hidden" }}
          >
            <motion.div
              className={`h-full ${pSinging >= 0.9 ? "bg-green-500" : pSinging >= 0.6 ? "bg-yellow-500" : "bg-red-500"}`}
              animate={{ width: `${pSinging * 100}%` }}
              transition={{ duration: 0.1 }}
            />
          </motion.div>
        </div>
        {pSpeech !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">Speech:</span>
            <span className="text-neutral-300">{(pSpeech * 100).toFixed(0)}%</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">State:</span>
          <span
            className={
              activationState.isSinging
                ? "text-green-400"
                : activationState.detectorState === "listening"
                  ? "text-indigo-400"
                  : "text-neutral-400"
            }
          >
            {activationState.detectorState}
          </span>
        </div>
      </div>
    </motion.div>
  )
})
