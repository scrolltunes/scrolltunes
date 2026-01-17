"use client"

import { springs } from "@/animations"
import {
  metronomeStore,
  useMetronome,
  useMetronomeControls,
  usePlayerState,
} from "@/core"
import { soundSystem } from "@/sounds"
import { Metronome } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { MetronomeOrb } from "./MetronomeOrb"

export interface FloatingMetronomeProps {
  readonly bpm: number | null
  readonly position?: "bottom-left" | "bottom-right" | "top-left" | "top-right"
  readonly className?: string
}

const positionClasses = {
  "bottom-left": "bottom-12 left-4",
  "bottom-right": "bottom-12 right-4",
  "top-left": "top-4 left-4",
  "top-right": "top-4 right-4",
}

const popoverPositionClasses = {
  "bottom-left": "bottom-full left-0 mb-2",
  "bottom-right": "bottom-full right-0 mb-2",
  "top-left": "top-full left-0 mt-2",
  "top-right": "top-full right-0 mt-2",
}

export const FloatingMetronome = memo(function FloatingMetronome({
  bpm,
  position = "bottom-left",
  className = "",
}: FloatingMetronomeProps) {
  const [isOpen, setIsOpen] = useState(false)
  const beatCountRef = useRef(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const metronomeState = useMetronome()
  const controls = useMetronomeControls()
  const playerState = usePlayerState()

  // Initialize metronome settings from localStorage on mount
  useEffect(() => {
    metronomeStore.initialize()
  }, [])

  // Close settings when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  // Sync soundSystem volume with metronome store on mount and when volume changes
  useEffect(() => {
    soundSystem.setVolume(metronomeState.volume)
  }, [metronomeState.volume])

  const hasBpm = bpm !== null && bpm > 0

  const handlePulse = useCallback(() => {
    beatCountRef.current += 1
    const isAccent = beatCountRef.current % 4 === 1

    if (metronomeState.volume > 0) {
      soundSystem.playMetronomeTick(isAccent)
    }
  }, [metronomeState.volume])

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = Number.parseFloat(e.target.value)
      controls.setVolume(newVolume)
      soundSystem.setVolume(newVolume)
    },
    [controls],
  )

  const isPlaying = playerState._tag === "Playing"

  const handleToggleMetronome = useCallback(() => {
    if (!hasBpm) return
    if (metronomeState.isRunning) {
      controls.stop()
    } else {
      beatCountRef.current = 0
      controls.start()
    }
  }, [hasBpm, metronomeState.isRunning, controls])

  const isActive = hasBpm && (isPlaying || metronomeState.isRunning)

  useEffect(() => {
    if (isPlaying && hasBpm && bpm !== null) {
      beatCountRef.current = 0
      metronomeStore.setBpm(bpm)
      metronomeStore.start()
    } else if (!isPlaying) {
      metronomeStore.stop()
    }
  }, [isPlaying, hasBpm, bpm])

  return (
    <div
      className={`fixed z-30 ${positionClasses[position]} ${className}`}
      aria-label="Floating metronome"
    >
      <div ref={menuRef} className="relative">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              className={`absolute ${popoverPositionClasses[position]} w-56 rounded-xl border p-3 backdrop-blur-md`}
              style={{
                background: "var(--color-surface2)",
                borderColor: "var(--color-border-strong)",
              }}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={springs.snap}
              aria-label="Metronome settings"
            >
              {/* On/Off Toggle */}
              <div className="pb-3 mb-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <button
                  type="button"
                  onClick={handleToggleMetronome}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background: metronomeState.isRunning ? "var(--accent-primary)" : "var(--color-surface3)",
                    color: metronomeState.isRunning ? "white" : "var(--color-text)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Metronome size={18} weight={metronomeState.isRunning ? "fill" : "regular"} />
                    <span className="text-sm font-medium">
                      {metronomeState.isRunning ? "On" : "Off"}
                    </span>
                  </div>
                  <span className="text-xs">{bpm} BPM</span>
                </button>
              </div>

              {/* Volume Control */}
              <div>
                <div className="mb-2 text-xs font-medium" style={{ color: "var(--color-text)" }}>
                  Volume
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={metronomeState.volume}
                  onChange={handleVolumeChange}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-sm"
                  style={{
                    background: "var(--color-surface3)",
                    accentColor: "var(--accent-primary)",
                  }}
                  aria-label="Metronome volume"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={handleToggleMetronome}
          onContextMenu={e => {
            e.preventDefault()
            setIsOpen(prev => !prev)
          }}
          className="rounded-full p-2 backdrop-blur-sm border opacity-60"
          style={{
            background: "color-mix(in srgb, var(--color-surface1) 90%, transparent)",
            borderColor: "var(--color-border)",
          }}
          aria-label={isActive ? "Stop metronome" : "Start metronome"}
        >
          <MetronomeOrb
            bpm={bpm}
            isActive={isActive}
            size="sm"
            onPulse={handlePulse}
          >
            <Metronome
              size={20}
              weight={isActive ? "fill" : "regular"}
              style={{ opacity: 0.6 }}
            />
          </MetronomeOrb>
        </button>

        <div className="mt-1 text-center text-xs" style={{ color: "var(--color-text)" }}>
          {bpm} BPM
        </div>
      </div>
    </div>
  )
})
