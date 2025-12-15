"use client"

import { springs } from "@/animations"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

export interface MetronomeOrbProps {
  readonly bpm: number | null
  readonly isActive: boolean
  readonly size?: "sm" | "md" | "lg"
  readonly onPulse?: () => void
}

const sizeClasses = {
  sm: "w-10 h-10",
  md: "w-14 h-14",
  lg: "w-20 h-20",
}

const domeSizes = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
}

const RING_COUNT = 3

export const MetronomeOrb = memo(function MetronomeOrb({
  bpm,
  isActive,
  size = "md",
  onPulse,
}: MetronomeOrbProps) {
  const [pulseKey, setPulseKey] = useState(0)
  const onPulseRef = useRef(onPulse)

  useEffect(() => {
    onPulseRef.current = onPulse
  }, [onPulse])

  const triggerPulse = useCallback(() => {
    setPulseKey(k => k + 1)
    onPulseRef.current?.()
  }, [])

  useEffect(() => {
    if (!isActive || bpm === null || bpm <= 0) return

    const intervalMs = 60000 / bpm
    const intervalId = setInterval(triggerPulse, intervalMs)

    triggerPulse()

    return () => clearInterval(intervalId)
  }, [isActive, bpm, triggerPulse])

  const rings = useMemo(() => {
    return Array.from({ length: RING_COUNT }, (_, i) => i)
  }, [])

  const isDormant = !isActive || bpm === null

  return (
    <div
      className={`relative flex items-center justify-center ${sizeClasses[size]}`}
      role="img"
      aria-label={isDormant ? "Metronome inactive" : `Metronome running at ${bpm} beats per minute`}
    >
      <div
        className={`
          absolute inset-0 rounded-full
          transition-colors duration-300
          ${isDormant ? "bg-neutral-800" : "bg-indigo-500/20"}
        `}
      />

      <AnimatePresence>
        {!isDormant && (
          <motion.div
            key={`glow-${pulseKey}`}
            className="absolute inset-[-2px] rounded-full bg-indigo-500/30 blur-sm"
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={springs.default}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isDormant &&
          rings.map(ringIndex => (
            <motion.div
              key={`ring-${ringIndex}-${pulseKey}`}
              className="absolute inset-0 rounded-full border-2 border-indigo-500"
              initial={{ scale: 1, opacity: 0.5 - ringIndex * 0.1 }}
              animate={{ scale: 1.5 + ringIndex * 0.3, opacity: 0 }}
              transition={{
                ...springs.default,
                delay: ringIndex * 0.05,
              }}
            />
          ))}
      </AnimatePresence>

      <motion.div
        className={`
          rounded-full
          ${domeSizes[size]}
          ${isDormant ? "bg-neutral-600" : "bg-indigo-500"}
        `}
        animate={
          !isDormant
            ? {
                scale: [1, 1.3, 1],
              }
            : { scale: 1 }
        }
        transition={springs.snap}
        key={`dome-${pulseKey}`}
      />
    </div>
  )
})
