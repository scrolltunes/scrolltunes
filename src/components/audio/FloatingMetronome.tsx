"use client"

import { springs } from "@/animations"
import { MAX_SCROLL_SPEED, MIN_SCROLL_SPEED } from "@/constants"
import {
  type MetronomeMode,
  lyricsPlayer,
  metronomeStore,
  useMetronome,
  useMetronomeControls,
  usePlayerState,
} from "@/core"
import { soundSystem } from "@/sounds"
import { Minus, Plus } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { MetronomeOrb } from "./MetronomeOrb"

const DEFAULT_MANUAL_BPM = 120
const MIN_BPM = 40
const MAX_BPM = 240
const BPM_STEP = 5

function bpmToScrollSpeed(bpm: number): number {
  const ratio = bpm / DEFAULT_MANUAL_BPM
  return Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, ratio))
}

export interface FloatingMetronomeProps {
  readonly bpm: number | null
  readonly position?: "bottom-left" | "bottom-right" | "top-left" | "top-right"
  readonly className?: string
}

const positionClasses = {
  "bottom-left": "bottom-24 left-4",
  "bottom-right": "bottom-24 right-4",
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
  const [manualBpm, setManualBpm] = useState<number | null>(null)
  const beatCountRef = useRef(0)
  const metronomeState = useMetronome()
  const controls = useMetronomeControls()
  const playerState = usePlayerState()

  // Initialize metronome settings from localStorage on mount
  useEffect(() => {
    metronomeStore.initialize()
  }, [])

  // Sync soundSystem volume with metronome store on mount and when volume changes
  useEffect(() => {
    soundSystem.setVolume(metronomeState.volume)
  }, [metronomeState.volume])

  const hasApiBpm = bpm !== null && bpm > 0
  const effectiveBpm = hasApiBpm ? bpm : manualBpm

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
      const newVolume = Number.parseFloat(e.target.value)
      controls.setVolume(newVolume)
      soundSystem.setVolume(newVolume)
    },
    [controls],
  )

  const handleIncreaseBpm = useCallback(() => {
    if (hasApiBpm) return
    const current = manualBpm ?? DEFAULT_MANUAL_BPM
    const next = Math.min(MAX_BPM, current + BPM_STEP)
    setManualBpm(next)
    metronomeStore.setBpm(next)
    lyricsPlayer.setScrollSpeed(bpmToScrollSpeed(next))
  }, [hasApiBpm, manualBpm])

  const handleDecreaseBpm = useCallback(() => {
    if (hasApiBpm) return
    const current = manualBpm ?? DEFAULT_MANUAL_BPM
    const next = Math.max(MIN_BPM, current - BPM_STEP)
    setManualBpm(next)
    metronomeStore.setBpm(next)
    lyricsPlayer.setScrollSpeed(bpmToScrollSpeed(next))
  }, [hasApiBpm, manualBpm])

  const isPlaying = playerState._tag === "Playing"

  const hasBpm = effectiveBpm !== null && effectiveBpm > 0

  const handleToggleMetronome = useCallback(() => {
    if (isPlaying || !hasBpm) return
    if (metronomeState.isRunning) {
      controls.stop()
    } else {
      beatCountRef.current = 0
      controls.start()
    }
  }, [isPlaying, hasBpm, metronomeState.isRunning, controls])

  const isActive =
    effectiveBpm !== null && effectiveBpm > 0 && (isPlaying || metronomeState.isRunning)

  useEffect(() => {
    if (isPlaying && hasBpm && effectiveBpm !== null) {
      beatCountRef.current = 0
      metronomeStore.setBpm(effectiveBpm)
      metronomeStore.start()
    } else if (!isPlaying) {
      metronomeStore.stop()
    }
  }, [isPlaying, hasBpm, effectiveBpm])

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
              className={`absolute ${popoverPositionClasses[position]} w-48 rounded-sm border p-3 backdrop-blur-sm`}
              style={{
                background: "color-mix(in srgb, var(--color-surface1) 95%, transparent)",
                borderColor: "var(--color-border-strong)",
              }}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={springs.snap}
              aria-label="Metronome settings"
            >
              <div className="mb-3">
                <div className="mb-1.5 text-xs" style={{ color: "var(--color-text3)" }}>
                  Mode
                </div>
                <div className="flex gap-1">
                  {(["click", "visual", "both"] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleModeChange(mode)}
                      className="flex-1 rounded-sm px-2 py-1 text-xs transition-colors"
                      style={
                        metronomeState.mode === mode
                          ? { background: "var(--accent-primary)", color: "var(--bg-primary)" }
                          : { background: "var(--color-surface3)", color: "var(--color-text2)" }
                      }
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
                  className="w-full rounded-sm px-2 py-1.5 text-xs transition-colors"
                  style={
                    metronomeState.isMuted
                      ? { background: "var(--color-danger-soft)", color: "var(--status-error)" }
                      : { background: "var(--color-surface3)", color: "var(--color-text2)" }
                  }
                  aria-pressed={metronomeState.isMuted}
                >
                  {metronomeState.isMuted ? "Unmute" : "Mute"}
                </button>
              </div>

              {showVolumeSlider && (
                <div>
                  <div className="mb-1.5 text-xs" style={{ color: "var(--color-text3)" }}>
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
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1">
          {!hasApiBpm && (
            <button
              type="button"
              onClick={handleDecreaseBpm}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors border"
              style={{
                background: "var(--color-surface3)",
                borderColor: "var(--color-border)",
              }}
              aria-label="Decrease tempo"
            >
              <Minus size={14} weight="bold" style={{ color: "var(--color-text2)" }} />
            </button>
          )}

          <button
            type="button"
            onClick={isPlaying ? handleOrbClick : handleToggleMetronome}
            onContextMenu={e => {
              e.preventDefault()
              setIsOpen(prev => !prev)
            }}
            className="rounded-full p-2 backdrop-blur-sm border"
            style={{
              background: "color-mix(in srgb, var(--color-surface1) 90%, transparent)",
              borderColor: "var(--color-border)",
            }}
            aria-label={
              isPlaying
                ? `Metronome settings${effectiveBpm !== null ? `, ${effectiveBpm} BPM` : ""}`
                : isActive
                  ? "Stop metronome"
                  : "Start metronome"
            }
            aria-expanded={isOpen}
          >
            <MetronomeOrb bpm={effectiveBpm} isActive={isActive} size="sm" onPulse={handlePulse} />
          </button>

          {!hasApiBpm && (
            <button
              type="button"
              onClick={handleIncreaseBpm}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors border"
              style={{
                background: "var(--color-surface3)",
                borderColor: "var(--color-border)",
              }}
              aria-label="Increase tempo"
            >
              <Plus size={14} weight="bold" style={{ color: "var(--color-text2)" }} />
            </button>
          )}
        </div>

        <div className="mt-1 text-center text-xs" style={{ color: "var(--color-text3)" }}>
          {effectiveBpm !== null ? `${effectiveBpm} BPM` : "Set tempo"}
        </div>
      </div>
    </div>
  )
})
