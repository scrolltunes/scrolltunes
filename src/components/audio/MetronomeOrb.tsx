"use client"

import { springs } from "@/animations"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

export interface MetronomeOrbProps {
  readonly bpm: number | null
  readonly isActive: boolean
  readonly size?: "xs" | "sm" | "md" | "lg" | "auto"
  readonly onPulse?: () => void
  readonly children?: React.ReactNode
  readonly className?: string
}

const sizeClasses = {
  xs: "w-5 h-5",
  sm: "w-10 h-10",
  md: "w-14 h-14",
  lg: "w-20 h-20",
  auto: "",
}

const domeSizes = {
  xs: "w-2 h-2",
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  auto: "w-4 h-4",
}

const RING_COUNT = 3

export const MetronomeOrb = memo(function MetronomeOrb({
  bpm,
  isActive,
  size = "md",
  onPulse,
  children,
  className,
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
      className={`relative flex items-center justify-center ${sizeClasses[size]} ${className ?? ""}`}
      role="img"
      aria-label={isDormant ? "Metronome inactive" : `Metronome running at ${bpm} beats per minute`}
    >
      <div
        className="absolute inset-0 rounded-full transition-colors duration-300"
        style={{ background: isDormant ? "var(--color-surface3)" : "var(--color-accent-soft)" }}
      />

      <AnimatePresence>
        {!isDormant && (
          <motion.div
            key={`glow-${pulseKey}`}
            className="absolute inset-[-2px] rounded-full blur-sm"
            style={{ background: "var(--color-accent-glow)" }}
            initial={{ opacity: 0.3, scale: 1 }}
            animate={{ opacity: 0, scale: 1.1 }}
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
              className="absolute inset-0 rounded-full border-2"
              style={{ borderColor: "var(--accent-primary)" }}
              initial={{ scale: 1, opacity: 0.25 - ringIndex * 0.05 }}
              animate={{ scale: 1.3 + ringIndex * 0.2, opacity: 0 }}
              transition={{
                ...springs.default,
                delay: ringIndex * 0.05,
              }}
            />
          ))}
      </AnimatePresence>

      {children ? (
        <motion.div
          className="relative z-10 flex items-center gap-2"
          animate={!isDormant ? { scale: [1, 1.05, 1] } : { scale: 1 }}
          transition={springs.snap}
          key={`content-${pulseKey}`}
        >
          {children}
        </motion.div>
      ) : (
        <motion.div
          className={`rounded-full ${domeSizes[size]}`}
          style={{ background: isDormant ? "var(--color-text-muted)" : "var(--accent-primary)" }}
          animate={!isDormant ? { scale: [1, 1.3, 1] } : { scale: 1 }}
          transition={springs.snap}
          key={`dome-${pulseKey}`}
        />
      )}
    </div>
  )
})
