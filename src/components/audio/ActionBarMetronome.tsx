"use client"

import {
  type MetronomeMode,
  metronomeStore,
  useMetronome,
  useMetronomeControls,
  usePlayerState,
} from "@/core"
import { soundSystem } from "@/sounds"
import { CaretDown, CircleNotch, Metronome, SpeakerHigh, SpeakerSimpleHigh, SpeakerX } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { MetronomeOrb } from "./MetronomeOrb"

export interface ActionBarMetronomeProps {
  readonly bpm: number | null
}

const modeLabels: Partial<Record<MetronomeMode, string>> = {
  click: "Click",
  visual: "Pulse",
}

/**
 * Dropdown metronome button for the action bar
 * - Click to open dropdown with controls
 * - Toggle metronome on/off, change mode, adjust volume
 */
export const ActionBarMetronome = memo(function ActionBarMetronome({
  bpm,
}: ActionBarMetronomeProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [userDisabledThisSession, setUserDisabledThisSession] = useState(false)
  const beatCountRef = useRef(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const metronomeState = useMetronome()
  const controls = useMetronomeControls()
  const playerState = usePlayerState()

  const hasBpm = bpm !== null && bpm > 0
  const isPlaying = playerState._tag === "Playing"

  useEffect(() => {
    metronomeStore.initialize()
  }, [])

  useEffect(() => {
    soundSystem.setVolume(metronomeState.volume)
  }, [metronomeState.volume])

  // Set BPM when it changes
  useEffect(() => {
    if (hasBpm && bpm !== null) {
      metronomeStore.setBpm(bpm)
    }
  }, [hasBpm, bpm])

  // Auto-start when playback begins (unless user disabled it this session)
  useEffect(() => {
    if (isPlaying && hasBpm && !userDisabledThisSession) {
      beatCountRef.current = 0
      metronomeStore.start()
    } else if (!isPlaying) {
      metronomeStore.stop()
      // Reset flag when playback stops so it auto-starts on next play
      setUserDisabledThisSession(false)
    }
  }, [isPlaying, hasBpm, userDisabledThisSession])

  // Close dropdown when clicking outside
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

  // Play metronome tick sound at BPM interval
  useEffect(() => {
    if (!metronomeState.isRunning || !hasBpm || bpm === null) return
    if (metronomeState.mode === "visual" || metronomeState.isMuted) return

    const intervalMs = 60000 / bpm

    const tick = () => {
      beatCountRef.current += 1
      const isAccent = beatCountRef.current % 4 === 1
      soundSystem.playMetronomeTick(isAccent)
    }

    // Play first tick immediately
    tick()

    const intervalId = setInterval(tick, intervalMs)
    return () => clearInterval(intervalId)
  }, [metronomeState.isRunning, metronomeState.mode, metronomeState.isMuted, hasBpm, bpm])

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const handleToggleMetronome = useCallback(() => {
    if (metronomeState.isRunning) {
      controls.stop()
      setUserDisabledThisSession(true)
    } else {
      beatCountRef.current = 0
      setUserDisabledThisSession(false)
      controls.start()
    }
  }, [metronomeState.isRunning, controls])

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

  const isActive = hasBpm && metronomeState.isRunning
  const showVolumeSlider = metronomeState.mode !== "visual"

  if (!hasBpm) {
    return null
  }

  return (
    <div ref={menuRef} className="relative flex items-center gap-2">
      {/* Orb - toggles metronome */}
      <button
        type="button"
        onClick={handleToggleMetronome}
        className="select-none"
        style={{ color: metronomeState.isRunning ? "var(--color-accent)" : "var(--color-text3)" }}
        aria-label={`${metronomeState.isRunning ? "Stop" : "Start"} metronome at ${bpm} BPM`}
      >
        <MetronomeOrb
          bpm={bpm}
          isActive={isActive}
          size="auto"
          className="px-3 py-2 rounded-full"
        >
          <Metronome
            size={20}
            weight={metronomeState.isRunning ? "fill" : "regular"}
          />
          <span className="text-xs font-medium">
            {bpm}
          </span>
        </MetronomeOrb>
      </button>

      {/* Caret - opens dropdown */}
      <button
        type="button"
        onClick={handleToggle}
        className="select-none p-1 -ml-1"
        style={{ color: metronomeState.isRunning ? "var(--color-accent)" : "var(--color-text3)" }}
        aria-label="Metronome settings"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <CaretDown size={12} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-lg overflow-hidden z-50"
            style={{
              background: "var(--color-surface2)",
              border: "1px solid var(--color-border-strong)",
            }}
          >
            {/* On/Off Toggle */}
            <div className="p-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <button
                type="button"
                onClick={handleToggleMetronome}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
                style={{
                  background: metronomeState.isRunning ? "var(--color-accent-soft)" : "var(--color-surface3)",
                  color: metronomeState.isRunning ? "var(--color-accent)" : "var(--color-text2)",
                }}
              >
                <div className="flex items-center gap-2">
                  <Metronome size={18} weight={metronomeState.isRunning ? "fill" : "regular"} />
                  <span className="text-sm font-medium">
                    {metronomeState.isRunning ? "On" : "Off"}
                  </span>
                </div>
                <span className="text-xs opacity-60">{bpm} BPM</span>
              </button>
            </div>

            {/* Mode Selection */}
            <div className="p-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="mb-2 text-xs font-medium" style={{ color: "var(--color-text3)" }}>
                Mode
              </div>
              <div className="flex gap-1">
                {(["click", "visual"] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleModeChange(mode)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
                    style={
                      metronomeState.mode === mode
                        ? { background: "var(--accent-primary)", color: "white" }
                        : { background: "var(--color-surface3)", color: "var(--color-text2)" }
                    }
                    aria-pressed={metronomeState.mode === mode}
                  >
                    {mode === "click" ? <SpeakerSimpleHigh size={14} /> : <CircleNotch size={14} />}
                    {modeLabels[mode]}
                  </button>
                ))}
              </div>
            </div>

            {/* Volume Control */}
            {showVolumeSlider && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium" style={{ color: "var(--color-text3)" }}>
                    Volume
                  </div>
                  <button
                    type="button"
                    onClick={handleMuteToggle}
                    className="p-1 rounded transition-colors hover:bg-white/10"
                    style={{
                      color: metronomeState.isMuted ? "var(--status-error)" : "var(--color-text3)",
                    }}
                    aria-label={metronomeState.isMuted ? "Unmute" : "Mute"}
                  >
                    {metronomeState.isMuted ? <SpeakerX size={16} /> : <SpeakerHigh size={16} />}
                  </button>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={metronomeState.isMuted ? 0 : metronomeState.volume}
                  onChange={handleVolumeChange}
                  disabled={metronomeState.isMuted}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-sm disabled:opacity-50"
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
    </div>
  )
})
