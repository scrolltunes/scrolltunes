"use client"

import { springs } from "@/animations"
import {
  type MetronomeMode,
  metronomeStore,
  useMetronome,
  useMetronomeControls,
  usePlayerState,
} from "@/core"
import { soundSystem } from "@/sounds"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { MetronomeOrb } from "./MetronomeOrb"

export interface FloatingMetronomeProps {
  readonly bpm: number | null
  readonly position?: "bottom-left" | "bottom-right" | "top-left" | "top-right"
  readonly className?: string
}

const positionClasses = {
  "bottom-left": "bottom-14 left-4",
  "bottom-right": "bottom-14 right-4",
  "top-left": "top-4 left-4",
  "top-right": "top-4 right-4",
}

const popoverPositionClasses = {
  "bottom-left": "bottom-full left-0 mb-2",
  "bottom-right": "bottom-full right-0 mb-2",
  "top-left": "top-full left-0 mt-2",
  "top-right": "top-full right-0 mt-2",
}

const modeLabels: Record<MetronomeMode, string> = {
  click: "Click",
  visual: "Visual",
  both: "Both",
}

export const FloatingMetronome = memo(function FloatingMetronome({
  bpm,
  position = "bottom-left",
  className = "",
}: FloatingMetronomeProps) {
  const [isOpen, setIsOpen] = useState(false)
  const beatCountRef = useRef(0)
  const metronomeState = useMetronome()
  const controls = useMetronomeControls()
  const playerState = usePlayerState()

  const handlePulse = useCallback(() => {
    beatCountRef.current += 1
    const isAccent = beatCountRef.current % 4 === 1

    if (metronomeState.mode !== "visual" && !metronomeState.isMuted) {
      soundSystem.playMetronomeTick(isAccent)
    }
  }, [metronomeState.mode, metronomeState.isMuted])

  const handleOrbClick = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const handleModeChange = useCallback(
    (mode: MetronomeMode) => {
      controls.setMode(mode)
    },
    [controls],
  )

  const handleMuteToggle = useCallback(() => {
    controls.setMuted(!metronomeState.isMuted)
  }, [controls, metronomeState.isMuted])

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      controls.setVolume(Number.parseFloat(e.target.value))
    },
    [controls],
  )

  const isPlaying = playerState._tag === "Playing"

  const hasBpm = bpm !== null && bpm > 0

  const handleToggleMetronome = useCallback(() => {
    if (isPlaying || !hasBpm) return
    if (metronomeState.isRunning) {
      controls.stop()
    } else {
      beatCountRef.current = 0
      controls.start()
    }
  }, [isPlaying, hasBpm, metronomeState.isRunning, controls])

  const isActive = bpm !== null && bpm > 0 && (isPlaying || metronomeState.isRunning)

  useEffect(() => {
    if (isPlaying && hasBpm) {
      beatCountRef.current = 0
      metronomeStore.start()
    } else {
      metronomeStore.stop()
    }
  }, [isPlaying, hasBpm])

  const showVolumeSlider = metronomeState.mode !== "visual"

  return (
    <div
      className={`fixed z-30 ${positionClasses[position]} ${className}`}
      aria-label="Floating metronome"
    >
      <div className="relative">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              className={`absolute ${popoverPositionClasses[position]} w-48 rounded-lg border border-neutral-700 bg-neutral-900/90 p-3 backdrop-blur-sm`}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={springs.snap}
              aria-label="Metronome settings"
            >
              <div className="mb-3">
                <div className="mb-1.5 text-xs text-neutral-400">Mode</div>
                <div className="flex gap-1">
                  {(["click", "visual", "both"] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleModeChange(mode)}
                      className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${
                        metronomeState.mode === mode
                          ? "bg-indigo-500 text-white"
                          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                      }`}
                      aria-pressed={metronomeState.mode === mode}
                    >
                      {modeLabels[mode]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <button
                  type="button"
                  onClick={handleMuteToggle}
                  className={`w-full rounded px-2 py-1.5 text-xs transition-colors ${
                    metronomeState.isMuted
                      ? "bg-red-500/20 text-red-400"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                  }`}
                  aria-pressed={metronomeState.isMuted}
                >
                  {metronomeState.isMuted ? "Unmute" : "Mute"}
                </button>
              </div>

              {showVolumeSlider && (
                <div>
                  <div className="mb-1.5 text-xs text-neutral-400">Volume</div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={metronomeState.volume}
                    onChange={handleVolumeChange}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-neutral-700 accent-indigo-500"
                    aria-label="Metronome volume"
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={isPlaying ? handleOrbClick : handleToggleMetronome}
          onContextMenu={e => {
            e.preventDefault()
            setIsOpen(prev => !prev)
          }}
          className="rounded-full bg-neutral-900/80 p-2 backdrop-blur-sm border border-neutral-700/50"
          aria-label={
            isPlaying
              ? `Metronome settings${bpm !== null ? `, ${bpm} BPM` : ""}`
              : isActive
                ? "Stop metronome"
                : "Start metronome"
          }
          aria-expanded={isOpen}
        >
          <MetronomeOrb bpm={bpm} isActive={isActive} size="sm" onPulse={handlePulse} />
        </button>

        <div className="mt-1 text-center text-xs text-neutral-400">
          {bpm !== null ? `${bpm} BPM` : "No BPM"}
        </div>
      </div>
    </div>
  )
})
