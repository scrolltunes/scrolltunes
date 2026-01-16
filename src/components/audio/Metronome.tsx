"use client"

import { springs } from "@/animations"
import { type MetronomeMode, useMetronome, useMetronomeControls } from "@/core"
import { soundSystem } from "@/sounds"
import { Eye, SpeakerHigh, SpeakerSlash, Waveform } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback, useEffect, useRef } from "react"
import { MetronomeOrb } from "./MetronomeOrb"

export interface MetronomeProps {
  readonly bpm: number | null
  readonly isPlaying?: boolean
  readonly className?: string
}

const modeIcons: Record<MetronomeMode, typeof Waveform> = {
  click: Waveform,
  visual: Eye,
  both: Waveform,
}

const modeLabels: Record<MetronomeMode, string> = {
  click: "Click only",
  visual: "Visual only",
  both: "Click and visual",
}

export const Metronome = memo(function Metronome({
  bpm,
  isPlaying = false,
  className = "",
}: MetronomeProps) {
  const { mode, isMuted, volume, isRunning } = useMetronome()
  const { setMode, setMuted, setVolume, start, stop } = useMetronomeControls()
  const beatCountRef = useRef(0)

  // Sync soundSystem volume with metronome store on mount and when volume changes
  useEffect(() => {
    soundSystem.setVolume(volume)
  }, [volume])

  const handlePulse = useCallback(() => {
    if (mode === "visual" || isMuted) return

    const isAccent = beatCountRef.current % 4 === 0
    beatCountRef.current += 1
    soundSystem.playMetronomeTick(isAccent)
  }, [mode, isMuted])

  const handleModeChange = useCallback(
    (newMode: MetronomeMode) => {
      setMode(newMode)
      beatCountRef.current = 0
    },
    [setMode],
  )

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = Number.parseFloat(e.target.value)
      setVolume(newVolume)
      soundSystem.setVolume(newVolume)
    },
    [setVolume],
  )

  const handleToggleMute = useCallback(() => {
    setMuted(!isMuted)
  }, [isMuted, setMuted])

  const handleOrbClick = useCallback(() => {
    if (isPlaying) return
    if (isRunning) {
      stop()
    } else {
      beatCountRef.current = 0
      start()
    }
  }, [isPlaying, isRunning, start, stop])

  const showVolumeControls = mode !== "visual"
  const isActive = bpm !== null && bpm > 0 && (isPlaying || isRunning)
  const showVisual = mode === "visual" || mode === "both"

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <button
        type="button"
        onClick={handleOrbClick}
        disabled={isPlaying}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-full disabled:cursor-default"
        aria-label={isActive ? "Stop metronome" : "Start metronome"}
      >
        <MetronomeOrb bpm={bpm} isActive={isActive && showVisual} size="md" onPulse={handlePulse} />
      </button>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          {(["click", "visual", "both"] as const).map(modeOption => {
            const Icon = modeIcons[modeOption]
            const isSelected = mode === modeOption

            return (
              <motion.button
                key={modeOption}
                type="button"
                onClick={() => handleModeChange(modeOption)}
                className="p-2 rounded-sm transition-colors focus:outline-none focus-visible:ring-2"
                style={
                  isSelected
                    ? {
                        background: "var(--accent-primary)",
                        color: "var(--bg-primary)",
                      }
                    : {
                        background: "var(--bg-tertiary)",
                        color: "var(--fg-muted)",
                      }
                }
                whileTap={{ scale: 0.95 }}
                transition={springs.snap}
                aria-label={modeLabels[modeOption]}
                aria-pressed={isSelected}
              >
                {modeOption === "both" ? (
                  <div className="flex items-center gap-0.5">
                    <Waveform size={16} weight={isSelected ? "fill" : "regular"} />
                    <Eye size={16} weight={isSelected ? "fill" : "regular"} />
                  </div>
                ) : (
                  <Icon size={18} weight={isSelected ? "fill" : "regular"} />
                )}
              </motion.button>
            )
          })}
        </div>

        {showVolumeControls && (
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={handleToggleMute}
              className="p-1.5 rounded-sm transition-colors focus:outline-none focus-visible:ring-2"
              style={
                isMuted
                  ? { background: "var(--color-danger-soft)", color: "var(--status-error)" }
                  : { background: "var(--bg-tertiary)", color: "var(--fg-muted)" }
              }
              whileTap={{ scale: 0.95 }}
              transition={springs.snap}
              aria-label={isMuted ? "Unmute metronome" : "Mute metronome"}
              aria-pressed={isMuted}
            >
              {isMuted ? (
                <SpeakerSlash size={16} weight="fill" />
              ) : (
                <SpeakerHigh size={16} weight="fill" />
              )}
            </motion.button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              disabled={isMuted}
              className="w-20 h-1.5 rounded-sm appearance-none cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-sm
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:transition-transform
                [&::-webkit-slider-thumb]:hover:scale-110
                [&::-moz-range-thumb]:w-3
                [&::-moz-range-thumb]:h-3
                [&::-moz-range-thumb]:rounded-sm
                [&::-moz-range-thumb]:border-0
                [&::-moz-range-thumb]:cursor-pointer"
              style={{
                background: "var(--bg-tertiary)",
                accentColor: "var(--accent-primary)",
              }}
              aria-label="Metronome volume"
            />
          </div>
        )}
      </div>
    </div>
  )
})
