"use client"

import { motion } from "motion/react"
import { memo } from "react"

interface AmbientOrbProps {
  readonly color: string
  readonly size: number
  readonly x: string
  readonly y: string
  readonly duration: number
  readonly delay?: number
}

const AmbientOrb = memo(function AmbientOrb({
  color,
  size,
  x,
  y,
  duration,
  delay = 0,
}: AmbientOrbProps) {
  return (
    <motion.div
      className="absolute rounded-full blur-3xl pointer-events-none"
      style={{
        width: size,
        height: size,
        background: color,
        left: x,
        top: y,
      }}
      animate={{
        x: [0, 30, -20, 10, 0],
        y: [0, -20, 30, -10, 0],
        scale: [1, 1.1, 0.95, 1.05, 1],
      }}
      transition={{
        duration,
        delay,
        repeat: Number.POSITIVE_INFINITY,
        ease: "easeInOut",
      }}
    />
  )
})

export interface AmbientBackgroundProps {
  readonly variant?: "default" | "subtle" | "vibrant"
  readonly className?: string
}

export const AmbientBackground = memo(function AmbientBackground({
  variant = "default",
  className = "",
}: AmbientBackgroundProps) {
  const opacityMap = {
    subtle: 0.08,
    default: 0.12,
    vibrant: 0.18,
  }
  const opacity = opacityMap[variant]

  return (
    <div
      className={`fixed inset-0 overflow-hidden pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {/* Primary accent orb - Tokyo Night blue */}
      <AmbientOrb
        color={`rgba(122, 162, 247, ${opacity})`}
        size={600}
        x="-10%"
        y="-20%"
        duration={25}
      />

      {/* Secondary orb - Tokyo Night magenta */}
      <AmbientOrb
        color={`rgba(187, 154, 247, ${opacity * 0.7})`}
        size={500}
        x="70%"
        y="60%"
        duration={30}
        delay={5}
      />

      {/* Tertiary orb - Tokyo Night cyan */}
      <AmbientOrb
        color={`rgba(125, 207, 255, ${opacity * 0.5})`}
        size={400}
        x="40%"
        y="30%"
        duration={20}
        delay={10}
      />

      {/* Ambient gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 20% -10%, rgba(122, 162, 247, ${opacity * 0.8}), transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 110%, rgba(187, 154, 247, ${opacity * 0.4}), transparent 45%)
          `,
        }}
      />
    </div>
  )
})

export default AmbientBackground
