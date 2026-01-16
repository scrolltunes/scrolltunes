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

  // Color based on probability using Tokyo Night tokens
  const getColorStyle = (p: number) => {
    if (p >= 0.9) return { color: "var(--status-success)" }
    if (p >= 0.6) return { color: "var(--status-warning)" }
    if (p >= 0.3) return { color: "#ff9e64" } // Tokyo Night orange
    return { color: "var(--status-error)" }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="fixed bottom-20 left-4 z-50 font-mono text-xs px-3 py-2 rounded-sm backdrop-blur-sm"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-default)" }}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-muted)" }}>Singing:</span>
          <span style={getColorStyle(pSinging)}>{(pSinging * 100).toFixed(0)}%</span>
          <motion.div
            className="h-1 rounded-sm w-16"
            style={{ overflow: "hidden", background: "var(--bg-tertiary)" }}
          >
            <motion.div
              className="h-full"
              style={{
                background:
                  pSinging >= 0.9
                    ? "var(--status-success)"
                    : pSinging >= 0.6
                      ? "var(--status-warning)"
                      : "var(--status-error)",
              }}
              animate={{ width: `${pSinging * 100}%` }}
              transition={{ duration: 0.1 }}
            />
          </motion.div>
        </div>
        {pSpeech !== undefined && (
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--fg-muted)" }}>Speech:</span>
            <span style={{ color: "var(--fg-secondary)" }}>{(pSpeech * 100).toFixed(0)}%</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-muted)" }}>State:</span>
          <span
            style={{
              color: activationState.isSinging
                ? "var(--status-success)"
                : activationState.detectorState === "listening"
                  ? "var(--accent-primary)"
                  : "var(--fg-muted)",
            }}
          >
            {activationState.detectorState}
          </span>
        </div>
      </div>
    </motion.div>
  )
})
