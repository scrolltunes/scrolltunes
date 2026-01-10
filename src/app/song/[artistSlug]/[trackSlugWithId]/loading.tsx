"use client"

import { AmbientBackground } from "@/components/ui"
import { SpinnerGap } from "@phosphor-icons/react"
import { motion } from "motion/react"

export default function SongLoading() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <AmbientBackground variant="subtle" />
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
      >
        <SpinnerGap size={48} style={{ color: "var(--color-accent)" }} />
      </motion.div>
      <p style={{ color: "var(--color-text3)" }}>Loading lyrics...</p>
    </div>
  )
}
