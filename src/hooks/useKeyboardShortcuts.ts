"use client"

import { usePlayerControls, usePlayerState } from "@/core"
import { useEffect } from "react"

export interface UseKeyboardShortcutsOptions {
  readonly enabled?: boolean
  readonly seekAmount?: number
  readonly tempoStep?: number
}

const PRESET_TEMPOS: Record<string, number> = {
  "1": 0.75,
  "2": 1.0,
  "3": 1.25,
  "4": 1.5,
}

export function useKeyboardShortcuts(options?: UseKeyboardShortcutsOptions): void {
  const { enabled = true, seekAmount = 5, tempoStep = 0.1 } = options ?? {}
  const state = usePlayerState()
  const { play, pause, reset, seek, setScrollSpeed, getScrollSpeed } = usePlayerControls()

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      switch (event.key) {
        case " ": {
          event.preventDefault()
          if (state._tag === "Playing") {
            pause()
          } else if (
            state._tag === "Ready" ||
            state._tag === "Paused" ||
            state._tag === "Completed"
          ) {
            play()
          }
          break
        }
        case "r":
        case "R": {
          // Only reset on plain "r" key, not with modifiers (cmd+r, cmd+shift+r for browser reload)
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            event.preventDefault()
            reset()
          }
          break
        }
        case "ArrowLeft": {
          event.preventDefault()
          if (state._tag === "Playing" || state._tag === "Paused") {
            const newTime = Math.max(0, state.currentTime - seekAmount)
            seek(newTime)
          }
          break
        }
        case "ArrowRight": {
          event.preventDefault()
          if (state._tag === "Playing" || state._tag === "Paused") {
            const lyrics = state.lyrics
            const newTime = Math.min(lyrics.duration, state.currentTime + seekAmount)
            seek(newTime)
          }
          break
        }
        case "ArrowUp": {
          event.preventDefault()
          const currentSpeed = getScrollSpeed()
          setScrollSpeed(currentSpeed + tempoStep)
          break
        }
        case "ArrowDown": {
          event.preventDefault()
          const currentSpeed = getScrollSpeed()
          setScrollSpeed(currentSpeed - tempoStep)
          break
        }
        case "1":
        case "2":
        case "3":
        case "4": {
          event.preventDefault()
          const preset = PRESET_TEMPOS[event.key]
          if (preset !== undefined) {
            setScrollSpeed(preset)
          }
          break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    enabled,
    state,
    seekAmount,
    tempoStep,
    play,
    pause,
    reset,
    seek,
    setScrollSpeed,
    getScrollSpeed,
  ])
}
