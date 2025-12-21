"use client"

import { motion } from "motion/react"
import { memo } from "react"

export interface ListeningWaveformProps {
  readonly className?: string
  readonly variant?: "listening" | "processing"
}

const BAR_DELAYS = [0, 0.15, 0.3, 0.1] as const

export const ListeningWaveform = memo(function ListeningWaveform({
  className = "",
  variant = "listening",
}: ListeningWaveformProps) {
  const barColor = variant === "processing" ? "bg-emerald-400" : "bg-indigo-400"

  return (
    <div className={`flex items-center justify-center gap-0.5 ${className}`} aria-hidden="true">
      {BAR_DELAYS.map((delay, i) => (
        <motion.div
          key={i}
          className={`w-0.5 rounded-full ${barColor}`}
          initial={{ height: 4 }}
          animate={{
            height: [4, 14, 6, 12, 4],
          }}
          transition={{
            duration: 1,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
            delay,
          }}
        />
      ))}
    </div>
  )
})
