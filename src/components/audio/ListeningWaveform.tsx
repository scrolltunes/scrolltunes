"use client"

import { motion } from "motion/react"
import { memo } from "react"

export interface ListeningWaveformProps {
  readonly className?: string
}

const BAR_DELAYS = [0, 0.15, 0.3, 0.1] as const

export const ListeningWaveform = memo(function ListeningWaveform({
  className = "",
}: ListeningWaveformProps) {
  return (
    <div
      className={`flex items-center justify-center gap-0.5 ${className}`}
      aria-hidden="true"
    >
      {BAR_DELAYS.map((delay, i) => (
        <motion.div
          key={i}
          className="w-0.5 rounded-full bg-indigo-400"
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
